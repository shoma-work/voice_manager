// 比較用の録音（ピッチ波形＋音声）をお題ごとに保存

var CompareStore = (function () {
  var MAX_STORED_POINTS = 120;
  var MIN_RECORD_POINTS = 8;
  var DB_NAME = "voice_manager_web";
  var DB_VERSION = 1;
  var AUDIO_STORE = "compare_audio";


  // ======================================================================================
  //IndexedDB を開く
  // ======================================================================================
  function openDb(callback) {
    if (!window.indexedDB) {
      callback(new Error("IndexedDB unavailable"));
      return;
    }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
    };
    req.onsuccess = function (e) {
      callback(null, e.target.result);
    };
    req.onerror = function () {
      callback(req.error || new Error("IndexedDB open failed"));
    };
  }


  // ======================================================================================
  //保存済みピッチを全部読む
  // ======================================================================================
  function loadAllTakes() {
    return AppSettings.loadReadingCompareTakes();
  }


  // ======================================================================================
  //保存済みピッチを全部書く
  // ======================================================================================
  function saveAllTakes(takes) {
    AppSettings.saveReadingCompareTakes(takes);
  }


  // ======================================================================================
  //点を間引く
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
    hasTake: function (promptId) {
      if (!promptId) return false;
      var take = loadAllTakes()[promptId];
      return !!(take && take.relativePoints && take.relativePoints.length >= 2);
    },

    getTake: function (promptId) {
      if (!promptId) return null;
      return loadAllTakes()[promptId] || null;
    },

    removeTake: function (promptId) {
      if (!promptId) return;
      var takes = loadAllTakes();
      if (takes[promptId]) {
        delete takes[promptId];
        saveAllTakes(takes);
      }
      openDb(function (err, db) {
        if (err || !db) return;
        var tx = db.transaction(AUDIO_STORE, "readwrite");
        tx.objectStore(AUDIO_STORE).delete(promptId);
        tx.oncomplete = function () {
          db.close();
        };
      });
    },

    buildOverlay: function (promptId, playheadMs) {
      var take = this.getTake(promptId);
      if (!take || !take.relativePoints || take.relativePoints.length < 2) {
        return null;
      }
      return {
        mode: "compare_view",
        durationMs: take.durationMs || GameScore.SESSION_MS,
        sessionStartMs: 0,
        relativePoints: take.relativePoints,
        playheadMs: playheadMs === undefined ? null : playheadMs,
        source: "compare"
      };
    },

    // ======================================================================================
    //録音セッションからピッチを保存
    // ======================================================================================
    saveFromSamples: function (promptId, samples, sessionStartMs, durationMs, hasAudio) {
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
          message: "声が十分拾えませんでした。はっきり読んでからもう一度録音してください。"
        };
      }

      raw.sort(function (a, b) {
        return a.timeMs - b.timeMs;
      });
      var points = downsamplePoints(raw, MAX_STORED_POINTS);
      points[0].timeMs = 0;
      points[points.length - 1].timeMs = Math.max(
        points[points.length - 1].timeMs,
        durationMs * 0.5
      );

      var takes = loadAllTakes();
      takes[promptId] = {
        durationMs: durationMs,
        relativePoints: points,
        recordedAt: Date.now(),
        hasAudio: !!hasAudio
      };
      saveAllTakes(takes);
      return { ok: true, message: "" };
    },

    // ======================================================================================
    //音声 Blob を保存
    // ======================================================================================
    saveAudio: function (promptId, blob, callback) {
      if (!promptId || !blob) {
        if (callback) callback(null);
        return;
      }
      openDb(function (err, db) {
        if (err || !db) {
          if (callback) callback(err);
          return;
        }
        var tx = db.transaction(AUDIO_STORE, "readwrite");
        tx.objectStore(AUDIO_STORE).put(blob, promptId);
        tx.oncomplete = function () {
          db.close();
          if (callback) callback(null);
        };
        tx.onerror = function () {
          db.close();
          if (callback) callback(tx.error);
        };
      });
    },

    // ======================================================================================
    //音声 Blob を読む
    // ======================================================================================
    loadAudio: function (promptId, callback) {
      if (!promptId) {
        callback(null);
        return;
      }
      openDb(function (err, db) {
        if (err || !db) {
          callback(null);
          return;
        }
        var tx = db.transaction(AUDIO_STORE, "readonly");
        var req = tx.objectStore(AUDIO_STORE).get(promptId);
        req.onsuccess = function () {
          callback(req.result || null);
        };
        req.onerror = function () {
          callback(null);
        };
        tx.oncomplete = function () {
          db.close();
        };
      });
    }
  };
})();
