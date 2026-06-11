// 朗読の模範波形（お題ごとに記録したものだけ使う）

var GameReference = (function () {
  var SESSION_MS = GameScore.SESSION_MS;
  var MAX_STORED_POINTS = 120;                // 保存する点の上限
  var MIN_RECORD_POINTS = 8;                  // 記録に必要な最低点数


  // ======================================================================================
  //保存済み模範波形を全部読む
  // ======================================================================================
  function loadAllStored() {
    return AppSettings.loadReadingPromptReferences();
  }


  // ======================================================================================
  //保存済み模範波形を全部書く
  // ======================================================================================
  function saveAllStored(references) {
    AppSettings.saveReadingPromptReferences(references);
  }


  // ======================================================================================
  //点を間引いて保存サイズを抑える
  // ======================================================================================
  function downsamplePoints(points, maxCount) {
    if (points.length <= maxCount) return points.slice();
    var out = [];
    var step = (points.length - 1) / (maxCount - 1);
    var i;
    for (i = 0; i < maxCount; i++) {
      out.push(points[Math.round(i * step)]);
    }
    return out;
  }


  return {
    hasRecorded: function (promptId) {
      if (!promptId) return false;
      var all = loadAllStored();
      return !!(all[promptId] && all[promptId].relativePoints && all[promptId].relativePoints.length >= 2);
    },

    getStored: function (promptId) {
      if (!promptId) return null;
      var all = loadAllStored();
      return all[promptId] || null;
    },

    removeRecorded: function (promptId) {
      if (!promptId) return;
      var all = loadAllStored();
      if (!all[promptId]) return;
      delete all[promptId];
      saveAllStored(all);
    },

    buildOverlay: function (promptId, mode, sessionStartMs) {
      var stored = this.getStored(promptId);
      if (!stored || !stored.relativePoints || stored.relativePoints.length < 2) {
        return null;
      }
      return {
        mode: mode,
        durationMs: stored.durationMs || SESSION_MS,
        sessionStartMs: sessionStartMs || 0,
        relativePoints: stored.relativePoints,
        source: "recorded"
      };
    },

    buildPreview: function (promptId) {
      return this.buildOverlay(promptId, "preview", 0);
    },

    buildForSession: function (promptId, sessionStartMs) {
      return this.buildOverlay(promptId, "session", sessionStartMs);
    },

    // ======================================================================================
    //チャレンジ中の声から模範波形を保存
    // ======================================================================================
    saveFromSamples: function (promptId, samples, sessionStartMs, durationMs) {
      if (!promptId) {
        return { ok: false, message: "お題が選ばれていません。" };
      }

      var raw = [];
      var i;
      for (i = 0; i < samples.length; i++) {
        var s = samples[i];
        if (!s.voiced) continue;
        if (s.octave === null || s.octave === undefined || isNaN(s.octave)) continue;
        var relMs = s.timeMs - sessionStartMs;
        if (relMs < 0 || relMs > durationMs) continue;
        raw.push({ timeMs: relMs, octave: s.octave });
      }

      if (raw.length < MIN_RECORD_POINTS) {
        return {
          ok: false,
          message: "声が十分拾えませんでした。はっきり読んでからもう一度記録してください。"
        };
      }

      raw.sort(function (a, b) {
        return a.timeMs - b.timeMs;
      });
      var points = downsamplePoints(raw, MAX_STORED_POINTS);
      points[0].timeMs = 0;
      points[points.length - 1].timeMs = Math.max(points[points.length - 1].timeMs, durationMs * 0.5);

      var all = loadAllStored();
      all[promptId] = {
        durationMs: durationMs,
        relativePoints: points,
        recordedAt: Date.now()
      };
      saveAllStored(all);

      return { ok: true, message: "" };
    },

    interpolateOctave: function (relativePoints, tMs) {
      if (!relativePoints || !relativePoints.length) return null;
      if (tMs <= relativePoints[0].timeMs) return relativePoints[0].octave;
      var last = relativePoints[relativePoints.length - 1];
      if (tMs >= last.timeMs) return last.octave;

      var i;
      for (i = 0; i < relativePoints.length - 1; i++) {
        var a = relativePoints[i];
        var b = relativePoints[i + 1];
        if (tMs >= a.timeMs && tMs <= b.timeMs) {
          var span = b.timeMs - a.timeMs;
          if (span <= 0) return a.octave;
          var frac = (tMs - a.timeMs) / span;
          return a.octave + (b.octave - a.octave) * frac;
        }
      }
      return null;
    }
  };
})();
