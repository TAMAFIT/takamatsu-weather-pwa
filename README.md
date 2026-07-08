# 高松市 天気ダッシュボード

高松市の1週間・3時間ごとの天気を確認し、外出・移動・日山登山の判断を補助する静的PWAです。

## v2で追加した機能

- 今から3時間の雨判断カード
- 危険時間帯の自動抽出
- Open-Meteo通常予報とOpen-Meteo JMA APIの比較
- 予報一致度：高 / 中 / 低 / 取得不可
- 通常予報リスクとJMA予報リスクの比較表示
- 雨リスク判定ロジックの強化
- 行動アドバイスの具体化

## 構成

- `index.html`：画面構造
- `style.css`：スマホ向けカードUI
- `app.js`：Open-Meteo取得、JMA比較、雨リスク判定、描画処理
- `manifest.webmanifest`：PWA設定
- `sw.js`：簡易Service Worker
- `icons/icon.svg`：アプリアイコン

## データ取得

Open-Meteo APIをブラウザから直接取得します。GASやサーバーは不要です。

現在は2系統の予報を取得します。

```text
https://api.open-meteo.com/v1/forecast
https://api.open-meteo.com/v1/jma
```

JMA API側は降水確率を返さないため、JMA比較では主に降水量・天気コード・風速を使って雨リスクを判定しています。

初期地点は高松市中心部付近です。地点を変更する場合は `app.js` の `LOCATION` を編集してください。

```js
const LOCATION = { name: '高松市', latitude: 34.3428, longitude: 134.0466, timezone: 'Asia/Tokyo' };
```

## GitHub Pagesで公開する手順

1. GitHubのリポジトリ画面を開く
2. `Settings` を開く
3. 左メニューの `Pages` を開く
4. `Build and deployment` の `Source` を `Deploy from a branch` にする
5. Branchを `main`、フォルダを `/root` にする
6. `Save`
7. 数十秒〜数分後に公開URLが表示されます

公開URLの例：

```text
https://TAMAFIT.github.io/takamatsu-weather-pwa/
```

## スマホで使う

### Android

Chromeで公開URLを開き、メニューから「ホーム画面に追加」または「インストール」を選びます。

### iPhone

Safariで公開URLを開き、共有ボタンから「ホーム画面に追加」を選びます。

## 注意

このアプリは個人用の判断補助です。雷雨・台風・警報注意報が関係する日は、気象庁などの公式情報も確認してください。
