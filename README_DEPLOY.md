# 高松天気チェッカー mock UI v6.1 status fix

v6で追加した精度補強の表示・取得状態を整理した版です。

## 修正内容

- 古いlocalStorageキャッシュを読まないように、アプリ内部バージョンとキャッシュキーを更新
- `satellite / runs` が入っていない古いキャッシュは無視して再取得
- 取得中 / OK / 失敗 / 未取得 を明確化
- 衛星日射・実測日照の `--` 表示をなるべく廃止
- 未来日では
  - 衛星日射: 当日確認
  - 実測日照: 当日確認
  と表示
- 今日で取得できない場合は
  - 取得失敗
  - 夜/待ち
  - 日照なし
  などに分けて表示
- Satellite Radiation APIは `shortwave_radiation + sunshine_duration` で試し、失敗時は `shortwave_radiation` のみで再試行
- Previous Model Runs APIはモデル指定なしに変更し、失敗時は変数セットを変えて再試行
- 判定材料の説明文にも、衛星日射・予報安定度・実測日照の状態を自然な文言で反映

## 維持

- 背景WebP
- 9:00〜17:00判定
- 最高 / 良い / 普通 / 弱い
- 夜背景は今日だけ
- Open-Meteo通常予報 / JMA / Marine / アメダス / 衛星日射 / Previous Runs

## 確認URL

https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=mock-ui61
