# Epub Reader (静的ウェブアプリ / PWA)

ブラウザだけで EPUB と画像スキャン書籍（CBZ/ZIP）を読める軽量なリーダーです。Windows / Android / iPad / Quest 3 のブラウザで動作し、しおり・ブックマーク・履歴をローカルに保存します。Cloudflare Workers 経由で Firebase へのクラウド同期も設定できます。

本プロジェクトは開発スピードと試行錯誤を重視し、**AI によるバイブコーディング（vibe coding）**を積極的に取り入れて実装しています。

---

## 特徴

- 📚 EPUB と画像スキャン(CBZ/ZIP)の両対応
- 🔖 しおり / ブックマーク / 履歴の自動保存
- 🔄 クラウド同期 (Cloudflare Workers → Firebase Database)
- 🖼️ 挿絵・画像のクリック拡大、画像書籍のページ送り UI
- 📑 ライブラリ/履歴ビューと進捗表示、最後のしおりからの再開
- 💾 IndexedDB にファイルを保存するため、再読み込み後もアップロード不要
- 📱 PWA 対応（インストール/オフライン利用可能）

---

## 対応環境

- Windows：Chrome / Edge
- Android：Chrome
- iPad：Safari / Chrome（WebKit）
- Quest 3：ブラウザ

※「まずブラウザで使えること」を最優先し、PWA は上乗せで提供します。

---

## アーキテクチャ

```
┌─────────────────────────────┐
│ Browser (Windows/Android/iPad)│
│  - Web App / PWA              │
│  - IndexedDB (library cache)  │
└───────────────┬─────────────┘
                │ HTTPS
                ▼
┌─────────────────────────────┐
│ Cloudflare Workers (API)      │
│  - auth / validation / routing│
└───────────────┬─────────────┘
                │
                ▼
┌─────────────────────────────┐
│ Firebase Database             │
│  - Firestore or Realtime DB   │
│  - bookmarks/history/settings │
└─────────────────────────────┘

(静的配信は Cloudflare Pages)
```

### 運用前提

- **ソース管理**：GitHub（本リポジトリ）
- **ホスティング**：Cloudflare Pages（静的サイトとして配信）
- **同期 API**：Cloudflare Workers（API ゲートウェイとして動作）
- **永続化**：Firebase Database（Firestore または Realtime Database）

---

## 使い方

1. `index.html` をブラウザで開くか、Cloudflare Pages などで公開します。
2. 「EPUB を選択」または「画像スキャン書籍」をクリックし、`.epub` もしくは `.cbz/.zip` を読み込みます。
3. 読書中に「ここにしおりを追加」で位置を保存できます。しおり一覧や履歴から再開可能です。
4. テーマ切替や拡大表示などは画面右側のボタンから操作します。

---

## クラウド同期

### 同期方式の方針

同期 API は **Cloudflare Workers 経由で Firebase にプロキシする方式を採用** します。ブラウザから直接 Firestore を叩く構成は採用しません。

### 同期対象

- しおり / ブックマーク
- 履歴
- 進捗
- UI 設定（テーマ、表示など）

### 設定方法

1. 「クラウド同期エンドポイント」に Workers の URL を設定
2. 「今すぐクラウド同期」を押すと、しおり/履歴/進捗/設定を JSON で送信
3. リクエスト形式は `POST` で `{ action: "save", payload }` または `{ action: "load" }`
4. レスポンスで `{ data: <保存されたJSON> }` を返すと、ブラウザ側に取り込みます
5. API Key が必要な場合はヘッダー `Authorization: Bearer <token>` を付与

### Workers 実装例（参考）

現時点で本番用の Workers 実装はありません。以下は実装の参考例です（保存先は KV / D1 / Firebase などに置き換え可能）。

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

### Google Apps Script 例（参考・非推奨）

Workers 方式を推奨しますが、GAS を使う場合の参考実装です。

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

---

## ⚠️ 同期機能に関する注意（トラブルシューティング）

同期がいつまでも終わらない、または「同期に失敗しました」と表示される場合は、以下をご確認ください。

### 広告ブロック機能の無効化

uBlock Origin, AdBlock, Privacy Badger などの拡張機能を使用している場合、データベース（Google Firebase）への通信が「トラッキング」と誤認されて遮断されることがあります。**本アプリのページ（URL）に対して、これらの機能を OFF（無効）または一時停止に設定してください。**

### Brave ブラウザをご利用の場合

アドレスバーのライオンマーク（Brave Shields）をクリックし、シールドを **DOWN（無効）** に設定して試してください。

### ネットワーク環境

社内ネットワークや学校の Wi-Fi など、ファイアウォールが厳しい環境では Firebase への接続が制限されている場合があります。

---

## 同期・バックアップの流れ

- 「設定・閲覧データを書き出す」で JSON をダウンロードできます（他端末への手動移行用）
- 「設定を読み込む」にバックアップ JSON を渡すと、しおりや履歴が復元されます
- ファイル本体は IndexedDB に保存されます。別端末で開く場合はファイルを再アップロードするか、クラウド同期エンドポイントに同じデータを置いてください

端末移行時は以下のいずれかで復元します：
- (A) クラウド同期
- (B) JSON の手動移行

---

## セットアップ（開発者向け）

### 1) ローカルで起動

静的ファイルなので、ローカル HTTP サーバで動作確認できます。

- Python：`python -m http.server 8000`
- PowerShell：`python -m http.server 8000`（Python がある前提）

起動後：`http://localhost:8000/` を開きます。

### 2) Cloudflare Pages へデプロイ

- GitHub リポジトリと Pages を連携し、`main` への push で自動デプロイ
- 静的サイトのため、基本的にビルド工程は不要（必要になった場合のみ追加）

### 3) Cloudflare Workers（同期 API）

- Workers に同期 API を用意し、Firebase へ接続できるようにします
- 端末側（Web アプリ）には **Workers の URL を設定**します

### 4) Firebase Database（Firestore / Realtime Database）

- 保存データのスキーマ（キー/ユーザー分離/更新方針）を決めます
- セキュリティ（認証・ルール）を決めます

---

## リポジトリ構成（目安）

- `index.html`：アプリ本体
- `assets/`：JS/CSS/画像など
  - `assets/vendor/`：`jszip` / `unrar` などの追加ライブラリ
  - CDN 経由で `epubjs` を読み込み
- `dev.html` / `test.html`：開発・検証用（必要なら `tools/` へ隔離）
- `login.html`：認証検証用（未使用なら削除/隔離）
- `index.html.backup`：バックアップ（運用上は不要。Git 履歴があるため削除推奨）

### 不要コード/不要ファイルの整理方針

本プロジェクトは「AI バイブコーディングで素早く作る」性格上、試作の残骸が溜まりやすい前提です。以下の基準で整理します。

- **本番配信に不要**：`dev.html` / `test.html` / `index.html.backup` などは削除または `tools/` に移動
- **機能が撤去されたのに残っている**：未参照の JS/CSS、旧同期方式（例：GAS 前提）が残っていれば削除
- **実装が二重化している**：同じ責務の関数・設定が複数ある場合は統合

---

## 開発メモ

- 追加ライブラリは `assets/vendor`（`jszip` / `unrar`）と CDN（`epubjs`）経由。ビルド工程は不要です
- コードは `assets/` 配下のプレーン ES Modules で構成しています
- 画像拡大はクリックでモーダル表示、EPUB 内画像も自動で拡大対応します

---

## Roadmap（例）

- PWA の安定化（iPad/Safari の挙動差分吸収）
- 同期の衝突解決（最終更新、マージ方針）
- 共有/複数端末の体験改善

---

## ライセンス

本リポジトリのコードはプロジェクト要件に従い自由に利用してください。
