// DEMO版 累計3時間制限
// 不要になったらこのファイルを削除し、app.js の TrialLimit 呼び出しを削除する

var TrialLimit = (function () {
  var IS_ACTIVE = false;                         // 制限を有効にするか
  var LIMIT_SECONDS = 10800;                  // 3時間（秒）
  var SAVE_INTERVAL_SECONDS = 30;             // 何秒ごとに使用時間を保存するか
  var EXPIRED_MESSAGE =
    "デモ版の使用可能時間を超えたので、開発者に連絡してください。";

  var sessionStartMs = 0;                     // 今回の起動開始時刻
  var savedTotalSeconds = 0;                  // 保存済みの累計秒数
  var lastFlushMs = 0;                        // 前回保存した時刻
  var isExpired = false;                      // 制限超過の目印
  var expiredMessageShown = false;            // 超過メッセージを出したか


  // ======================================================================================
  //今の累計使用秒数を計算
  // ======================================================================================
  function getTotalUsedSecondsNow() {
    var running = 0;
    if (sessionStartMs > 0) {
      running = Math.floor((Date.now() - sessionStartMs) / 1000);
    }
    return savedTotalSeconds + running;
  }


  // ======================================================================================
  //制限超過メッセージを1回だけ表示
  // ======================================================================================
  function showExpiredMessage() {
    if (expiredMessageShown) return;
    expiredMessageShown = true;
    alert(EXPIRED_MESSAGE);
  }


  return {
    isActive: function () {
      return IS_ACTIVE;
    },

    // ======================================================================================
    //起動時：使用時間を読み込んでセッション開始
    // ======================================================================================
    tryBeginSession: function (onDisableUi) {
      if (!IS_ACTIVE) return true;

      savedTotalSeconds = AppSettings.loadNoiseCancelUsedSeconds();
      isExpired = savedTotalSeconds >= LIMIT_SECONDS;
      expiredMessageShown = false;

      if (isExpired) {
        if (onDisableUi) onDisableUi(true);
        showExpiredMessage();
        return false;
      }

      sessionStartMs = Date.now();
      lastFlushMs = sessionStartMs;
      return true;
    },

    // ======================================================================================
    //定期チェック：使用時間を保存し、超過したら止める
    // ======================================================================================
    tickAndCheckExpired: function (onDisableUi) {
      if (!IS_ACTIVE || isExpired) return false;

      var totalNow = getTotalUsedSecondsNow();

      // 一定間隔で累計秒数を保存----------------------------------
      if ((Date.now() - lastFlushMs) / 1000 >= SAVE_INTERVAL_SECONDS) {
        AppSettings.saveNoiseCancelUsedSeconds(totalNow);
        savedTotalSeconds = totalNow;
        lastFlushMs = Date.now();
      }

      if (totalNow < LIMIT_SECONDS) return false;

      AppSettings.saveNoiseCancelUsedSeconds(totalNow);
      savedTotalSeconds = totalNow;
      isExpired = true;
      if (onDisableUi) onDisableUi(false);
      showExpiredMessage();
      return true;
    },

    // ======================================================================================
    //閉じる前：最後に使用時間を保存
    // ======================================================================================
    flushBeforeClose: function () {
      if (!IS_ACTIVE || isExpired || sessionStartMs <= 0) return;
      var totalNow = getTotalUsedSecondsNow();
      AppSettings.saveNoiseCancelUsedSeconds(totalNow);
      savedTotalSeconds = totalNow;
    },

    canUseFeatures: function () {
      if (!IS_ACTIVE || !isExpired) return true;
      showExpiredMessage();
      return false;
    },

    isExpiredNow: function () {
      return IS_ACTIVE && isExpired;
    }
  };
})();
