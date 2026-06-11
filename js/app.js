// voice_manager Web 版メイン

(function ($) {
  "use strict";

  // 定数 --------------------------------------------------------------------------
  var SAMPLE_RATE = 44100;                    // マイクのサンプリングレート
  var SMOOTH_COEFF = 0.72;                    // Hz の移動平均係数（小さいほど変化に追従）
  var MAX_SAMPLES_HOLD = 16384;               // 音のデータをためる最大数（解析窓8192に合わせて拡大）
  var MAX_OCTAVE_HISTORY = 900;               // 安全のために保持する最大点数
  var GRAPH_HISTORY_MS = VoiceConstants.GRAPH_TIME_WINDOW_SECONDS * 1000;  // グラフに残す時間
  var HP_ALPHA = 0.992;                       // 低い音を取り除く係数（カフェの低音対策）
  var LP_ALPHA = 0.8;                         // 高い音を少し丸める係数
  var MEDIAN_WINDOW = 3;                      // 飛び値を消す窓の幅
  var LEARN_FRAMES_COUNT = 38;                // 周囲の音を学習するフレーム数
  var NOISE_GATE_FACTOR = 2.5;                // 雑音しきい値の倍率（小さいほど声を拾いやすい）
  var AUTO_NOISE_LEARN_RATE = 0.03;           // 無音時に雑音レベルを追いかける速さ
  var AUDIO_BUFFER_SIZE = 2048;               // マイク1回分のサンプル数（小さいほど更新が速い）

  // マイク・音声処理 ----------------------------------------------------------------
  var audioContext = null;                    // 音声処理の本体
  var mediaStream = null;                     // マイクからの入力
  var mediaRecorder = null;                   // 比較用の音声録音
  var audioRecordChunks = [];                 // 録音データの断片
  var scriptNode = null;                      // 音声データを受け取るノード
  var sourceNode = null;                      // マイク入力のソース

  var sampleBuffer = [];                      // 直近の音のデータ
  var octaveHistory = [];                     // 描画用：時刻つきのオクターブ履歴
  var recentRawHz = [];                       // 飛び値を消すための直近 Hz

  var hpPrevX = 0;                            // 低い音除去用の前回入力
  var hpPrevY = 0;                            // 低い音除去用の前回出力
  var lpPrevY = 0;                            // 高い音除去用の前回出力

  // 基準・目標 --------------------------------------------------------------------
  var hasBaseline = false;                    // 基準の高さを覚えたか
  var baselineHz = 0;                         // 基準 Hz
  var latestHzSmooth = 0;                     // 表示用の滑らかな Hz
  var latestHzRaw = 0;                        // 生の Hz

  var hasTargetOctave = false;                // 目標オクターブを設定したか
  var targetOctave = 0;                       // 目標オクターブ
  var targetEnabled = true;                   // 目標線を表示するか

  // 周囲の音を学習 ----------------------------------------------------------------
  var noiseFloorEnergy = 0;                   // 学習した雑音レベル
  var dynamicNoiseEnergy = 0;                 // 無音時に自動で追いかける雑音レベル
  var learnFramesRemaining = 0;               // 学習残りフレーム数
  var learnEnergySum = 0;                     // 学習中のエネルギー合計
  var learnJustFinished = false;              // 学習が今終わった目印

  // タイマー・状態 ----------------------------------------------------------------
  var uiTimerId = null;                       // 画面更新タイマー
  var captureActive = false;                  // マイク取得中か

  var baselineTextProgrammatic = false;       // 基準 Hz をプログラムから書き換え中
  var targetTextProgrammatic = false;         // 目標をプログラムから書き換え中
  var targetCheckProgrammatic = false;        // チェックをプログラムから書き換え中

  // 画面部品 -----------------------------------------------------------------------
  var $lblSubtitle = $("#lblSubtitle");
  var $cboDevice = $("#cboDevice");
  var $btnSetBaseline = $("#btnSetBaseline");
  var $btnLearnNoise = $("#btnLearnNoise");
  var $txtBaselineHz = $("#txtBaselineHz");
  var $txtTargetOctave = $("#txtTargetOctave");
  var $chkTargetEnabled = $("#chkTargetEnabled");
  var $lblPitch = $("#lblPitch");
  var $graphHint = $("#graphHint");
  var $graphHintGame = $("#graphHintGame");
  var canvas = document.getElementById("picPitch");
  var canvasGame = document.getElementById("picPitchGame");


  // ======================================================================================
  //飛び値を消す（メディアンフィルタ）
  // ======================================================================================
  function applyMedianFilter(value) {
    recentRawHz.push(value);
    while (recentRawHz.length > MEDIAN_WINDOW) {
      recentRawHz.shift();
    }
    if (recentRawHz.length < MEDIAN_WINDOW) return value;
    var sorted = recentRawHz.slice().sort(function (a, b) {
      return a - b;
    });
    return sorted[Math.floor(sorted.length / 2)];
  }


  // ======================================================================================
  //基準 Hz から何オクターブずれたかを計算
  // ======================================================================================
  function computeOctaveShift(freq, baseline) {
    return Math.log(Math.max(freq, 1e-6) / Math.max(baseline, 1e-6)) / Math.LN2;
  }


  // ======================================================================================
  //カフェ向けの軽い音声前処理
  // ======================================================================================
  function filterVoiceSample(raw) {
    var high = HP_ALPHA * (hpPrevY + raw - hpPrevX);
    hpPrevX = raw;
    hpPrevY = high;

    lpPrevY = LP_ALPHA * lpPrevY + (1.0 - LP_ALPHA) * high;
    return lpPrevY;
  }


  // ======================================================================================
  //無音時の雑音レベルを少しずつ追いかける
  // ======================================================================================
  function updateDynamicNoiseEnergy(energy, hasVoice) {
    if (energy <= 0 || hasVoice) return;

    if (dynamicNoiseEnergy <= 0) {
      dynamicNoiseEnergy = energy;
      return;
    }
    dynamicNoiseEnergy =
      dynamicNoiseEnergy * (1.0 - AUTO_NOISE_LEARN_RATE) +
      energy * AUTO_NOISE_LEARN_RATE;
  }


  // ======================================================================================
  //デモ版制限超過時：操作を全部止める
  // ======================================================================================
  function disableAllControls(expiredSubtitle) {
    stopCapture();
    if (uiTimerId) {
      clearInterval(uiTimerId);
      uiTimerId = null;
    }
    $cboDevice.prop("disabled", true);
    $btnSetBaseline.prop("disabled", true);
    $btnLearnNoise.prop("disabled", true);
    $txtBaselineHz.prop("disabled", true);
    $txtTargetOctave.prop("disabled", true);
    $chkTargetEnabled.prop("disabled", true);
    $lblSubtitle.addClass("expired").text(
      expiredSubtitle ||
        "デモ版の使用可能時間を超えました。開発者に連絡してください。"
    );
    redrawGraph();
  }


  // ======================================================================================
  //マイク取得を停止
  // ======================================================================================
  function stopCapture() {
    captureActive = false;
    if (scriptNode) {
      try {
        scriptNode.disconnect();
      } catch (e) {}
      scriptNode.onaudioprocess = null;
      scriptNode = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (e) {}
      sourceNode = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(function (t) {
        t.stop();
      });
      mediaStream = null;
    }
    stopAudioRecording(null);
  }


  // ======================================================================================
  //比較用の音声録音を開始
  // ======================================================================================
  function startAudioRecording() {
    if (!mediaStream || !window.MediaRecorder) return false;
    try {
      audioRecordChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) {
          audioRecordChunks.push(e.data);
        }
      };
      mediaRecorder.start(250);
      return true;
    } catch (e) {
      mediaRecorder = null;
      audioRecordChunks = [];
      return false;
    }
  }


  // ======================================================================================
  //比較用の音声録音を停止
  // ======================================================================================
  function stopAudioRecording(callback) {
    if (!mediaRecorder) {
      if (callback) callback(null);
      return;
    }
    var recorder = mediaRecorder;
    mediaRecorder = null;
    recorder.onstop = function () {
      var blob = null;
      if (audioRecordChunks.length) {
        blob = new Blob(audioRecordChunks, {
          type: recorder.mimeType || "audio/webm"
        });
      }
      audioRecordChunks = [];
      if (callback) callback(blob);
    };
    try {
      recorder.stop();
    } catch (e) {
      audioRecordChunks = [];
      if (callback) callback(null);
    }
  }


  // ======================================================================================
  //マイクから届いた音のデータを1かたまり処理
  // ======================================================================================
  function processAudioChunk(float32Chunk) {
    var i;

    // 低い音・高すぎる音を軽く削ってバッファにためる----------------------
    for (i = 0; i < float32Chunk.length; i++) {
      var raw = float32Chunk[i];
      var filt = filterVoiceSample(raw);
      sampleBuffer.push(filt);
    }
    while (sampleBuffer.length > MAX_SAMPLES_HOLD) {
      sampleBuffer.shift();
    }

    var currentEnergy = PitchEstimator.computeWindowEnergy(sampleBuffer);

    // 周囲の音を学習中ならエネルギーを集める----------------------------------
    if (learnFramesRemaining > 0) {
      if (currentEnergy > 0) {
        learnEnergySum += currentEnergy;
        learnFramesRemaining -= 1;
        if (learnFramesRemaining === 0) {
          noiseFloorEnergy = learnEnergySum / LEARN_FRAMES_COUNT;
          dynamicNoiseEnergy = noiseFloorEnergy;
          learnJustFinished = true;
        }
      }
    }

    // ピッチを推定してオクターブ履歴に追加----------------------------------
    var learnedNoise = Math.max(noiseFloorEnergy, dynamicNoiseEnergy);
    var gateThreshold = learnedNoise * NOISE_GATE_FACTOR;
    var fRaw = PitchEstimator.estimateFundamental(
      sampleBuffer,
      SAMPLE_RATE,
      50,
      1200,
      gateThreshold
    );
    var f = applyMedianFilter(fRaw);
    latestHzRaw = f;

    var oct = null;
    var voiced = f > 0;
    updateDynamicNoiseEnergy(currentEnergy, voiced);
    if (f <= 0) {
      latestHzSmooth = 0;
    } else {
      if (latestHzSmooth <= 0) {
        latestHzSmooth = f;
      } else {
        latestHzSmooth =
          latestHzSmooth * SMOOTH_COEFF + f * (1.0 - SMOOTH_COEFF);
      }
      if (hasBaseline) {
        oct = computeOctaveShift(latestHzSmooth, baselineHz);
      } else {
        oct = 0;
      }
    }

    var nowMs = Date.now();
    octaveHistory.push({
      timeMs: nowMs,
      octave: oct,
      hz: latestHzSmooth,
      rawHz: f,
      voiced: voiced
    });

    var cutoffMs = nowMs - GRAPH_HISTORY_MS;
    while (octaveHistory.length > 0 && octaveHistory[0].timeMs < cutoffMs) {
      octaveHistory.shift();
    }
    while (octaveHistory.length > MAX_OCTAVE_HISTORY) {
      octaveHistory.shift();
    }

    if (window.VoiceAppBridge && VoiceAppBridge.onPitchSample) {
      VoiceAppBridge.onPitchSample({
        timeMs: nowMs,
        octave: oct,
        hz: latestHzSmooth,
        rawHz: f,
        voiced: voiced
      });
    }
  }


  // ======================================================================================
  //マイク取得を開始
  // ======================================================================================
  async function startCapture(deviceId) {
    if (!TrialLimit.canUseFeatures()) return;
    if (captureActive) return;

    stopCapture();

    try {
      var constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE
      });

      var bufferSize = AUDIO_BUFFER_SIZE;
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

      scriptNode.onaudioprocess = function (e) {
        if (!captureActive) return;
        var input = e.inputBuffer.getChannelData(0);
        processAudioChunk(input);
      };

      // スピーカーからは鳴らさない（モニター出力を止める）----------------------------------
      var mute = audioContext.createGain();
      mute.gain.value = 0;
      sourceNode.connect(scriptNode);
      scriptNode.connect(mute);
      mute.connect(audioContext.destination);
      captureActive = true;
    } catch (err) {
      alert(
        "マイクの開始に失敗しました:\n" +
          (err.message || err) +
          "\n\nマイクの利用許可を確認してください。"
      );
    }
  }


  // ======================================================================================
  //マイク一覧をドロップダウンにセット
  // ======================================================================================
  async function populateDevices() {
    $cboDevice.empty();

    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      $cboDevice.append(
        $("<option>").text("（このブラウザではマイク一覧が使えません）")
      );
      $cboDevice.prop("disabled", true);
      return;
    }

    // マイク名を取得するために一度許可を取る----------------------------------
    try {
      var temp = await navigator.mediaDevices.getUserMedia({ audio: true });
      temp.getTracks().forEach(function (t) {
        t.stop();
      });
    } catch (e) {
      $cboDevice.append($("<option>").text("（マイクの許可が必要です）"));
      $cboDevice.prop("disabled", true);
      $btnSetBaseline.prop("disabled", true);
      $btnLearnNoise.prop("disabled", true);
      return;
    }

    var devices = await navigator.mediaDevices.enumerateDevices();
    var inputs = devices.filter(function (d) {
      return d.kind === "audioinput";
    });

    if (inputs.length === 0) {
      $cboDevice.append($("<option>").text("（マイクが見つかりません）"));
      $cboDevice.prop("disabled", true);
      return;
    }

    // 前回選んだマイクがあればそれを選ぶ----------------------------------
    var preferredName = AppSettings.loadLastDeviceName();
    var preferredIndex = -1;
    var i;
    for (i = 0; i < inputs.length; i++) {
      var d = inputs[i];
      var label = d.label || "マイク " + (i + 1);
      var text = i + ": " + label;
      $cboDevice.append(
        $("<option>").val(d.deviceId).text(text).data("label", label)
      );
      if (
        preferredIndex < 0 &&
        preferredName &&
        label.toLowerCase() === preferredName.toLowerCase()
      ) {
        preferredIndex = i;
      }
    }

    $cboDevice.prop("disabled", false);
    if (preferredIndex >= 0) {
      $cboDevice.prop("selectedIndex", preferredIndex);
    }
  }


  // ======================================================================================
  //選択中のマイク名を取得
  // ======================================================================================
  function getSelectedDeviceName() {
    var opt = $cboDevice.find("option:selected");
    if (!opt.length) return "";
    var label = opt.data("label");
    if (label) return label;
    var text = opt.text();
    var sep = text.indexOf(": ");
    if (sep >= 0) return text.substring(sep + 2);
    return text;
  }


  // ======================================================================================
  //グラフ領域のサイズを合わせる（向き変更・ウィンドウ変更時だけ）
  // ======================================================================================
  function resizeGraphLayout() {
    PitchGraph.resizeCanvasToDisplay(canvas);
    if (canvasGame) {
      PitchGraph.resizeCanvasToDisplay(canvasGame);
    }
  }


  // ======================================================================================
  //グラフを描き直す
  // ======================================================================================
  function redrawGraph() {
    var showTarget = hasTargetOctave && targetEnabled;
    var gameReference = window.VoiceAppBridge
      ? VoiceAppBridge.referenceOverlay
      : null;
    var gameCompare = window.VoiceAppBridge
      ? VoiceAppBridge.compareOverlay
      : null;
    var compareReplayActive = window.VoiceAppBridge
      ? !!VoiceAppBridge.compareReplayActive
      : false;
    var gameHistory = compareReplayActive ? [] : octaveHistory;
    var hasLine = PitchGraph.draw(
      canvas,
      octaveHistory,
      showTarget,
      targetOctave,
      null,
      null,
      false
    );

    var hasGameLine = false;
    if (canvasGame) {
      hasGameLine = PitchGraph.draw(
        canvasGame,
        gameHistory,
        showTarget,
        targetOctave,
        gameReference,
        gameCompare,
        compareReplayActive
      );
    }

    if (hasLine) {
      $graphHint.addClass("hidden");
    } else {
      $graphHint.removeClass("hidden");
    }

    if (hasGameLine || gameReference || gameCompare) {
      $graphHintGame.addClass("hidden");
    } else {
      $graphHintGame.removeClass("hidden");
    }
  }


  // ======================================================================================
  //ピッチ表示ラベルを更新
  // ======================================================================================
  function updatePitchLabel() {
    var hzTxt;
    if (latestHzSmooth > 0) {
      hzTxt =
        latestHzSmooth.toFixed(1) +
        " Hz（生値 " +
        latestHzRaw.toFixed(1) +
        " Hz）";
    } else {
      hzTxt = "ピッチ未定（または無音）";
    }

    var octaveTxt;
    if (!hasBaseline) {
      octaveTxt = "基準ピッチは未設定";
    } else if (latestHzSmooth <= 0) {
      octaveTxt = "--- oct";
    } else {
      var oct = computeOctaveShift(latestHzSmooth, baselineHz);
      octaveTxt = (oct >= 0 ? "+" : "") + oct.toFixed(2) + " oct";
    }

    $lblPitch.text(hzTxt + "　" + octaveTxt);
  }


  // ======================================================================================
  //基準 Hz テキストボックスの入力を確定
  // ======================================================================================
  function tryCommitBaselineText(showMessage) {
    var t = $txtBaselineHz.val().trim();
    if (!t) {
      hasBaseline = false;
      baselineHz = 0;
      AppSettings.saveBaselineHz(0);
      return;
    }
    var hz = parseFloat(t);
    if (isNaN(hz)) {
      if (showMessage) {
        alert("基準の Hz は数字で入力してください（例 220.5）。");
      }
      restoreBaselineTextbox();
      return;
    }
    if (hz < 20 || hz > 4000) {
      if (showMessage) {
        alert("基準の Hz は 20 ～ 4000 の範囲で入力してください。");
      }
      restoreBaselineTextbox();
      return;
    }
    hasBaseline = true;
    baselineHz = hz;
    AppSettings.saveBaselineHz(hz);
    baselineTextProgrammatic = true;
    $txtBaselineHz.val(hz.toFixed(1));
    baselineTextProgrammatic = false;
  }


  // ======================================================================================
  //基準 Hz テキストボックスを保存値に戻す
  // ======================================================================================
  function restoreBaselineTextbox() {
    baselineTextProgrammatic = true;
    if (hasBaseline && baselineHz > 0) {
      $txtBaselineHz.val(baselineHz.toFixed(1));
    } else {
      $txtBaselineHz.val("");
    }
    baselineTextProgrammatic = false;
  }


  // ======================================================================================
  //目標オクターブテキストボックスの入力を確定
  // ======================================================================================
  function tryCommitTargetText(showMessage) {
    var t = $txtTargetOctave.val().trim();
    if (!t) {
      hasTargetOctave = false;
      targetOctave = 0;
      AppSettings.saveTargetOctave(NaN);
      redrawGraph();
      return;
    }
    var oct = parseFloat(t);
    if (isNaN(oct)) {
      if (showMessage) {
        alert("目標は数字で入力してください（例 1.5、-0.5）。");
      }
      restoreTargetTextbox();
      return;
    }
    if (oct < VoiceConstants.OCTAVE_PLOT_MIN || oct > VoiceConstants.OCTAVE_PLOT_MAX) {
      if (showMessage) {
        alert(
          "目標は " +
            VoiceConstants.OCTAVE_PLOT_MIN +
            " ～ +" +
            VoiceConstants.OCTAVE_PLOT_MAX +
            " の範囲で入力してください。"
        );
      }
      restoreTargetTextbox();
      return;
    }
    hasTargetOctave = true;
    targetOctave = oct;
    AppSettings.saveTargetOctave(oct);
    targetTextProgrammatic = true;
    $txtTargetOctave.val(oct.toString());
    targetTextProgrammatic = false;
    redrawGraph();
  }


  // ======================================================================================
  //目標オクターブテキストボックスを保存値に戻す
  // ======================================================================================
  function restoreTargetTextbox() {
    targetTextProgrammatic = true;
    if (hasTargetOctave) {
      $txtTargetOctave.val(targetOctave.toString());
    } else {
      $txtTargetOctave.val("");
    }
    targetTextProgrammatic = false;
  }


  // ======================================================================================
  //保存済みの基準 Hz を画面に反映
  // ======================================================================================
  function loadBaselineFromSettings() {
    var hz = AppSettings.loadBaselineHz();
    if (hz <= 0) return;
    hasBaseline = true;
    baselineHz = hz;
    baselineTextProgrammatic = true;
    $txtBaselineHz.val(hz.toFixed(1));
    baselineTextProgrammatic = false;
  }


  // ======================================================================================
  //保存済みの目標オクターブを画面に反映
  // ======================================================================================
  function loadTargetFromSettings() {
    var oct = AppSettings.loadTargetOctave();
    if (!isNaN(oct)) {
      hasTargetOctave = true;
      targetOctave = oct;
      targetTextProgrammatic = true;
      $txtTargetOctave.val(oct.toString());
      targetTextProgrammatic = false;
    }
    targetEnabled = AppSettings.loadTargetEnabled();
    targetCheckProgrammatic = true;
    $chkTargetEnabled.prop("checked", targetEnabled);
    targetCheckProgrammatic = false;
  }


  // ======================================================================================
  //画面更新タイマー（約30msごと）
  // ======================================================================================
  function uiTimerTick() {
    if (TrialLimit.tickAndCheckExpired(function () {
      disableAllControls();
    })) {
      return;
    }

    // 周囲の音の学習が終わった直後----------------------------------
    if (learnJustFinished) {
      learnJustFinished = false;
      $btnLearnNoise.prop("disabled", false).text("周囲の音を学習");
      $lblSubtitle.text(
        "ピッチ推移（縦：基準からのオクターブ／横：時間）"
      );
      alert(
        "周囲の音を学習しました。\n" +
          "これより明らかに大きい音だけがピッチとして拾われます。\n" +
          "効きが強すぎたり弱すぎたりするときは、もう一度ボタンを押し直してください。"
      );
    }

    updatePitchLabel();
    redrawGraph();
  }


  // ======================================================================================
  //マイク選択が変わったとき
  // ======================================================================================
  function onDeviceChanged() {
    var deviceId = $cboDevice.val();
    AppSettings.saveLastDeviceName(getSelectedDeviceName());

    // バッファと履歴をクリアして取り直す----------------------------------
    sampleBuffer = [];
    octaveHistory = [];
    recentRawHz = [];
    latestHzSmooth = 0;
    latestHzRaw = 0;
    hpPrevX = 0;
    hpPrevY = 0;
    lpPrevY = 0;
    noiseFloorEnergy = 0;
    dynamicNoiseEnergy = 0;
    learnFramesRemaining = 0;
    learnEnergySum = 0;

    if (deviceId) {
      startCapture(deviceId);
    }
  }


  // ======================================================================================
  //ボタンの説明（PC はマウス、スマホは指のタッチ）
  // ======================================================================================
  function initActionButtonTooltips() {
    var nodes = document.querySelectorAll(".app-action-tooltip");
    var i;
    for (i = 0; i < nodes.length; i++) {
      (function (el) {
        var tip = new bootstrap.Tooltip(el, {
          placement: "top",
          trigger: "manual",
          container: "body",
          customClass: "app-action-tooltip-popup"
        });
        var hideTimerId = null;

        function showTip() {
          if (hideTimerId) {
            clearTimeout(hideTimerId);
            hideTimerId = null;
          }
          tip.show();
        }

        function hideTipSoon(delayMs) {
          if (hideTimerId) {
            clearTimeout(hideTimerId);
          }
          hideTimerId = setTimeout(function () {
            tip.hide();
            hideTimerId = null;
          }, delayMs);
        }

        el.addEventListener("mouseenter", showTip);
        el.addEventListener("mouseleave", function () {
          hideTipSoon(0);
        });
        el.addEventListener("focus", showTip);
        el.addEventListener("blur", function () {
          hideTipSoon(0);
        });
        el.addEventListener("touchstart", showTip, { passive: true });
        el.addEventListener("touchend", function () {
          hideTipSoon(1800);
        }, { passive: true });
      })(nodes[i]);
    }
  }


  // ======================================================================================
  //ページ読み込み完了
  // ======================================================================================
  $(function () {
    var demoOk = TrialLimit.tryBeginSession(function () {
      disableAllControls(true);
    });

    loadBaselineFromSettings();
    loadTargetFromSettings();

    populateDevices().then(function () {
      if (demoOk && !$cboDevice.prop("disabled") && $cboDevice.val()) {
        startCapture($cboDevice.val());
      }
    });

    if (demoOk) {
      uiTimerId = setInterval(uiTimerTick, 33);
    }

    initActionButtonTooltips();

    $(window).on("resize orientationchange", function () {
      // 向き変更直後はレイアウトが安定するまで少し待つ----
      setTimeout(function () {
        resizeGraphLayout();
        redrawGraph();
      }, 100);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        setTimeout(function () {
          resizeGraphLayout();
          redrawGraph();
        }, 50);
      });
    }

    $cboDevice.on("change", onDeviceChanged);

    // --------------------------------------------------
    // 今の声で基準を自動取得
    // --------------------------------------------------
    $btnSetBaseline.on("click", function () {
      if (latestHzSmooth <= 0) {
        alert(
          "基準ピッチとして保存できる安定した音声が検出されていません。マイクに向けて話してください。"
        );
        return;
      }
      hasBaseline = true;
      baselineHz = latestHzSmooth;
      AppSettings.saveBaselineHz(baselineHz);
      baselineTextProgrammatic = true;
      $txtBaselineHz.val(baselineHz.toFixed(1));
      baselineTextProgrammatic = false;
      alert("基準を " + baselineHz.toFixed(1) + " Hz として保存しました。");
    });

    // --------------------------------------------------
    // 周囲の音を学習
    // --------------------------------------------------
    $btnLearnNoise.on("click", function () {
      learnFramesRemaining = LEARN_FRAMES_COUNT;
      learnEnergySum = 0;
      noiseFloorEnergy = 0;
      dynamicNoiseEnergy = 0;
      learnJustFinished = false;
      $btnLearnNoise.prop("disabled", true).text("学習中...");
      $lblSubtitle.text(
        "周囲の音を学習しています。話さずに少し待ってください..."
      );
    });

    $txtBaselineHz.on("blur", function () {
      if (baselineTextProgrammatic) return;
      tryCommitBaselineText(true);
    });

    $txtTargetOctave.on("blur", function () {
      if (targetTextProgrammatic) return;
      tryCommitTargetText(true);
    });

    $chkTargetEnabled.on("change", function () {
      if (targetCheckProgrammatic) return;
      targetEnabled = $chkTargetEnabled.is(":checked");
      AppSettings.saveTargetEnabled(targetEnabled);
      redrawGraph();
    });

    $(window).on("beforeunload", function () {
      TrialLimit.flushBeforeClose();
      tryCommitBaselineText(false);
      tryCommitTargetText(false);
      stopCapture();
    });

    resizeGraphLayout();
    redrawGraph();
  });

  window.VoiceAppBridge = {
    hasBaseline: function () {
      return hasBaseline;
    },
    isCaptureActive: function () {
      return captureActive;
    },
    referenceOverlay: null,
    compareOverlay: null,
    compareReplayActive: false,
    setReferenceOverlay: function (overlay) {
      this.referenceOverlay = overlay || null;
    },
    clearReferenceOverlay: function () {
      this.referenceOverlay = null;
    },
    setCompareOverlay: function (overlay) {
      this.compareOverlay = overlay || null;
    },
    clearCompareOverlay: function () {
      this.compareOverlay = null;
    },
    setCompareReplayActive: function (active) {
      this.compareReplayActive = !!active;
    },
    startAudioRecording: function () {
      return startAudioRecording();
    },
    stopAudioRecording: function (callback) {
      stopAudioRecording(callback);
    },
    refreshGraph: function () {
      resizeGraphLayout();
      redrawGraph();
    },
    onPitchSample: null
  };
})(jQuery);
