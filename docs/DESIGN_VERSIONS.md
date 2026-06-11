# 画面デザインのバージョン管理

[Semantic Versioning](https://semver.org/lang/ja/)（`MAJOR.MINOR.PATCH`）に従います。

| 桁 | 意味（デザイン） | 例 |
|----|------------------|-----|
| MAJOR | 画面構成の大きな作り替え | 1.0.0 → 2.0.0 |
| MINOR | レイアウト・部品の追加・変更 | 1.0.2 → 1.1.0 |
| PATCH | 色・余白・フォントなど見た目の微調整 | 1.0.1 → 1.0.2 |

ユーザー向けの「ver1.02」は **1.0.2**、「ver1.10」は **1.1.0** と同じ意味です。

## スナップショット一覧

| バージョン | CSS | HTML | 内容 |
|-----------|-----|------|------|
| **1.0.0** | `css/versions/app-v1.0.0.css` | — | 初期デザイン（堅め・グレー背景） |
| **1.0.1** | `css/versions/app-v1.0.1.css` | `docs/versions/index-v1.0.1.html` | 明るいカジュアル調 |
| **1.0.2** | `css/versions/app-v1.0.2.css` | `docs/versions/index-v1.0.1.html` | 色味調整のみ（1.0.1 レイアウト） |
| **1.1.0** | `css/app.css` | `docs/versions/index-v1.1.0.html` | 2カラムレイアウト + 1.0.2 配色 |

現在のバージョンは `js/design-version.js` の `DesignVersion.current` を参照（画面には表示しない）。

## 以前のデザインに戻す

### 1.0.2 まで（色だけ・縦1列レイアウト）

```powershell
Copy-Item css/versions/app-v1.0.2.css css/app.css
Copy-Item docs/versions/index-v1.0.1.html index.html
```

### 1.0.1 まで

```powershell
Copy-Item css/versions/app-v1.0.1.css css/app.css
Copy-Item docs/versions/index-v1.0.1.html index.html
```

### 1.0.0 まで

```powershell
Copy-Item css/versions/app-v1.0.0.css css/app.css
```

`js/design-version.js` の `current` も合わせて書き換える。

## 新しいバージョンを足すとき

1. 変更前の `css/app.css` を `css/versions/app-vX.Y.Z.css` にコピー
2. レイアウト変更時は `index.html` を `docs/versions/index-vX.Y.Z.html` にもコピー
3. `css/app.css`（と必要なら `index.html`）を編集
4. `js/design-version.js` の `current` と `snapshots` を更新
