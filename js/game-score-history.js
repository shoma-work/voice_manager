// 朗読チャレンジの点数履歴（ブラウザに自動保存）

var GameScoreHistory = (function () {
  var MAX_ENTRIES = 200;                      // 保持する件数の上限


  // ======================================================================================
  //履歴を読む
  // ======================================================================================
  function loadHistory() {
    return AppSettings.loadReadingScoreHistory();
  }


  // ======================================================================================
  //履歴を書く
  // ======================================================================================
  function saveHistory(history) {
    AppSettings.saveReadingScoreHistory(history);
  }


  // ======================================================================================
  //日時を表示用に整える
  // ======================================================================================
  function formatDateTime(atMs) {
    var d = new Date(atMs);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return y + "/" + m + "/" + day + " " + h + ":" + min;
  }


  // ======================================================================================
  //内訳ラベルを作る
  // ======================================================================================
  function breakdownLabel(result) {
    if (result.scoreMode === "record") {
      return "一致" + result.intonation + " タイミング" + result.rhythm + " 安定" + result.stability;
    }
    return "抑揚" + result.intonation + " リズム" + result.rhythm + " 安定" + result.stability;
  }


  return {
    addEntry: function (promptId, promptText, result) {
      if (!result || !result.ok) return null;

      var history = loadHistory();
      var entry = {
        id: "score_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
        promptId: promptId || "",
        promptText: String(promptText || "").trim(),
        total: result.total,
        rank: result.rank,
        intonation: result.intonation,
        rhythm: result.rhythm,
        stability: result.stability,
        scoreMode: result.scoreMode || "default",
        at: Date.now()
      };
      history.unshift(entry);
      if (history.length > MAX_ENTRIES) {
        history.length = MAX_ENTRIES;
      }
      saveHistory(history);
      return entry;
    },

    getAll: function () {
      return loadHistory().slice();
    },

    clearAll: function () {
      saveHistory([]);
    },

    removeByPromptId: function (promptId) {
      if (!promptId) return;
      var history = loadHistory();
      var next = [];
      var i;
      for (i = 0; i < history.length; i++) {
        if (history[i].promptId !== promptId) {
          next.push(history[i]);
        }
      }
      saveHistory(next);
    },

    formatDateTime: formatDateTime,

    breakdownLabel: breakdownLabel
  };
})();
