# 高松天気チェッカー mock UI v6 accuracy

無料範囲で精度補強を追加した版です。

## 追加したもの

- Open-Meteo Satellite Radiation API
  - 衛星から推定した日射量を取得
  - 「晴れ予報だが実際に日射が弱い」を補正
- アメダス日照の時系列
  - 最新値だけでなく、直近約3時間の推移を取得
  - 実測日照が上向き/日照なし/横ばいかを判定
- Previous Model Runs API
  - 1日前/2日前の予報と現在予報のズレを見る
  - 予報の安定度を信頼度に反映

## UI追加

- 判断材料に「衛星日射」「実測日照」を追加
- 取得状況に「衛星日射」「安定度」を追加
- compareNoteに衛星日射・実測日照推移・予報安定度を追記

## 維持

- 背景WebP
- 9:00〜17:00判定
- 最高 / 良い / 普通 / 弱い
- 夜背景は今日だけ
- 既存のOpen-Meteo通常予報 / JMA / Marine / アメダス

## 確認URL

https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=mock-ui6
