# Epub Reader (静的ウェブアプリ)

ブラウザだけで EPUB と画像スキャン書籍（CBZ/ZIP）を読める軽量なリーダーです。Windows / Android / iPad / Quest 3 のブラウザで動作し、しおり・ブックマーク・履歴をローカルに保存します。Cloudflare Workers や Google Apps Script を使ったクラウド同期も設定できます。

## 特徴
- 📚 EPUB と画像スキャン(CBZ/ZIP)の両対応
- 🔖 しおり / ブックマーク / 履歴の自動保存
- 🔄 クラウド同期 (任意の HTTP エンドポイントに JSON で保存/取得)
- 🖼️ 挿絵・画像のクリック拡大、画像書籍のページ送り UI
- 📑 ライブラリ/履歴ビューと進捗表示、最後のしおりからの再開
- 💾 IndexedDB にファイルを保存するため、再読み込み後もアップロード不要

## 使い方
1. `index.html` をブラウザで開くか、任意の静的ホスティング（GitHub Pages / Cloudflare Pages など）で公開します。
2. 「EPUB を選択」または「画像スキャン書籍」をクリックし、`.epub` もしくは `.cbz/.zip` を読み込みます。
3. 読書中に「ここにしおりを追加」で位置を保存できます。しおり一覧や履歴から再開可能です。
4. テーマ切替や拡大表示などは画面右側のボタンから操作します。

## クラウド同期
- 「クラウド同期エンドポイント」に任意の URL を設定し、「今すぐクラウド同期」を押すと、しおり/履歴/進捗/設定を JSON で送信します。
- リクエスト形式は `POST` で `{ action: "save", payload }` または `{ action: "load" }` を送ります。レスポンスで `{ data: <保存されたJSON> }` を返すと、ブラウザ側に取り込みます。
- API Key が必要な場合はヘッダー `Authorization: Bearer <token>` を付与します。

### Cloudflare Workers 例 (保存先は KV / D1 などに置き換え可能)
```js
export default {
  async fetch(request, env) {
    const { action, payload } = await request.json();
    if (action === "save") {
      await env.STORE.put("epub-reader", JSON.stringify(payload.data));
      return new Response(JSON.stringify({ ok: true }));
    }
    if (action === "load") {
      const saved = await env.STORE.get("epub-reader");
      return new Response(JSON.stringify({ data: saved ? JSON.parse(saved) : null }));
    }
    return new Response("bad request", { status: 400 });
  },
};
```

### Google Apps Script 例 (スクリプトプロパティに保存)
```js
const KEY = "epub-reader";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === "save") {
    PropertiesService.getScriptProperties().setProperty(KEY, JSON.stringify(body.payload.data));
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }
  if (body.action === "load") {
    const saved = PropertiesService.getScriptProperties().getProperty(KEY);
    return ContentService.createTextOutput(JSON.stringify({ data: saved ? JSON.parse(saved) : null })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput("bad request").setMimeType(ContentService.MimeType.TEXT);
}
```

## 同期・バックアップの流れ
- 「設定・閲覧データを書き出す」で JSON をダウンロードできます（他端末への手動移行用）。
- 「設定を読み込む」にバックアップ JSON を渡すと、しおりや履歴が復元されます。
- ファイル本体は IndexedDB に保存されます。別端末で開く場合はファイルを再アップロードするか、クラウド同期エンドポイントに同じデータを置いてください。

## ⚠️ 同期機能に関する注意（トラブルシューティング）
同期がいつまでも終わらない、または「同期に失敗しました」と表示される場合は、以下をご確認ください。

### 広告ブロック機能の無効化
uBlock Origin, AdBlock, Privacy Badger などの拡張機能を使用している場合、データベース（Google Firebase）への通信が「トラッキング」と誤認されて遮断されることがあります。
**本アプリのページ（URL）に対して、これらの機能をOFF（無効）または一時停止に設定してください。**

### Brave ブラウザをご利用の場合
アドレスバーのライオンマーク（Brave Shields）をクリックし、シールドを**DOWN（無効）**に設定して試してください。

### ネットワーク環境
社内ネットワークや学校のWi-Fiなど、ファイアウォールが厳しい環境では Firebase への接続が制限されている場合があります。

## 開発メモ
- 追加ライブラリは `assets/vendor`（`jszip` / `unrar`）と CDN（`epubjs`）経由。ビルド工程は不要です。
- コードは `assets/` 配下のプレーン ES Modules で構成しています。
- 画像拡大はクリックでモーダル表示、EPUB 内画像も自動で拡大対応します。

## ライセンス
本リポジトリのコードはプロジェクト要件に従い自由に利用してください。
