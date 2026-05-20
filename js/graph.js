// オクターブ推移グラフ（Canvas で折れ線を描く）

var PitchGraph = (function () {
  var OCTAVE_PLOT_MAX = VoiceConstants.OCTAVE_PLOT_MAX;
  var OCTAVE_PLOT_MIN = VoiceConstants.OCTAVE_PLOT_MIN;
  var OCTAVE_TICKS = VoiceConstants.getOctaveTicks();

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
  //グラフを描画（目盛り・目標線・折れ線）
  // ======================================================================================
  function draw(canvas, history, hasTarget, targetOctave) {
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
    // 横方向の目盛り線とラベル
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

    if (!history || history.length < 2) {
      return false;
    }

    // ピッチ推移の折れ線----------------------------------
    ctx.setLineDash([]);
    ctx.strokeStyle = "#4682b4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    var n = history.length;
    var k;
    for (k = 0; k < n; k++) {
      var x = inner.left + (inner.width * k) / Math.max(n - 1, 1);
      var y = clampYForOctave(history[k], inner);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return true;
  }


  // ======================================================================================
  //画面サイズに合わせて Canvas の大きさを調整
  // ======================================================================================
  function measureGraphHeight(canvas, wrapRect) {
    var h = Math.floor(wrapRect.height);
    if (h >= 120) return h;

    // flex レイアウト前など高さが取れないときは残り画面から計算----
    var top = wrapRect.top;
    var bottomPad = 12;
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    h = Math.floor(vh - top - bottomPad);
    return Math.max(140, h);
  }

  function resizeCanvasToDisplay(canvas) {
    var wrap = canvas.parentElement;
    if (!wrap) return;

    var rect = wrap.getBoundingClientRect();
    var w = Math.max(200, Math.floor(rect.width));
    var h = measureGraphHeight(canvas, rect);

    // PC 幅では従来どおり 320px 上限寄りに保つ--------------------
    if (window.matchMedia("(min-width: 993px)").matches) {
      h = 320;
    }

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "100%";
    canvas.style.height = h + "px";
    wrap.style.minHeight = h + "px";
  }


  return {
    draw: draw,
    resizeCanvasToDisplay: resizeCanvasToDisplay
  };
})();
