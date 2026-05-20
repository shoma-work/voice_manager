// 音の高さ（Hz）を計算する（Windows 版 PitchEstimator と同じ考え方）

var PitchEstimator = (function () {
  var ANALYSIS_WINDOW_SAMPLES = 8192;         // 一度に解析するサンプル数（長いほど Hz が安定）
  var SILENCE_ENERGY_THRESHOLD = 0.0025;      // 無音とみなすしきい値（小さいほど小声を拾う）
  var AUTOCORR_MIN_RATIO = 0.05;              // ピッチとして認める相関の下限（小さいほど寛容）


  // ======================================================================================
  //指定ラグ位置の自己相関を計算
  // ======================================================================================
  function autocorrAt(x, lag, n) {
    var s = 0;
    var j;
    for (j = 0; j < n - lag; j++) {
      s += x[j] * x[j + lag];
    }
    return s;
  }


  // ======================================================================================
  //直近ウィンドウのエネルギー（音量の強さ）を計算
  // ======================================================================================
  function computeWindowEnergy(samples) {
    var nAll = samples.length;
    if (nAll < ANALYSIS_WINDOW_SAMPLES) return 0;

    var n = Math.min(ANALYSIS_WINDOW_SAMPLES, nAll);
    var offset = nAll - n;
    var x = new Float32Array(n);
    var sum = 0;
    var i;

    // 平均を引いて波形を中心化----------------------------------
    for (i = 0; i < n; i++) {
      x[i] = samples[offset + i];
      sum += x[i];
    }

    var mean = sum / n;
    for (i = 0; i < n; i++) {
      x[i] -= mean;
    }

    // 窓関数をかけてエネルギーを求める----------------------------------
    var energy = 0;
    for (i = 0; i < n; i++) {
      var w = 0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / Math.max(n - 1, 1));
      x[i] *= w;
      energy += x[i] * x[i];
    }
    return energy;
  }


  // ======================================================================================
  //基音周波数（Hz）を推定
  // ======================================================================================
  function estimateFundamental(samples, sampleRate, minFreq, maxFreq, extraEnergyThreshold) {
    minFreq = minFreq || 50;
    maxFreq = maxFreq || 1200;
    extraEnergyThreshold = extraEnergyThreshold || 0;

    var nAll = samples.length;
    if (nAll < ANALYSIS_WINDOW_SAMPLES) return 0;

    var n = Math.min(ANALYSIS_WINDOW_SAMPLES, nAll);
    var offset = nAll - n;
    var x = new Float32Array(n);
    var sum = 0;
    var i;

    for (i = 0; i < n; i++) {
      x[i] = samples[offset + i];
      sum += x[i];
    }

    var mean = sum / n;
    for (i = 0; i < n; i++) {
      x[i] -= mean;
    }

    var invDen = 1.0 / Math.max(n - 1, 1);
    var energy = 0;
    for (i = 0; i < n; i++) {
      var w = 0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / Math.max(n - 1, 1));
      x[i] *= w;
      energy += x[i] * x[i];
    }

    // 雑音ゲート：小さすぎる音は無音扱い----------------------------------
    var threshold = SILENCE_ENERGY_THRESHOLD;
    if (extraEnergyThreshold > threshold) threshold = extraEnergyThreshold;
    if (energy < threshold) return 0;

    var minLag = Math.floor(sampleRate / maxFreq);
    var maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2) - 1);
    if (maxLag <= minLag) return 0;

    // 自己相関が最大になるラグを探す----------------------------------
    var bestLag = minLag;
    var bestCorr = -Infinity;
    var lag;

    for (lag = minLag; lag <= maxLag; lag++) {
      var corr = 0;
      var j;
      for (j = 0; j < n - lag; j++) {
        corr += x[j] * x[j + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (energy <= 0 || bestCorr <= 0 || bestCorr / energy < AUTOCORR_MIN_RATIO) {
      return 0;
    }

    // ラグを補間して Hz を求める----------------------------------
    var refinedLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      var cm = autocorrAt(x, bestLag - 1, n);
      var c0 = bestCorr;
      var cp = autocorrAt(x, bestLag + 1, n);
      var denom = cm - 2.0 * c0 + cp;
      if (Math.abs(denom) > 0.0000001) {
        var shift = 0.5 * (cm - cp) / denom;
        refinedLag = bestLag + shift;
      }
    }

    var f = sampleRate / refinedLag;
    if (f < minFreq || f > maxFreq) return 0;
    return f;
  }


  return {
    ANALYSIS_WINDOW_SAMPLES: ANALYSIS_WINDOW_SAMPLES,
    estimateFundamental: estimateFundamental,
    computeWindowEnergy: computeWindowEnergy
  };
})();
