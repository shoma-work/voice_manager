// 朗読チャレンジのお題（追加・削除・保存）

var GamePrompts = (function () {
  var DEFAULT_PROMPTS = [
    { id: "default_1", text: "今日は、良い天気ですね。" },
    { id: "default_2", text: "おはようございます。元気ですか。" },
    { id: "default_3", text: "電車が、もうすぐ到着します。" },
    { id: "default_4", text: "ありがとうございました。" },
    { id: "default_5", text: "少し声を大きくして、はっきり読んでみましょう。" }
  ];

  var prompts = null;                         // 現在のお題一覧


  // ======================================================================================
  //保存済みを読み込み、なければ初期お題を使う
  // ======================================================================================
  function ensureLoaded() {
    if (prompts) return prompts;

    var saved = AppSettings.loadReadingPrompts();
    if (saved && saved.length > 0) {
      prompts = normalizeList(saved);
    } else {
      prompts = DEFAULT_PROMPTS.slice();
      AppSettings.saveReadingPrompts(prompts);
    }
    return prompts;
  }


  // ======================================================================================
  //お題の形をそろえる
  // ======================================================================================
  function normalizeList(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !item.text) continue;
      var text = String(item.text).trim();
      if (!text) continue;
      out.push({
        id: item.id || makeId(),
        text: text
      });
    }
    return out;
  }


  // ======================================================================================
  //新しいお題用の ID を作る
  // ======================================================================================
  function makeId() {
    return "prompt_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }


  return {
    getAll: function () {
      return ensureLoaded().slice();
    },

    getById: function (id) {
      var list = ensureLoaded();
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    },

    add: function (text) {
      var trimmed = String(text || "").trim();
      if (!trimmed) return null;

      ensureLoaded();
      var item = { id: makeId(), text: trimmed };
      prompts.push(item);
      AppSettings.saveReadingPrompts(prompts);
      return item;
    },

    remove: function (id) {
      ensureLoaded();
      var next = [];
      var i;
      for (i = 0; i < prompts.length; i++) {
        if (prompts[i].id !== id) {
          next.push(prompts[i]);
        }
      }
      if (next.length === prompts.length) return false;
      prompts = next;
      AppSettings.saveReadingPrompts(prompts);
      return true;
    },

    resetToDefaults: function () {
      prompts = DEFAULT_PROMPTS.slice();
      AppSettings.saveReadingPrompts(prompts);
      return prompts.slice();
    }
  };
})();
