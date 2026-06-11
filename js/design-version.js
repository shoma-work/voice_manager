// 画面デザインのバージョン（Semantic Versioning: MAJOR.MINOR.PATCH）

var DesignVersion = {
  current: "1.1.0",
  description: "2カラムレイアウト + ピーチ・ミント・ラベンダー配色",
  cssActive: "css/app.css",
  htmlActive: "index.html",
  snapshots: {
    "1.0.0": {
      css: "css/versions/app-v1.0.0.css",
      html: null,
      description: "初期デザイン（Bootstrap 標準寄り・グレー背景）"
    },
    "1.0.1": {
      css: "css/versions/app-v1.0.1.css",
      html: "docs/versions/index-v1.0.1.html",
      description: "明るいカジュアル調（角丸・パステル・やわらかい影）"
    },
    "1.0.2": {
      css: "css/versions/app-v1.0.2.css",
      html: "docs/versions/index-v1.0.1.html",
      description: "色味調整（ピーチ・ミント・ラベンダー）"
    },
    "1.1.0": {
      css: "css/app.css",
      html: "docs/versions/index-v1.1.0.html",
      description: "2カラムレイアウト（設定とグラフ／操作と波形を分離）"
    }
  }
};
