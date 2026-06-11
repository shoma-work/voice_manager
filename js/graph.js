// オクターブ推移グラフ（Canvas で折れ線を描く）

var PitchGraph = (function () {
  var OCTAVE_PLOT_MAX = VoiceConstants.OCTAVE_PLOT_MAX;
  var OCTAVE_PLOT_MIN = VoiceConstants.OCTAVE_PLOT_MIN;
  var OCTAVE_TICKS = VoiceConstants.getOctaveTicks();
  var GRAPH_WINDOW_MS = VoiceConstants.GRAPH_TIME_WINDOW_SECONDS * 1000;
  var TIME_TICK_SECONDS = 2;                  // 横軸の秒目盛り
  var SHORT_GAP_MS = 350;                     // これ以内の途切れは線をつなぐ
  var ZERO_RETURN_GAP_MS = 700;               // これ以上の途切れは0へ戻す

  var padLeft = 42;                           // 左余白（目盛りラベル用）
  var padRight = 10;
  var padTop = 12;
  var padBottom = 26;


  // ======================================================================================
  //オクターブ値を Canvas の Y 座標に変換
  // ======================================================================================
  function clampYForOctave(octRel, inner) {
    var clipped = Math.max(OCTAVE_PLOT_MIN, Math.min(OCTAVE_PLOT_MAX, octRel));
    var span = Math.max(OCTAVE_PLOT_MAX - OCTAVE_PLOT_MIN, 0.001);
    var frac = (clipped - OCTAVE_PLOT_MIN) / span;
    return inner.bottom - frac * inner.height;
  }


  // ======================================================================================
  //グラフ描画エリア（余白を除いた内側）を求める
  // ======================================================================================
  function getInnerRect(canvas) {
    var w = canvas.width;
    var h = canvas.height;
    return {
      left: padLeft,
      top: padTop,
      right: w - padRight,
      bottom: h - padBottom,
      width: Math.max(8, w - padLeft - padRight),
      height: Math.max(8, h - padTop - padBottom)
    };
  }


  // ======================================================================================
  //履歴データから描画用の値を取り出す
  // ======================================================================================
  function getPointTime(point, index) {
    if (typeof point === "number") return index;
    return point.timeMs || 0;
  }

  function getPointOctave(point) {
    if (typeof point === "number") return point;
    return point.octave;
  }

  function isPointVoiced(point) {
    if (typeof point === "number") return true;
    return point.voiced === true && typeof point.octave === "number";
  }


  // ======================================================================================
  //途切れた区間の前後にある声の点を探す
  // ======================================================================================
  function findVoicedBefore(history, index, win) {
    var i;
    for (i = index - 1; i >= 0; i--) {
      var point = history[i];
      var t = getPointTime(point, i);
      if (t < win.startMs) return null;
      if (isPointVoiced(point)) return point;
    }
    return null;
  }

  function findVoicedAfter(history, index, win) {
    var i;
    for (i = index + 1; i < history.length; i++) {
      var point = history[i];
      var t = getPointTime(point, i);
      if (t > win.endMs) return null;
      if (isPointVoiced(point)) return point;
    }
    return null;
  }


  // ======================================================================================
  //グラフ表示用のオクターブ値を決める
  // ======================================================================================
  function getDisplayOctave(history, index, point, win) {
    if (isPointVoiced(point)) {
      return getPointOctave(point);
    }

    var prev = findVoicedBefore(history, index, win);
    var next = findVoicedAfter(history, index, win);
    if (!prev || !next) return 0;

    var prevTime = getPointTime(prev, index);
    var nextTime = getPointTime(next, index);
    var gapMs = nextTime - prevTime;
    if (gapMs <= 0) return 0;

    // 短い検出漏れだけ前後を直線でつなぐ----
    if (gapMs <= SHORT_GAP_MS) {
      var t = getPointTime(point, index);
      var frac = (t - prevTime) / gapMs;
      return getPointOctave(prev) + (getPointOctave(next) - getPointOctave(prev)) * frac;
    }

    // 長く途切れた場合は音が切れたものとして0へ戻す----
    if (gapMs >= ZERO_RETURN_GAP_MS) return 0;

    return 0;
  }


  // ======================================================================================
  //時間軸の範囲を決める
  // ======================================================================================
  function getHistoryWindow(history) {
    var last = history[history.length - 1];
    var endMs = getPointTime(last, history.length - 1);
    var startMs = endMs - GRAPH_WINDOW_MS;
    return {
      startMs: startMs,
      endMs: endMs,
      spanMs: Math.max(GRAPH_WINDOW_MS, 1)
    };
  }


  // ======================================================================================
  //オーバーレイを今の時間範囲に合わせる
  // ======================================================================================
  function materializeOverlayPoints(overlay, win) {
    if (!overlay || !overlay.relativePoints) return null;

    var startMs;
    if (overlay.mode === "session") {
      startMs = overlay.sessionStartMs;
    } else {
      startMs = win.endMs - overlay.durationMs;
    }

    var out = [];
    var i;
    for (i = 0; i < overlay.relativePoints.length; i++) {
      var rel = overlay.relativePoints[i].timeMs;
      if (
        overlay.playheadMs !== null &&
        overlay.playheadMs !== undefined &&
        rel > overlay.playheadMs
      ) {
        continue;
      }
      out.push({
        timeMs: startMs + rel,
        octave: overlay.relativePoints[i].octave
      });
    }
    return out;
  }


  function materializeReferencePoints(referenceOverlay, win) {
    return materializeOverlayPoints(referenceOverlay, win);
  }


  // ======================================================================================
  //模範波形を薄く描く
  // ======================================================================================
  function drawReferenceOverlay(ctx, inner, win, referenceOverlay) {
    return drawToneOverlay(
      ctx,
      inner,
      win,
      referenceOverlay,
      "rgba(46, 139, 87, 0.38)",
      "rgba(46, 139, 87, 0.62)",
      "模範",
      inner.top + 2
    );
  }


  // ======================================================================================
  //録音波形を薄く描く
  // ======================================================================================
  function drawCompareOverlay(ctx, inner, win, compareOverlay) {
    return drawToneOverlay(
      ctx,
      inner,
      win,
      compareOverlay,
      "rgba(210, 120, 40, 0.42)",
      "rgba(180, 90, 20, 0.65)",
      "録音",
      inner.top + 16
    );
  }


  function drawToneOverlay(ctx, inner, win, overlay, strokeColor, labelColor, label, labelY) {
    var points = materializeOverlayPoints(overlay, win);
    if (!points || points.length < 2) {
      return false;
    }

    var hasLine = false;
    var isDrawing = false;
    var i;

    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    for (i = 0; i < points.length; i++) {
      var t = points[i].timeMs;
      if (t < win.startMs || t > win.endMs) continue;

      var frac = (t - win.startMs) / win.spanMs;
      var x = inner.left + inner.width * frac;
      var y = clampYForOctave(points[i].octave, inner);
      if (!isDrawing) {
        ctx.moveTo(x, y);
        isDrawing = true;
      } else {
        ctx.lineTo(x, y);
      }
      hasLine = true;
    }

    if (hasLine) {
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = labelColor;
      ctx.font = "11px Meiryo UI, Meiryo, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(label, inner.left + 4, labelY);
    }
    return hasLine;
  }


  // ======================================================================================
  //描画に使う時間範囲を決める
  // ======================================================================================
  function resolveDrawWindow(history, referenceOverlay, compareOverlay, compareReplayActive) {
    if (compareReplayActive && compareOverlay) {
      var dur = Math.max(compareOverlay.durationMs, 1);
      var now = Date.now();
      return {
        startMs: now - dur,
        endMs: now,
        spanMs: dur
      };
    }
    if (!compareReplayActive && history && history.length >= 2) {
      return getHistoryWindow(history);
    }
    if (compareOverlay && compareOverlay.mode === "compare_view") {
      var compareDur = Math.max(compareOverlay.durationMs, 1);
      var end = Date.now();
      return {
        startMs: end - compareDur,
        endMs: end,
        spanMs: compareDur
      };
    }
    var nowMs = Date.now();
    return {
      startMs: nowMs - GRAPH_WINDOW_MS,
      endMs: nowMs,
      spanMs: GRAPH_WINDOW_MS
    };
  }


  // ======================================================================================
  //グラフを描画（目盛り・目標線・折れ線）
  // ======================================================================================
  function draw(canvas, history, hasTarget, targetOctave, referenceOverlay, compareOverlay, compareReplayActive) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;

    // 背景を白で塗る----------------------------------
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    var inner = getInnerRect(canvas);
    inner.right = inner.left + inner.width;
    inner.bottom = inner.top + inner.height;

    // --------------------------------------------------
    // 縦軸の目盛り線とラベル
    // --------------------------------------------------
    ctx.strokeStyle = "rgba(200,200,200,1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var i;
    for (i = 0; i < OCTAVE_TICKS.length; i++) {
      var tick = OCTAVE_TICKS[i];
      var yLine = clampYForOctave(tick, inner);
      if (Math.abs(tick) < 0.0001) {
        ctx.setLineDash([]);
        ctx.strokeStyle = "#696969";
      } else {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(200,200,200,1)";
      }
      ctx.beginPath();
      ctx.moveTo(inner.left, yLine);
      ctx.lineTo(inner.right, yLine);
      ctx.stroke();

      var label = tick > 0 ? "+" + tick.toFixed(1) : tick.toFixed(1);
      if (Math.abs(tick) < 0.0001) label = "0";
      ctx.fillStyle = "#696969";
      ctx.font = "12px Meiryo UI, Meiryo, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(label, inner.left - 4, yLine);
    }

    // --------------------------------------------------
    // 横軸の時間目盛り
    // --------------------------------------------------
    var seconds;
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = "rgba(220,220,220,1)";
    ctx.fillStyle = "#777777";
    ctx.font = "11px Meiryo UI, Meiryo, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (seconds = TIME_TICK_SECONDS; seconds < VoiceConstants.GRAPH_TIME_WINDOW_SECONDS; seconds += TIME_TICK_SECONDS) {
      var xTime = inner.right - (inner.width * seconds * 1000) / GRAPH_WINDOW_MS;
      ctx.beginPath();
      ctx.moveTo(xTime, inner.top);
      ctx.lineTo(xTime, inner.bottom);
      ctx.stroke();
      ctx.fillText("-" + seconds + "s", xTime, inner.bottom + 5);
    }

    // 目標オクターブの緑線----------------------------------
    if (hasTarget) {
      var yTarget = clampYForOctave(targetOctave, inner);
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(60, 170, 80, 0.86)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(inner.left, yTarget);
      ctx.lineTo(inner.right, yTarget);
      ctx.stroke();

      var tLabel =
        "目標 " +
        (targetOctave > 0 ? "+" : "") +
        targetOctave.toFixed(2) +
        " oct";
      ctx.fillStyle = "rgba(40, 130, 60, 1)";
      ctx.font = "12px Meiryo UI, Meiryo, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(tLabel, inner.right - 6, yTarget - 2);
    }

    var win = resolveDrawWindow(history, referenceOverlay, compareOverlay, compareReplayActive);
    var hasRef = drawReferenceOverlay(ctx, inner, win, referenceOverlay);
    var hasCompare = drawCompareOverlay(ctx, inner, win, compareOverlay);

    if (compareReplayActive || !history || history.length < 2) {
      return hasRef || hasCompare;
    }

    // ピッチ推移の折れ線（短い途切れは補間、長い途切れは0へ戻す）------------
    ctx.setLineDash([]);
    ctx.strokeStyle = "#4682b4";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    var k;
    var hasLine = false;
    var isDrawing = false;
    var n = history.length;
    ctx.beginPath();
    for (k = 0; k < n; k++) {
      var point = history[k];
      var t = getPointTime(point, k);
      if (t < win.startMs || t > win.endMs) continue;

      var frac = (t - win.startMs) / win.spanMs;
      var x = inner.left + inner.width * frac;
      var y = clampYForOctave(getDisplayOctave(history, k, point, win), inner);
      if (!isDrawing) {
        ctx.moveTo(x, y);
        isDrawing = true;
      } else {
        ctx.lineTo(x, y);
      }
      hasLine = true;
    }
    if (hasLine) {
      ctx.stroke();
    }
    return hasLine || hasRef || hasCompare;
  }


  // ======================================================================================
  //画面サイズに合わせて Canvas の大きさを調整
  // ======================================================================================
  function measureGraphHeight(wrap) {
    if (window.matchMedia("(min-width: 993px)").matches) {
      return 320;
    }

    var cssH = Math.floor(wrap.clientHeight);
    if (cssH >= 120) {
      return cssH;
    }
    
    // CSS 高さがまだ取れないときだけ画面残りから計算----
    var top = wrap.getBoundingClientRect().top;
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var available = Math.floor(vh - top - 16);
    return Math.max(140, Math.min(320, available));
  }

  function resizeCanvasToDisplay(canvas) {
    var wrap = canvas.parentElement;
    if (!wrap) return;

    var w = Math.max(200, Math.floor(wrap.clientWidth));
    var h = measureGraphHeight(wrap);

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }


  return {
    draw: draw,
    resizeCanvasToDisplay: resizeCanvasToDisplay
  };
})();
