// 設定の保存・読み込み（ブラウザの localStorage、キー名は snake_case）

var AppSettings = (function () {
  var STORAGE_KEY = "voice_manager_settings";   // 保存先のキー名

  var keys = {
    last_device_name: "last_device_name",     // 前回選んだマイク名
    baseline_hz: "baseline_hz",                 // 基準の Hz
    noise_cancel: "noise_cancel",               // デモ版の累計使用秒（2進数文字列）
    target_octave: "target_octave",             // 目標オクターブ
    target_enabled: "target_enabled"            // 目標線を表示するか
  };


  // ======================================================================================
  //localStorage から全部読む
  // ======================================================================================
  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }


  // ======================================================================================
  //localStorage に全部書く
  // ======================================================================================
  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // 保存に失敗してもアプリは動かす
    }
  }


  // ======================================================================================
  //一部だけ更新して保存
  // ======================================================================================
  function mergeAndSave(partial) {
    var data = loadAll();
    var k;
    for (k in partial) {
      if (Object.prototype.hasOwnProperty.call(partial, k)) {
        data[k] = partial[k];
      }
    }
    saveAll(data);
  }


  // ======================================================================================
  //デモ版用：秒数を2進数文字列に変換
  // ======================================================================================
  function secondsToBinaryString(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    if (s === 0) return "0";
    return s.toString(2);
  }


  // ======================================================================================
  //デモ版用：2進数文字列を秒数に戻す
  // ======================================================================================
  function binaryStringToSeconds(binaryText) {
    if (!binaryText || !String(binaryText).trim()) return 0;
    var t = String(binaryText).trim();
    if (!/^[01]+$/.test(t)) return 0;
    return parseInt(t, 2);
  }


  return {
    keys: keys,

    // --------------------------------------------------
    // 前回選んだマイク名
    // --------------------------------------------------
    loadLastDeviceName: function () {
      var d = loadAll();
      return d[keys.last_device_name] || "";
    },

    saveLastDeviceName: function (name) {
      var o = {};
      o[keys.last_device_name] = name || "";
      mergeAndSave(o);
    },

    // --------------------------------------------------
    // 基準 Hz
    // --------------------------------------------------
    loadBaselineHz: function () {
      var d = loadAll();
      var raw = d[keys.baseline_hz];
      if (raw === undefined || raw === "") return 0;
      var hz = parseFloat(raw);
      if (isNaN(hz) || hz <= 0 || hz >= 50000) return 0;
      return hz;
    },

    saveBaselineHz: function (hz) {
      var data = loadAll();
      if (hz <= 0) {
        delete data[keys.baseline_hz];
      } else {
        data[keys.baseline_hz] = String(hz);
      }
      saveAll(data);
    },

    // --------------------------------------------------
    // デモ版 累計使用秒
    // --------------------------------------------------
    loadNoiseCancelUsedSeconds: function () {
      var d = loadAll();
      return binaryStringToSeconds(d[keys.noise_cancel]);
    },

    saveNoiseCancelUsedSeconds: function (seconds) {
      var o = {};
      o[keys.noise_cancel] = secondsToBinaryString(seconds);
      mergeAndSave(o);
    },

    // --------------------------------------------------
    // 目標オクターブ
    // --------------------------------------------------
    loadTargetOctave: function () {
      var d = loadAll();
      if (d[keys.target_octave] === undefined || d[keys.target_octave] === "") return NaN;
      var oct = parseFloat(d[keys.target_octave]);
      if (isNaN(oct) || oct < -10 || oct > 10) return NaN;
      return oct;
    },

    saveTargetOctave: function (oct) {
      var data = loadAll();
      if (isNaN(oct)) {
        delete data[keys.target_octave];
      } else {
        data[keys.target_octave] = String(oct);
      }
      saveAll(data);
    },

    loadTargetEnabled: function () {
      var d = loadAll();
      if (d[keys.target_enabled] === undefined) return true;
      var raw = String(d[keys.target_enabled]).trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "no") return false;
      return true;
    },

    saveTargetEnabled: function (enabled) {
      var o = {};
      o[keys.target_enabled] = enabled ? "true" : "false";
      mergeAndSave(o);
    }
  };
})();
