# voice_manager（Web 版）

Windows 版 voice_manager と同じ機能を、**HTML + JavaScript + jQuery + Bootstrap** で実装したものです。

## 使い方

1. **HTTPS または localhost** で開く（マイクは安全な接続が必要）
2. `index.html` をブラウザで開く、または簡易サーバーで配信

```powershell
# 例: プロジェクトフォルダで
python -m http.server 8080
# ブラウザで http://localhost:8080/
```

3. マイクの利用を「許可」する
4. 必要なら「周囲の音を学習」→ 基準・目標を設定 → 話す

## GitHub Pages で公開する

GitHub にプッシュして無料ホストする手順は **`docs/GITHUB_PAGES.md`** に書いてあります。

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `index.html` | 画面（Bootstrap） |
| `css/app.css` | 見た目の調整 |
| `js/settings.js` | 設定の保存（localStorage） |
| `js/pitch.js` | 音の高さの計算 |
| `js/graph.js` | グラフ描画 |
| `js/trial-limit.js` | デモ版 累計3時間制限 |
| `js/voice-constants.js` | グラフ・目標のオクターブ範囲（共通） |
| `js/app.js` | メイン処理・マイク |

## 設定の保存

ブラウザの **localStorage**（キー `voice_manager_settings`）に JSON で保存します。

| キー | 内容 |
|------|------|
| `last_device_name` | マイク名 |
| `baseline_hz` | 基準 Hz |
| `noise_cancel` | 累計使用秒（2進数文字列・デモ用） |
| `target_octave` | 目標オクターブ |
| `target_enabled` | 目標線を表示するか |

## デモ版制限の解除

`js/trial-limit.js` の `IS_ACTIVE` を `false` に変更するか、ファイルごと削除し `app.js` から `TrialLimit` の呼び出しを削除してください。

## 参照

仕様の正: `../WindowsApp2test/WindowsApp2teest/` の VB 版
