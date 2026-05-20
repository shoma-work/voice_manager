// グラフ・目標入力で共通のオクターブ範囲（ここだけ変えれば全体に反映）

var VoiceConstants = (function () {
  var OCTAVE_PLOT_MIN = -1.5;                 // 縦軸の下限（オクターブ）
  var OCTAVE_PLOT_MAX = 3.5;                  // 縦軸の上限（オクターブ）
  var OCTAVE_TICK_STEP = 0.5;                 // 目盛りの間隔


  // ======================================================================================
  //上下限から目盛り配列を作る
  // ======================================================================================
  function buildOctaveTicks() {
    var ticks = [];
    var v = OCTAVE_PLOT_MIN;
    while (v <= OCTAVE_PLOT_MAX + 0.0001) {
      ticks.push(Math.round(v * 10) / 10);
      v += OCTAVE_TICK_STEP;
    }
    return ticks;
  }


  return {
    OCTAVE_PLOT_MIN: OCTAVE_PLOT_MIN,
    OCTAVE_PLOT_MAX: OCTAVE_PLOT_MAX,
    OCTAVE_TICK_STEP: OCTAVE_TICK_STEP,
    getOctaveTicks: buildOctaveTicks
  };
})();
