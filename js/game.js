// 朗読チャレンジ画面（お題・採点・記録）

(function ($) {
  "use strict";

  var COUNTDOWN_SEC = 3;                      // 開始前のカウント
  var sessionPhase = "idle";                  // idle / countdown / running
  var sessionMode = "challenge";              // challenge / record
  var sessionChallengeRecord = false;         // 今回のチャレンジを録音するか
  var sessionSamples = [];                    // 採点用の声データ
  var sessionAudioRecorded = false;           // 音声も録れたか
  var comparePlaying = false;                 // 録音再生中か
  var comparePlayTimerId = null;              // 波形再生タイマー
  var compareAudioEl = null;                  // 再生用 audio
  var compareAudioUrl = "";                   // オブジェクト URL
  var comparePlayStartMs = 0;                 // 再生開始時刻
  var sessionStartMs = 0;                     // 本番開始時刻
  var countdownTimerId = null;                // カウントダウン用
  var sessionTimerId = null;                  // 制限時間用
  var uiTickId = null;                        // 残り秒表示用
  var selectedPromptId = "";                  // 表示中のお題

  var $monitorPanel = $("#monitorPanel");
  var $gamePanel = $("#gamePanel");
  var $gamePlayPanel = $("#gamePlayPanel");
  var $gamePromptsPanel = $("#gamePromptsPanel");
  var $gameScoresPanel = $("#gameScoresPanel");
  var $tabMonitor = $("#tabMonitor");
  var $tabGame = $("#tabGame");
  var $tabGamePlay = $("#tabGamePlay");
  var $tabGamePrompts = $("#tabGamePrompts");
  var $tabGameScores = $("#tabGameScores");
  var $gameSessionBadge = $("#gameSessionBadge");
  var $lblPromptText = $("#lblPromptText");
  var $lblBestScore = $("#lblBestScore");
  var $lblRecordStatus = $("#lblRecordStatus");
  var $lblRefLegend = $("#lblRefLegend");
  var $chkScoreFromRecord = $("#chkScoreFromRecord");
  var $chkRecordChallenge = $("#chkRecordChallenge");
  var $btnRecordReference = $("#btnRecordReference");
  var $btnDeleteReference = $("#btnDeleteReference");
  var $lblCompareStatus = $("#lblCompareStatus");
  var $btnComparePlay = $("#btnComparePlay");
  var $btnCompareStopPlay = $("#btnCompareStopPlay");
  var $btnCompareDelete = $("#btnCompareDelete");
  var $btnRandomPrompt = $("#btnRandomPrompt");
  var $btnStartGame = $("#btnStartGame");
  var $btnStopGame = $("#btnStopGame");
  var $lblGameTimer = $("#lblGameTimer");
  var $lblGameStatus = $("#lblGameStatus");
  var $gameResult = $("#gameResult");
  var $lblGameRank = $("#lblGameRank");
  var $lblGameTotal = $("#lblGameTotal");
  var $lblGameBreakdown = $("#lblGameBreakdown");
  var $txtNewPrompt = $("#txtNewPrompt");
  var $btnAddPrompt = $("#btnAddPrompt");
  var $promptList = $("#promptList");
  var $scoreHistoryList = $("#scoreHistoryList");
  var $lblScoreHistoryEmpty = $("#lblScoreHistoryEmpty");
  var $btnClearScoreHistory = $("#btnClearScoreHistory");


  // ======================================================================================
  //チャレンジ中か
  // ======================================================================================
  function isSessionBusy() {
    return sessionPhase === "countdown" || sessionPhase === "running" || comparePlaying;
  }


  // ======================================================================================
  //朗読画面のグラフを描き直す（表示直後はレイアウト待ち）
  // ======================================================================================
  function refreshGameGraphSoon() {
    if (!window.VoiceAppBridge || !VoiceAppBridge.refreshGraph) return;
    VoiceAppBridge.refreshGraph();
    requestAnimationFrame(function () {
      VoiceAppBridge.refreshGraph();
    });
  }


  // ======================================================================================
  //メインタブ切り替え
  // ======================================================================================
  function showMonitorPanel() {
    $tabMonitor.addClass("active");
    $tabGame.removeClass("active");
    $monitorPanel.removeClass("d-none");
    $gamePanel.addClass("d-none");
    if (window.VoiceAppBridge && VoiceAppBridge.refreshGraph) {
      VoiceAppBridge.refreshGraph();
    }
  }


  function showGamePanel() {
    $tabGame.addClass("active");
    $tabMonitor.removeClass("active");
    $gamePanel.removeClass("d-none");
    $monitorPanel.addClass("d-none");
    showGamePlayPanel();
    pickRandomPrompt("");
    refreshPromptList();
    refreshGameGraphSoon();
  }


  // ======================================================================================
  //朗読チャレンジ内タブ（チャレンジ / お題 / 点数記録）
  // ======================================================================================
  function showGamePlayPanel() {
    $tabGamePlay.addClass("active");
    $tabGamePrompts.removeClass("active");
    $tabGameScores.removeClass("active");
    $gamePlayPanel.removeClass("d-none");
    $gamePromptsPanel.addClass("d-none");
    $gameScoresPanel.addClass("d-none");
    refreshGameGraphSoon();
  }


  function showGamePromptsPanel() {
    if (isSessionBusy()) return;
    $tabGamePrompts.addClass("active");
    $tabGamePlay.removeClass("active");
    $tabGameScores.removeClass("active");
    $gamePromptsPanel.removeClass("d-none");
    $gamePlayPanel.addClass("d-none");
    $gameScoresPanel.addClass("d-none");
    refreshPromptList();
  }


  function showGameScoresPanel() {
    if (isSessionBusy()) return;
    $tabGameScores.addClass("active");
    $tabGamePlay.removeClass("active");
    $tabGamePrompts.removeClass("active");
    $gameScoresPanel.removeClass("d-none");
    $gamePlayPanel.addClass("d-none");
    $gamePromptsPanel.addClass("d-none");
    refreshScoreHistoryList();
  }


  // ======================================================================================
  //お題をランダムに選ぶ
  // ======================================================================================
  function pickRandomPrompt(excludeId) {
    var list = GamePrompts.getAll();
    if (!list.length) {
      selectedPromptId = "";
      updatePromptTextLabel();
      updateBestScoreLabel();
      return;
    }
    if (list.length === 1) {
      selectedPromptId = list[0].id;
    } else {
      var candidates = [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].id !== excludeId) {
          candidates.push(list[i]);
        }
      }
      if (!candidates.length) {
        candidates = list;
      }
      selectedPromptId = candidates[Math.floor(Math.random() * candidates.length)].id;
    }
    updatePromptTextLabel();
    updateBestScoreLabel();
    updateRecordStatusUI();
    updateCompareStatusUI();
    $gameResult.addClass("d-none");
    syncReferenceOverlay("preview");
  }


  // ======================================================================================
  //模範で採点するか
  // ======================================================================================
  function isScoreFromRecordEnabled() {
    return $chkScoreFromRecord.is(":checked");
  }


  // ======================================================================================
  //チャレンジを録音するか
  // ======================================================================================
  function isRecordChallengeEnabled() {
    return $chkRecordChallenge.is(":checked");
  }


  // ======================================================================================
  //模範波形の記録状態を画面に反映
  // ======================================================================================
  function updateRecordStatusUI() {
    var hasRecorded = GameReference.hasRecorded(selectedPromptId);
    $lblRecordStatus.text(hasRecorded ? "模範：記録済み" : "模範：未記録");
    $btnDeleteReference.prop("disabled", !hasRecorded || isSessionBusy());
    updateGraphLegend();

    if (!hasRecorded && isScoreFromRecordEnabled()) {
      $chkScoreFromRecord.prop("checked", false);
      AppSettings.saveReadingScoreFromRecord(false);
    }
    $chkScoreFromRecord.prop("disabled", isSessionBusy());
  }


  // ======================================================================================
  //目安波形をグラフに渡す
  // ======================================================================================
  function syncReferenceOverlay(mode, sessionStartMs) {
    if (!window.VoiceAppBridge || !VoiceAppBridge.setReferenceOverlay) return;

    var item = GamePrompts.getById(selectedPromptId);
    if (!item) {
      VoiceAppBridge.clearReferenceOverlay();
      VoiceAppBridge.refreshGraph();
      return;
    }

    var overlay =
      mode === "session"
        ? GameReference.buildForSession(selectedPromptId, sessionStartMs)
        : GameReference.buildPreview(selectedPromptId);

    if (overlay) {
      VoiceAppBridge.setReferenceOverlay(overlay);
    } else {
      VoiceAppBridge.clearReferenceOverlay();
    }
    VoiceAppBridge.refreshGraph();
  }


  // ======================================================================================
  //保存済み録音波形をプレビュー表示
  // ======================================================================================
  function syncCompareOverlayPreview() {
    if (!window.VoiceAppBridge || !VoiceAppBridge.setCompareOverlay) return;
    if (comparePlaying || isSessionBusy()) return;

    if (CompareStore.hasTake(selectedPromptId)) {
      VoiceAppBridge.setCompareOverlay(
        CompareStore.buildOverlay(selectedPromptId, null)
      );
    } else {
      VoiceAppBridge.clearCompareOverlay();
    }
    VoiceAppBridge.refreshGraph();
  }


  // ======================================================================================
  //録音比較の状態を画面に反映
  // ======================================================================================
  function updateCompareStatusUI() {
    var hasTake = CompareStore.hasTake(selectedPromptId);
    var take = CompareStore.getTake(selectedPromptId);
    if (!hasTake) {
      $lblCompareStatus.text("録音：なし");
    } else if (take && take.hasAudio) {
      $lblCompareStatus.text("録音：あり（音声・波形）");
    } else {
      $lblCompareStatus.text("録音：あり（波形のみ）");
    }

    var busy = isSessionBusy();
    $btnComparePlay.prop("disabled", !hasTake || busy);
    $btnCompareStopPlay.prop("disabled", !comparePlaying);
    $btnCompareDelete.prop("disabled", !hasTake || busy);

    syncCompareOverlayPreview();
    updateGraphLegend();
  }


  // ======================================================================================
  //グラフの凡例を更新
  // ======================================================================================
  function updateGraphLegend() {
    var parts = [];
    if (GameReference.hasRecorded(selectedPromptId)) {
      parts.push("緑の点線：模範");
    }
    if (CompareStore.hasTake(selectedPromptId)) {
      parts.push("橙の点線：録音");
    }
    $lblRefLegend.text(parts.join("　"));
    $lblRefLegend.toggleClass("d-none", !parts.length);
  }


  // ======================================================================================
  //お題一覧（削除ボタン付き）を更新
  // ======================================================================================
  function refreshPromptList() {
    var list = GamePrompts.getAll();
    $promptList.empty();
    var i;
    for (i = 0; i < list.length; i++) {
      (function (item) {
        var $row = $("<div>").addClass("game-prompt-row d-flex gap-2 align-items-start");
        var $textWrap = $("<div>").addClass("flex-grow-1");
        if (GameReference.hasRecorded(item.id)) {
          $textWrap.append(
            $("<span>").addClass("badge text-bg-success me-1 game-prompt-record-badge").text("模範")
          );
        }
        if (CompareStore.hasTake(item.id)) {
          $textWrap.append(
            $("<span>").addClass("badge text-bg-warning me-1 game-prompt-record-badge").text("録音")
          );
        }
        $textWrap.append($("<span>").addClass("game-prompt-text").text(item.text));
        var $btn = $("<button>")
          .attr("type", "button")
          .addClass("btn btn-outline-danger btn-sm game-prompt-delete app-touch-btn")
          .text("削除");
        $btn.on("click", function () {
          if (isSessionBusy()) return;
          if (GamePrompts.getAll().length <= 1) {
            alert("お題は最低1つ必要です。");
            return;
          }
          if (!window.confirm("このお題を削除しますか？\n\n" + item.text)) return;
          var wasCurrent = selectedPromptId === item.id;
          GameReference.removeRecorded(item.id);
          CompareStore.removeTake(item.id);
          GameScoreHistory.removeByPromptId(item.id);
          GamePrompts.remove(item.id);
          refreshPromptList();
          refreshScoreHistoryList();
          if (wasCurrent) {
            pickRandomPrompt("");
          } else {
            updateBestScoreLabel();
            updateRecordStatusUI();
          }
        });
        $row.append($textWrap, $btn);
        $promptList.append($row);
      })(list[i]);
    }
  }


  // ======================================================================================
  //点数記録一覧を更新
  // ======================================================================================
  function refreshScoreHistoryList() {
    var history = GameScoreHistory.getAll();
    $scoreHistoryList.empty();
    if (!history.length) {
      $lblScoreHistoryEmpty.removeClass("d-none");
      return;
    }
    $lblScoreHistoryEmpty.addClass("d-none");
    var i;
    for (i = 0; i < history.length; i++) {
      (function (entry) {
        var $row = $("<div>").addClass("game-score-history-row");
        var modeLabel = entry.scoreMode === "record" ? "模範採点" : "通常採点";
        $row.append(
          $("<div>")
            .addClass("game-score-history-meta")
            .text(
              GameScoreHistory.formatDateTime(entry.at) +
              "　" + entry.rank + "　" + entry.total + "点　" + modeLabel
            )
        );
        $row.append(
          $("<div>")
            .addClass("game-score-history-prompt")
            .text(entry.promptText || "（お題なし）")
        );
        $row.append(
          $("<div>")
            .addClass("game-score-history-detail")
            .text(GameScoreHistory.breakdownLabel(entry))
        );
        $scoreHistoryList.append($row);
      })(history[i]);
    }
  }


  // ======================================================================================
  //選んだお題の全文を表示
  // ======================================================================================
  function updatePromptTextLabel() {
    var item = GamePrompts.getById(selectedPromptId);
    if (!item) {
      $lblPromptText.text("お題がありません。「お題の追加・削除」から追加してください。");
      if (window.VoiceAppBridge) {
        VoiceAppBridge.clearReferenceOverlay();
        VoiceAppBridge.refreshGraph();
      }
      return;
    }
    $lblPromptText.text(item.text);
  }


  function getSelectedPromptText() {
    var item = GamePrompts.getById(selectedPromptId);
    return item ? item.text : "";
  }


  // ======================================================================================
  //ベスト記録を表示
  // ======================================================================================
  function updateBestScoreLabel() {
    if (!selectedPromptId) {
      $lblBestScore.text("ベスト：—");
      return;
    }
    var scores = AppSettings.loadReadingGameScores();
    var best = scores[selectedPromptId];
    if (!best) {
      $lblBestScore.text("ベスト：—");
      return;
    }
    $lblBestScore.text(
      "ベスト：" + best.rank + "（" + best.total + "点）"
    );
  }


  // ======================================================================================
  //開始状態バッジを更新
  // ======================================================================================
  function updateSessionBadge(phase) {
    $gameSessionBadge.removeClass(
      "game-session-idle game-session-countdown game-session-running"
    );
    $gamePlayPanel.removeClass("game-session-countdown game-session-running");

    if (phase === "countdown") {
      $gameSessionBadge
        .addClass("game-session-countdown")
        .text("開始準備中");
      $gamePlayPanel.addClass("game-session-countdown");
      return;
    }
    if (phase === "running") {
      $gameSessionBadge
        .addClass("game-session-running")
        .text(sessionMode === "record" ? "記録中" : "チャレンジ中");
      $gamePlayPanel.addClass("game-session-running");
      return;
    }
    $gameSessionBadge.addClass("game-session-idle").text("待機中");
  }


  // ======================================================================================
  //採点中の UI を切り替え
  // ======================================================================================
  function setSessionPhase(phase) {
    sessionPhase = phase;
    var busy = isSessionBusy();

    updateSessionBadge(phase);
    $btnStartGame.prop("disabled", busy);
    $btnStopGame.prop("disabled", !busy);
    $btnRandomPrompt.prop("disabled", busy);
    $btnRecordReference.prop("disabled", busy);
    $tabGamePrompts.prop("disabled", busy);
    $tabGameScores.prop("disabled", busy);
    $txtNewPrompt.prop("disabled", busy);
    $btnAddPrompt.prop("disabled", busy);
    $btnClearScoreHistory.prop("disabled", busy);
    $chkScoreFromRecord.prop("disabled", busy);
    $chkRecordChallenge.prop("disabled", busy);
    $promptList.find(".game-prompt-delete").prop("disabled", busy);
    updateRecordStatusUI();
    updateCompareStatusUI();

    if (phase === "idle") {
      $lblGameStatus.text("");
      $lblGameTimer.text("").removeClass("game-timer-active game-timer-countdown");
    }
  }


  // ======================================================================================
  //残り秒を表示
  // ======================================================================================
  function updateTimerLabel() {
    if (sessionPhase !== "running") return;

    var elapsed = Date.now() - sessionStartMs;
    var remain = Math.max(0, GameScore.SESSION_MS - elapsed);
    var sec = Math.ceil(remain / 1000);
    $lblGameTimer.text("残り " + sec + " 秒");
  }


  // ======================================================================================
  //結果を画面に出す
  // ======================================================================================
  function showResult(result) {
    $gameResult.removeClass("d-none");
    $lblGameRank.text(result.rank);
    $lblGameRank.attr("data-rank", result.rank);
    $lblGameTotal.text(result.total + " 点");
    if (result.scoreMode === "record") {
      $lblGameBreakdown.text(
        "一致 " + result.intonation + "　" +
        "タイミング " + result.rhythm + "　" +
        "安定 " + result.stability
      );
      return;
    }
    $lblGameBreakdown.text(
      "抑揚 " + result.intonation + "　" +
      "リズム " + result.rhythm + "　" +
      "安定 " + result.stability
    );
  }


  // ======================================================================================
  //ベスト記録を保存
  // ======================================================================================
  function saveBestScore(promptId, result) {
    var scores = AppSettings.loadReadingGameScores();
    var prev = scores[promptId];
    if (!prev || result.total > prev.total) {
      scores[promptId] = {
        total: result.total,
        rank: result.rank,
        at: Date.now()
      };
      AppSettings.saveReadingGameScores(scores);
    }
  }


  // ======================================================================================
  //ベストと履歴を保存
  // ======================================================================================
  function saveChallengeScore(promptId, promptText, result) {
    saveBestScore(promptId, result);
    GameScoreHistory.addEntry(promptId, promptText, result);
    refreshScoreHistoryList();
  }


  // ======================================================================================
  //タイマーを全部止める
  // ======================================================================================
  function clearSessionTimers() {
    if (countdownTimerId) {
      clearTimeout(countdownTimerId);
      countdownTimerId = null;
    }
    if (sessionTimerId) {
      clearTimeout(sessionTimerId);
      sessionTimerId = null;
    }
    if (uiTickId) {
      clearInterval(uiTickId);
      uiTickId = null;
    }
  }


  // ======================================================================================
  //録音比較の再生を止める
  // ======================================================================================
  function stopComparePlayback() {
    if (comparePlayTimerId) {
      clearInterval(comparePlayTimerId);
      comparePlayTimerId = null;
    }
    if (compareAudioEl) {
      compareAudioEl.pause();
      compareAudioEl = null;
    }
    if (compareAudioUrl) {
      URL.revokeObjectURL(compareAudioUrl);
      compareAudioUrl = "";
    }
    comparePlaying = false;
    if (window.VoiceAppBridge) {
      VoiceAppBridge.setCompareReplayActive(false);
      VoiceAppBridge.clearCompareOverlay();
    }
    updateCompareStatusUI();
    syncReferenceOverlay("preview");
  }


  // ======================================================================================
  //録音比較を再生
  // ======================================================================================
  function startComparePlayback() {
    if (comparePlaying || isSessionBusy()) return;
    if (!CompareStore.hasTake(selectedPromptId)) return;

    var take = CompareStore.getTake(selectedPromptId);
    if (!take) return;

    comparePlaying = true;
    comparePlayStartMs = Date.now();
    updateCompareStatusUI();
    syncReferenceOverlay("preview");
    VoiceAppBridge.setCompareReplayActive(true);
    $lblGameStatus.text("録音を再生しています…");

    CompareStore.loadAudio(selectedPromptId, function (blob) {
      if (blob) {
        compareAudioUrl = URL.createObjectURL(blob);
        compareAudioEl = new Audio(compareAudioUrl);
        compareAudioEl.play();
        compareAudioEl.onended = function () {
          stopComparePlayback();
        };
      }

      comparePlayTimerId = setInterval(function () {
        var elapsed = Date.now() - comparePlayStartMs;
        VoiceAppBridge.setCompareOverlay(
          CompareStore.buildOverlay(selectedPromptId, elapsed)
        );
        VoiceAppBridge.refreshGraph();
        if (elapsed >= take.durationMs) {
          stopComparePlayback();
          $lblGameStatus.text("再生が完了しました。");
        }
      }, 50);
    });
  }


  // ======================================================================================
  //チャレンジの録音を保存
  // ======================================================================================
  function saveChallengeRecording(elapsed, onDone) {
    VoiceAppBridge.stopAudioRecording(function (blob) {
      var saveResult = CompareStore.saveFromSamples(
        selectedPromptId,
        sessionSamples,
        sessionStartMs,
        elapsed,
        !!blob
      );
      if (!saveResult.ok) {
        alert(saveResult.message);
        if (onDone) onDone();
        return;
      }
      if (blob) {
        CompareStore.saveAudio(selectedPromptId, blob, function () {
          if (onDone) onDone(true);
        });
        return;
      }
      if (onDone) onDone(true);
    });
  }


  // ======================================================================================
  //セッションを終了して採点
  // ======================================================================================
  function finishSession() {
    if (sessionPhase === "idle") return;

    var wasRunning = sessionPhase === "running";
    var finishedMode = sessionMode;
    var shouldSaveChallengeRecord =
      wasRunning && finishedMode === "challenge" && sessionChallengeRecord;
    clearSessionTimers();
    setSessionPhase("idle");
    sessionMode = "challenge";
    sessionChallengeRecord = false;
    VoiceAppBridge.onPitchSample = null;

    if (!wasRunning) {
      $lblGameTimer.text("");
      $lblGameStatus.text("");
      syncReferenceOverlay("preview");
      updateRecordStatusUI();
      updateCompareStatusUI();
      return;
    }

    if (finishedMode === "record") {
      var elapsedRecord = Date.now() - sessionStartMs;
      var saveResult = GameReference.saveFromSamples(
        selectedPromptId,
        sessionSamples,
        sessionStartMs,
        elapsedRecord
      );
      if (saveResult.ok) {
        alert("模範を保存しました。");
        $lblGameStatus.text("模範を保存しました。");
      } else {
        alert(saveResult.message);
      }
      syncReferenceOverlay("preview");
      updateRecordStatusUI();
      refreshPromptList();
      return;
    }

    var elapsed = Date.now() - sessionStartMs;

    function afterChallengeDone(recordSaved) {
      syncReferenceOverlay("preview");
      updateCompareStatusUI();
      updateGraphLegend();
      if (recordSaved) {
        refreshPromptList();
      }
    }

    if (shouldSaveChallengeRecord) {
      saveChallengeRecording(elapsed, function (recordSaved) {
        var useRecord = isScoreFromRecordEnabled();
        var stored = useRecord ? GameReference.getStored(selectedPromptId) : null;
        var result = GameScore.scoreSession(sessionSamples, elapsed, {
          useRecordedReference: useRecord && !!stored,
          storedReference: stored,
          sessionStartMs: sessionStartMs
        });
        if (!result.ok) {
          $gameResult.addClass("d-none");
          alert(result.message);
          afterChallengeDone(recordSaved);
          return;
        }
        showResult(result);
        saveChallengeScore(selectedPromptId, getSelectedPromptText(), result);
        updateBestScoreLabel();
        $lblGameStatus.text(
          recordSaved
            ? "採点が完了しました。録音を保存しました。"
            : "採点が完了しました。"
        );
        afterChallengeDone(recordSaved);
      });
      return;
    }

    var useRecord = isScoreFromRecordEnabled();
    var stored = useRecord ? GameReference.getStored(selectedPromptId) : null;
    var result = GameScore.scoreSession(sessionSamples, elapsed, {
      useRecordedReference: useRecord && !!stored,
      storedReference: stored,
      sessionStartMs: sessionStartMs
    });
    if (!result.ok) {
      $gameResult.addClass("d-none");
      alert(result.message);
      return;
    }

    showResult(result);
    saveChallengeScore(selectedPromptId, getSelectedPromptText(), result);
    updateBestScoreLabel();
    $lblGameStatus.text("採点が完了しました。");
    syncReferenceOverlay("preview");
  }


  // ======================================================================================
  //カウントダウン後に本番開始
  // ======================================================================================
  function beginSessionAfterCountdown() {
    sessionSamples = [];
    sessionStartMs = Date.now();
    sessionAudioRecorded = false;
    setSessionPhase("running");
    $gameResult.addClass("d-none");
    $lblGameStatus.text("お題を読んでください。");
    if (sessionMode === "record") {
      $lblGameStatus.text("お題を読んで、模範波形を記録してください。");
    }
    if (sessionMode === "challenge" && sessionChallengeRecord) {
      VoiceAppBridge.clearCompareOverlay();
      sessionAudioRecorded = VoiceAppBridge.startAudioRecording();
    }
    $lblGameTimer.addClass("game-timer-active").removeClass("game-timer-countdown");
    syncReferenceOverlay("session", sessionStartMs);

    VoiceAppBridge.onPitchSample = function (point) {
      if (sessionPhase !== "running") return;
      sessionSamples.push({
        timeMs: point.timeMs,
        octave: point.octave,
        hz: point.hz,
        voiced: point.voiced
      });
    };

    uiTickId = setInterval(updateTimerLabel, 200);
    updateTimerLabel();

    sessionTimerId = setTimeout(function () {
      finishSession();
    }, GameScore.SESSION_MS);
  }


  // ======================================================================================
  //カウントダウンを開始（チャレンジ / 記録）
  // ======================================================================================
  function startCountdown(mode) {
    sessionMode = mode;
    sessionChallengeRecord = mode === "challenge" && isRecordChallengeEnabled();
    sessionStartMs = 0;
    setSessionPhase("countdown");
    $gameResult.addClass("d-none");
    $lblGameStatus.text(mode === "record" ? "記録開始まで…" : "開始まで…");
    $lblGameTimer.addClass("game-timer-countdown").removeClass("game-timer-active");
    $lblGameTimer.text(COUNTDOWN_SEC + "…");

    var left = COUNTDOWN_SEC;
    function tickCountdown() {
      left -= 1;
      if (left > 0) {
        $lblGameTimer.text(left + "…");
        countdownTimerId = setTimeout(tickCountdown, 1000);
        return;
      }
      beginSessionAfterCountdown();
    }
    countdownTimerId = setTimeout(tickCountdown, 1000);
  }


  // ======================================================================================
  //開始前の共通チェック
  // ======================================================================================
  function validateBeforeSession() {
    if (!VoiceAppBridge.hasBaseline()) {
      alert(
        "基準 Hz が未設定です。\n「ピッチ確認」タブで基準を設定してから挑戦してください。"
      );
      return false;
    }
    if (!VoiceAppBridge.isCaptureActive()) {
      alert("マイクが開始されていません。マイクを選んでから挑戦してください。");
      return false;
    }
    if (!selectedPromptId || !GamePrompts.getById(selectedPromptId)) {
      pickRandomPrompt("");
      if (!selectedPromptId) {
        alert("お題がありません。「お題の追加・削除」から追加してください。");
        return false;
      }
    }
    return true;
  }


  // ======================================================================================
  //チャレンジ開始
  // ======================================================================================
  function startSession() {
    if (isSessionBusy()) return;
    if (!validateBeforeSession()) return;

    if (isScoreFromRecordEnabled() && !GameReference.hasRecorded(selectedPromptId)) {
      alert(
        "「模範で採点する」がオンですが、このお題には模範がありません。\n" +
          "先に「模範波形を記録」するか、チェックを外してください。"
      );
      return;
    }

    if (
      isRecordChallengeEnabled() &&
      CompareStore.hasTake(selectedPromptId) &&
      !window.confirm("すでに録音があります。今回のチャレンジで上書きしますか？")
    ) {
      return;
    }

    startCountdown("challenge");
  }


  // ======================================================================================
  //模範波形を記録
  // ======================================================================================
  function startRecordingSession() {
    if (isSessionBusy()) return;
    if (!validateBeforeSession()) return;

    if (
      GameReference.hasRecorded(selectedPromptId) &&
      !window.confirm("すでに模範があります。上書きして記録しますか？")
    ) {
      return;
    }

    startCountdown("record");
  }


  // ======================================================================================
  //比較用録音を削除
  // ======================================================================================
  function deleteCompareTake() {
    if (isSessionBusy()) return;
    if (!CompareStore.hasTake(selectedPromptId)) return;
    if (!window.confirm("このお題の録音を削除しますか？")) return;

    CompareStore.removeTake(selectedPromptId);
    updateCompareStatusUI();
    updateGraphLegend();
    refreshPromptList();
  }


  // ======================================================================================
  //記録を削除
  // ======================================================================================
  function deleteRecordedReference() {
    if (isSessionBusy()) return;
    if (!GameReference.hasRecorded(selectedPromptId)) return;
    if (!window.confirm("このお題の模範を削除しますか？")) return;

    GameReference.removeRecorded(selectedPromptId);
    updateRecordStatusUI();
    syncReferenceOverlay("preview");
    refreshPromptList();
  }


  // ======================================================================================
  //ページ読み込み完了
  // ======================================================================================
  $(function () {
    $chkScoreFromRecord.prop("checked", AppSettings.loadReadingScoreFromRecord());
    $chkRecordChallenge.prop("checked", AppSettings.loadReadingRecordOnChallenge());
    pickRandomPrompt("");
    refreshPromptList();
    refreshScoreHistoryList();
    setSessionPhase("idle");

    $tabMonitor.on("click", function () {
      if (comparePlaying) {
        stopComparePlayback();
      }
      if (sessionPhase !== "idle") {
        if (!window.confirm("採点中です。ピッチ確認に移ると中断されます。よろしいですか？")) {
          return;
        }
        finishSession();
      }
      showMonitorPanel();
    });

    $tabGame.on("click", function () {
      showGamePanel();
    });

    $tabGamePlay.on("click", function () {
      showGamePlayPanel();
    });

    $tabGamePrompts.on("click", function () {
      showGamePromptsPanel();
    });

    $tabGameScores.on("click", function () {
      showGameScoresPanel();
    });

    $btnClearScoreHistory.on("click", function () {
      if (isSessionBusy()) return;
      if (!GameScoreHistory.getAll().length) return;
      if (!window.confirm("点数記録をすべて削除しますか？")) return;
      GameScoreHistory.clearAll();
      refreshScoreHistoryList();
    });

    $btnRandomPrompt.on("click", function () {
      if (isSessionBusy()) return;
      pickRandomPrompt(selectedPromptId);
    });

    $btnStartGame.on("click", startSession);
    $btnStopGame.on("click", finishSession);
    $btnRecordReference.on("click", startRecordingSession);
    $btnDeleteReference.on("click", deleteRecordedReference);
    $btnComparePlay.on("click", startComparePlayback);
    $btnCompareStopPlay.on("click", stopComparePlayback);
    $btnCompareDelete.on("click", deleteCompareTake);

    $chkScoreFromRecord.on("change", function () {
      if (isSessionBusy()) return;
      var enabled = $chkScoreFromRecord.is(":checked");
      if (enabled && !GameReference.hasRecorded(selectedPromptId)) {
        $chkScoreFromRecord.prop("checked", false);
        alert("このお題には模範がありません。先に「模範波形を記録」してください。");
        return;
      }
      AppSettings.saveReadingScoreFromRecord(enabled);
    });

    $chkRecordChallenge.on("change", function () {
      if (isSessionBusy()) return;
      AppSettings.saveReadingRecordOnChallenge($chkRecordChallenge.is(":checked"));
    });

    $btnAddPrompt.on("click", function () {
      if (isSessionBusy()) return;
      var text = $txtNewPrompt.val();
      var item = GamePrompts.add(text);
      if (!item) {
        alert("お題の文を入力してください。");
        return;
      }
      $txtNewPrompt.val("");
      refreshPromptList();
      selectedPromptId = item.id;
      updatePromptTextLabel();
      updateBestScoreLabel();
      updateRecordStatusUI();
      syncReferenceOverlay("preview");
      showGamePlayPanel();
    });

    $txtNewPrompt.on("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $btnAddPrompt.click();
      }
    });
  });
})(jQuery);
