# Epub Reader (静的ウェブアプリ / PWA)

ブラウザだけで EPUB と画像スキャン書籍（CBZ/ZIP）を読める軽量なリーダーです。Windows / Android / iPad / Quest 3 のブラウザで動作し、しおり・ブックマーク・履歴をローカルに保存します。Cloudflare Workers + D1データベースによるクラウド同期を提供します。

本プロジェクトは開発スピードと試行錯誤を重視し、**AI によるバイブコーディング（vibe coding）**を積極的に取り入れて実装しています。

---

## 特徴

- 📚 EPUB と画像スキャン(CBZ/ZIP)の両対応
- 🔖 しおり / ブックマーク / 履歴の自動保存
- 🔄 Cloudflare Workers + D1 によるクラウド同期
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
│  - Firebase Auth (Google)     │
└───────────┬─────────────────┘
            │
            │   HTTPS
            │   ▼
            │  ┌─────────────────────────────┐
            │  │ Cloudflare Workers (API)      │
            │  │  - auth / validation / routing│
            │  │  - D1 Database Access         │
            │  └───────────────┬─────────────┘
            │                  │
            │                  ▼
            │  ┌─────────────────────────────┐
            │  │ Cloudflare D1 Database        │
            │  │  - bookmarks/history/settings │
            │  │  - user_indexes (書籍一覧)    │
            │  │  - book_states (読書状態)     │
            │  └─────────────────────────────┘

(静的配信は Cloudflare Pages)
```

### 運用前提

- **ソース管理**：GitHub（本リポジトリ）
- **ホスティング**：Cloudflare Pages（静的サイトとして配信）
- **同期方式**：Cloudflare Workers 経由で D1 データベースにアクセス
- **認証**：Firebase Authentication (Google Sign-in)
- **永続化**：Cloudflare D1 Database

---

## 使い方

1. `index.html` をブラウザで開くか、Cloudflare Pages などで公開します。
2. 「EPUB を選択」または「画像スキャン書籍」をクリックし、`.epub` もしくは `.cbz/.zip` を読み込みます。
3. 読書中に「ここにしおりを追加」で位置を保存できます。しおり一覧や履歴から再開可能です。
4. テーマ切替や拡大表示などは画面右側のボタンから操作します。

---

## RAR 代替手段の評価と対応方針

- 詳細は `docs/rar-support.md` を参照してください。

---

## クラウド同期

### 同期方式

本アプリは **Cloudflare Workers + D1 データベース** によるクラウド同期を採用しています。

この方式の特徴：

- **高速性**: Cloudflare のエッジネットワークで低レイテンシを実現
- **スケーラビリティ**: D1 データベースによる柔軟なデータ管理
- **差分同期**: 変更があったデータのみを同期し、通信量を最小化
- **認証**: Firebase Authentication (Google Sign-in) による安全なアクセス制御

### 同期対象

- しおり / ブックマーク
- 履歴
- 進捗
- UI 設定（テーマ、表示など）

### 設定方法

#### 1) Firebase Authentication 設定（認証用）

アプリは Google Sign-in による認証を使用します。設定は自動で行われます。

#### 2) Cloudflare Workers エンドポイント設定

デフォルトで以下のエンドポイントが設定されています：

```
https://bookreader-dev.taka-hiyo.workers.dev
```

カスタムエンドポイントを使用する場合は、設定画面から変更できます。

#### 3) 同期の実行

1. Google アカウントでログイン
2. 設定完了後、「今すぐクラウド同期」を押します
3. しおり/履歴/進捗/設定が D1 データベースに保存されます
4. 同期完了後、他の端末からも同じデータにアクセスできます

### 技術仕様

#### Cloudflare Workers 実装

Workers はシンプルな API として実装され、D1 データベースへのアクセスを提供します。

主なエンドポイント：
- `/sync/index/pull` - 書籍インデックスの取得（差分同期対応）
- `/sync/index/push` - 書籍インデックスの保存
- `/sync/state/pull` - 書籍の読書状態の取得
- `/sync/state/push` - 書籍の読書状態の保存

#### D1 データベース構造

```sql
-- ユーザーの書籍インデックス
CREATE TABLE user_indexes (
  user_id TEXT NOT NULL UNIQUE,
  data TEXT,          -- JSON形式の書籍一覧
  updated_at INTEGER
);

-- 書籍の読書状態
CREATE TABLE book_states (
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  data TEXT,          -- JSON形式の読書状態（しおり、進捗など）
  updated_at INTEGER,
  UNIQUE (user_id, book_id)
);
```

---

## ⚠️ 同期機能に関する注意（トラブルシューティング）

### 一般的な問題

#### 1. 広告ブロック機能の確認

uBlock Origin, AdBlock, Privacy Badger などが有効な場合、Cloudflare Workers への通信が遮断される可能性があります。本アプリのページに対してこれらの機能を無効化してください。

#### 2. Brave ブラウザの場合

アドレスバーのライオンマーク（Brave Shields）をクリックし、シールドを **DOWN（無効）** に設定してください。

#### 3. ネットワーク環境の確認

社内ネットワークや学校の Wi-Fi で、Workers への接続が制限されている場合があります。

#### 4. 開発者ツールでの確認

ブラウザの開発者ツール（F12）→ Console タブで同期の状態を確認できます。

---

## 同期・バックアップの流れ

- 「設定・閲覧データを書き出す」で JSON をダウンロードできます（他端末への手動移行用）
- 「設定を読み込む」にバックアップ JSON を渡すと、しおりや履歴が復元されます
- ファイル本体は IndexedDB に保存されます。別端末で開く場合はファイルを再アップロードするか、クラウド同期で設定を復元してください

端末移行時は以下のいずれかで復元します：
- (A) クラウド同期（Cloudflare D1）
- (B) JSON の手動移行

---

## セットアップ（開発者向け）

### 1) ローカルで起動

静的ファイルなので、ローカル HTTP サーバで動作確認できます。

- Python：`python -m http.server 8000`
- Node.js：`npx serve`

起動後：`http://localhost:8000/` を開きます。

### 2) Firebase Authentication のセットアップ

1. Firebase Console でプロジェクトを作成
2. Authentication を有効化し、Google Sign-in を設定
3. ウェブアプリを追加して Firebase 設定を取得
4. `assets/constants/runtime-config.js` の `FIREBASE_CONFIG` を更新

### 3) Cloudflare Pages へデプロイ

- GitHub リポジトリと Pages を連携し、`main` への push で自動デプロイ
- 静的サイトのため、基本的にビルド工程は不要

### 4) Cloudflare Workers + D1 のセットアップ

1. Workers プロジェクトを作成：

```bash
cd workers
npm install
```

2. D1 データベースを作成：

```bash
wrangler d1 create bookreader-dev-db
```

3. `wrangler.toml` に D1 バインディングを設定（既に設定済み）

4. マイグレーションを実行：

```bash
wrangler d1 migrations apply bookreader-dev-db
```

5. デプロイ：

```bash
wrangler deploy
```

6. デプロイされた Workers の URL を `assets/constants/runtime-config.js` の `WORKERS_CONFIG.SYNC_ENDPOINT` に設定
---

## リポジトリ構成（目安）

- `index.html`：アプリ本体
- `assets/`：JS/CSS/画像など
  - `assets/cloudSync.js`：同期ロジック（Cloudflare D1）
  - `assets/auth.js`：Firebase Authentication (Google Sign-in)
  - `assets/js/core/`：コア機能（ファイル処理、同期ロジックなど）
  - `assets/constants/`：設定値（SSOT）
  - CDN 経由で `epubjs` と Firebase Auth SDK を読み込み
- `workers/`：Cloudflare Workers のコード（D1 API）
- `dev.html` / `test.html`：開発・検証用（必要なら `tools/` へ隔離）

### 不要コード/不要ファイルの整理方針

本プロジェクトは「AI バイブコーディングで素早く作る」性格上、試作の残骸が溜まりやすい前提です。以下の基準で整理します。

- **本番配信に不要**：`dev.html` / `test.html` / `index.html.backup` などは削除または `tools/` に移動
- **旧実装の残骸**：Firebase Database や GAS 前提のコードは削除済み（現在は Cloudflare D1 使用）
- **実装が二重化している**：同じ責務の関数・設定が複数ある場合は統合

---

## 開発メモ

- Cloudflare Workers + D1 によるクラウド同期を実装
- Firebase Authentication (Google Sign-in) で認証
- 追加ライブラリは `assets/vendor` と CDN 経由で管理（ビルド工程不要）

---

## Roadmap（例）

- ✅ Cloudflare D1 への移行完了
- PWA の安定化（iPad/Safari の挙動差分吸収）
- 同期の衝突解決（最終更新タイムスタンプベース、マージ方針）
- 複数端末間のリアルタイム同期（WebSocket または Polling）
- オフライン対応の強化（IndexedDB との同期キュー）

---

## ライセンス

本リポジトリのコードはプロジェクト要件に従い自由に利用してください。
