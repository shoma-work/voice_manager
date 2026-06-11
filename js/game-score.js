// 朗読チャレンジの採点（抑揚・リズム・安定）

var GameScore = (function () {
  var SESSION_MS = 25000;                     // 1回の制限時間
  var MIN_VOICED_POINTS = 12;                 // 採点に必要な最低声点数


  // ======================================================================================
  //0〜1 に収める
  // ======================================================================================
  function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }


  // ======================================================================================
  //範囲を 0〜1 に当てはめる
  // ======================================================================================
  function normalize(value, low, high) {
    if (high <= low) return 0;
    return clamp01((value - low) / (high - low));
  }


  // ======================================================================================
  //平均と標準偏差
  // ======================================================================================
  function meanAndStd(values) {
    if (!values.length) return { mean: 0, std: 0 };
    var sum = 0;
    var i;
    for (i = 0; i < values.length; i++) {
      sum += values[i];
    }
    var mean = sum / values.length;
    var sq = 0;
    for (i = 0; i < values.length; i++) {
      var d = values[i] - mean;
      sq += d * d;
    }
    return { mean: mean, std: Math.sqrt(sq / values.length) };
  }


  // ======================================================================================
  //山と谷の数を数える（抑揚の目安）
  // ======================================================================================
  function countLocalExtrema(values) {
    if (values.length < 3) return 0;
    var count = 0;
    var i;
    for (i = 1; i < values.length - 1; i++) {
      var prev = values[i - 1];
      var cur = values[i];
      var next = values[i + 1];
      if ((cur > prev && cur > next) || (cur < prev && cur < next)) {
        count++;
      }
    }
    return count;
  }


  // ======================================================================================
  //声が出ていた区間の長さを集める
  // ======================================================================================
  function collectVoicedSegments(samples) {
    var segments = [];
    var current = null;
    var i;
    for (i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s.voiced) {
        if (!current) {
          current = { startMs: s.timeMs, endMs: s.timeMs };
        } else {
          current.endMs = s.timeMs;
        }
      } else if (current) {
        segments.push(current.endMs - current.startMs);
        current = null;
      }
    }
    if (current) {
      segments.push(current.endMs - current.startMs);
    }
    return segments;
  }


  // ======================================================================================
  //抑揚スコア（60%）
  // ======================================================================================
  function scoreIntonation(voicedOctaves, extremaCount) {
    var min = voicedOctaves[0];
    var max = voicedOctaves[0];
    var i;
    for (i = 1; i < voicedOctaves.length; i++) {
      if (voicedOctaves[i] < min) min = voicedOctaves[i];
      if (voicedOctaves[i] > max) max = voicedOctaves[i];
    }
    var range = max - min;
    var std = meanAndStd(voicedOctaves).std;

    var rangeScore = normalize(range, 0.12, 1.1);
    var peakScore = normalize(extremaCount, 2, 10);
    var varianceScore = normalize(std, 0.06, 0.42);

    return clamp01(rangeScore * 0.4 + peakScore * 0.35 + varianceScore * 0.25) * 100;
  }


  // ======================================================================================
  //リズムスコア（25%）
  // ======================================================================================
  function scoreRhythm(samples, sessionMs) {
    var voicedMs = 0;
    var i;
    if (samples.length > 0 && sessionMs > 0) {
      var startMs = samples[0].timeMs;
      var endMs = startMs + sessionMs;
      for (i = 0; i < samples.length; i++) {
        if (!samples[i].voiced) continue;
        var segEnd = i + 1 < samples.length ? samples[i + 1].timeMs : endMs;
        voicedMs += Math.max(0, segEnd - samples[i].timeMs);
      }
    }
    var voicedRatio = voicedMs / Math.max(sessionMs, 1);
    var ratioScore = normalize(voicedRatio, 0.35, 0.82);

    var segments = collectVoicedSegments(samples);
    var segmentScore = 0.5;
    if (segments.length >= 2) {
      var stats = meanAndStd(segments);
      var cv = stats.mean > 0 ? stats.std / stats.mean : 1;
      segmentScore = 1.0 - normalize(cv, 0.15, 1.2);
    } else if (segments.length === 1) {
      segmentScore = 0.55;
    }

    var pauseScore = normalize(segments.length, 1, 6);
    return clamp01(ratioScore * 0.45 + segmentScore * 0.35 + pauseScore * 0.2) * 100;
  }


  // ======================================================================================
  //安定スコア（15%）— 人の声は多少ブレるので基準は甘め
  // ======================================================================================
  function scoreStability(voicedHz) {
    var stats = meanAndStd(voicedHz);
    if (stats.mean <= 0) return 0;
    var cv = stats.std / stats.mean;
    // cv が小さいほど高得点。上限を広げて自然な揺れを減点しにくくする----
    return clamp01(1.0 - normalize(cv, 0.04, 0.28)) * 100;
  }


  // ======================================================================================
  //総合点とランク
  // ======================================================================================
  function rankFromTotal(total) {
    if (total >= 85) return "S";
    if (total >= 70) return "A";
    if (total >= 55) return "B";
    return "C";
  }


  // ======================================================================================
  //記録波形との一致度（記録採点モード）
  // ======================================================================================
  function scoreAgainstReference(samples, sessionStartMs, sessionMs, stored) {
    var refPoints = stored.relativePoints;
    var refDuration = stored.durationMs || SESSION_MS;
    var compareMs = Math.min(sessionMs, refDuration);

    var userPoints = [];
    var voicedHz = [];
    var i;
    for (i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (!s.voiced) continue;
      var relMs = s.timeMs - sessionStartMs;
      if (relMs < 0 || relMs > compareMs) continue;
      if (s.octave !== null && s.octave !== undefined && !isNaN(s.octave)) {
        userPoints.push({ timeMs: relMs, octave: s.octave });
      }
      if (s.hz > 0) voicedHz.push(s.hz);
    }

    if (userPoints.length < MIN_VOICED_POINTS) {
      return {
        ok: false,
        message: "声が十分拾えませんでした。マイクに向けて、お題をはっきり読んでください。",
        total: 0,
        rank: "C",
        intonation: 0,
        rhythm: 0,
        stability: 0,
        scoreMode: "record"
      };
    }

    var errors = [];
    for (i = 0; i < userPoints.length; i++) {
      var refOct = GameReference.interpolateOctave(refPoints, userPoints[i].timeMs);
      if (refOct === null || refOct === undefined) continue;
      errors.push(Math.abs(userPoints[i].octave - refOct));
    }

    if (errors.length < MIN_VOICED_POINTS) {
      return {
        ok: false,
        message: "記録した模範と比較できるデータが足りませんでした。",
        total: 0,
        rank: "C",
        intonation: 0,
        rhythm: 0,
        stability: 0,
        scoreMode: "record"
      };
    }

    var meanErr = 0;
    for (i = 0; i < errors.length; i++) {
      meanErr += errors[i];
    }
    meanErr /= errors.length;

    var matchScore = clamp01(1.0 - normalize(meanErr, 0.05, 0.55)) * 100;
    var durationRatio = sessionMs / Math.max(refDuration, 1);
    var timingScore = clamp01(1.0 - normalize(Math.abs(durationRatio - 1.0), 0.05, 0.4)) * 100;
    var stability = scoreStability(voicedHz);
    var total = Math.round(matchScore * 0.65 + timingScore * 0.25 + stability * 0.1);

    return {
      ok: true,
      message: "",
      total: total,
      rank: rankFromTotal(total),
      intonation: Math.round(matchScore),
      rhythm: Math.round(timingScore),
      stability: Math.round(stability),
      voicedPoints: userPoints.length,
      scoreMode: "record"
    };
  }


  // ======================================================================================
  //セッション結果を採点
  // ======================================================================================
  function scoreSession(samples, sessionMs, options) {
    sessionMs = sessionMs || SESSION_MS;
    options = options || {};

    if (options.useRecordedReference && options.storedReference) {
      return scoreAgainstReference(
        samples,
        options.sessionStartMs || 0,
        sessionMs,
        options.storedReference
      );
    }

    var voiced = [];
    var voicedOct = [];
    var voicedHz = [];
    var i;
    for (i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (!s.voiced) continue;
      voiced.push(s);
      if (s.octave !== null && s.octave !== undefined && !isNaN(s.octave)) {
        voicedOct.push(s.octave);
      }
      if (s.hz > 0) voicedHz.push(s.hz);
    }

    if (voiced.length < MIN_VOICED_POINTS || voicedOct.length < MIN_VOICED_POINTS) {
      return {
        ok: false,
        message: "声が十分拾えませんでした。マイクに向けて、お題をはっきり読んでください。",
        total: 0,
        rank: "C",
        intonation: 0,
        rhythm: 0,
        stability: 0,
        scoreMode: "default"
      };
    }

    var extrema = countLocalExtrema(voicedOct);
    var intonation = scoreIntonation(voicedOct, extrema);
    var rhythm = scoreRhythm(samples, sessionMs);
    var stability = scoreStability(voicedHz);
    var total = Math.round(
      intonation * 0.6 + rhythm * 0.25 + stability * 0.15
    );

    return {
      ok: true,
      message: "",
      total: total,
      rank: rankFromTotal(total),
      intonation: Math.round(intonation),
      rhythm: Math.round(rhythm),
      stability: Math.round(stability),
      voicedPoints: voiced.length,
      scoreMode: "default"
    };
  }


  return {
    SESSION_MS: SESSION_MS,
    scoreSession: scoreSession,
    rankFromTotal: rankFromTotal
  };
})();
