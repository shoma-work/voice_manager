# ピッチ精度チューニング（2026-05-21）

ノイズゲート閾値と関連パラメータを、小声・変化への追従を優先する方向に調整した。

## 変更一覧

| 項目 | 変更前 | 変更後 | 効果 |
|------|--------|--------|------|
| `SILENCE_ENERGY_THRESHOLD` | 0.005 | 0.0025 | 小声を無音扱いしにくい |
| `AUTOCORR_MIN_RATIO` | 0.08 | 0.05 | ピッチ判定を寛容に |
| `NOISE_GATE_FACTOR` | 4.0 | 2.5 | 学習後ゲートを下げ、声を拾いやすく |
| `SMOOTH_COEFF` | 0.85 | 0.72 | 表示の遅れを減らす |
| `ANALYSIS_WINDOW_SAMPLES` | 4096 | 8192 | 1回の Hz 推定を安定化 |
| `AUDIO_BUFFER_SIZE` | 4096 | 2048 | グラフ更新を約2倍に |
| `MAX_SAMPLES_HOLD` | 12288 | 16384 | 解析窓に合わせてバッファ拡大 |
| `MAX_OCTAVE_HISTORY` | 450 | 550 | 折れ線の保持点数を増加 |

## 元に戻す

1. `.backup_pre_pitch_tuning/` の `app.js` / `pitch.js` を `js/` にコピー  
2. または `../Voice_manager_web_backup_20260521_pitch_tuning/` フォルダ全体を使う

副作用: 線がガタつきやすい・雑音も拾いやすい。元の方が見た目は安定。
