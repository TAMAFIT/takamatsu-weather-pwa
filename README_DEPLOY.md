# 高松天気チェッカー mock UI v6.2.1 recovery

v6.2でローカルHTML表示時に取得失敗になった場合の復旧版です。

## 修正内容

- 通常予報APIを3段階で再試行
  1. フル変数
  2. 軽量変数
  3. 最小変数
- 古いlocalStorageキャッシュもフォールバックとして読む
  - v6.2
  - v6.1
  - v6
  - v5
  - 旧v2系
- v6.2の自前安定度は維持
- 安定度APIへの依存廃止は維持
- アメダス失敗時の衛星補正表示は維持
- 取得失敗時の説明を明確化

## 注意

ローカルHTML（file:///）でも動く可能性は上げていますが、API取得はブラウザ・通信環境・CORSの影響を受けます。
安定運用はGitHub Pages上での確認が推奨です。

## 確認URL

https://TAMAFIT.github.io/takamatsu-weather-pwa/?v=mock-ui621
