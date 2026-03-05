# 📖 BookReader

**ブラウザで動く軽量な EPUB / 画像アーカイブリーダー**

サーバー不要・インストール不要。ブラウザでファイルを開くだけで、EPUB や画像書庫（ZIP/RAR）をすぐに読めるPWAアプリです。

> **デモ**: [https://takahiyo.github.io/epubReader/](https://takahiyo.github.io/epubReader/)

---

## ✨ 主要機能

### 対応フォーマット

| 種別 | 拡張子 |
|------|--------|
| EPUB | `.epub` |
| 画像アーカイブ | `.cbz` `.zip` `.rar` `.cbr` |

アーカイブ内の画像形式: PNG, JPG, GIF, WebP, BMP, AVIF, JFIF, HEIC, HEIF, TIFF

### 閲覧モード

- **ページめくり / シームレススクロール** — EPUB の表示方式を切り替え可能
- **縦書き（`vertical-rl`）/ 横書き（`horizontal-tb`）** — 日本語コンテンツに最適化
- **単ページ / 見開き** — 画像書庫の表示方式を切り替え可能
- **RTL / LTR** — 読み進める方向を切り替え可能

### UI 機能

- 🌙 **ダーク / ライトテーマ** の切り替え
- 🔤 **フォントサイズ調整**（12px 〜 28px）
- 🔍 **ピンチ & ホイールズーム**（スライダー付き）
- 🔖 **しおり**（ブックマーク管理・進捗バー上にマーカー表示）
- 🔎 **テキスト検索**（EPUB 内全文検索・ハイライト表示）
- 📑 **目次ナビゲーション**
- 📚 **ライブラリ管理**（グリッド / リスト表示・検索・削除）
- 📜 **閲覧履歴**
- 📊 **進捗バー**（ページ番号 / パーセント表示切り替え）
- 📂 **ドラッグ＆ドロップ** でファイルを開く
- 🖥️ **フルスクリーン** 対応
- 📱 **レスポンシブデザイン**（モバイル・タブレット・デスクトップ）

### 多言語対応

- 🇯🇵 日本語 / 🇺🇸 英語 の切り替え（UI 全体が動的に切り替わります）

### PWA（Progressive Web App）

- **オフライン対応** — Service Worker による全アセットキャッシュ
- **インストール可能** — ホーム画面に追加してネイティブアプリのように利用可能

### クラウド同期

- **Firebase Authentication** による Google ログイン
- **Cloudflare Workers**（KV / D1）による読書進捗・しおりのクラウド同期
- 複数デバイス間で読書状態を自動同期
- デバイスごとの識別・競合解決

### Notion 連携

- Notion OAuth を通じた読書データの連携

### ローカルストレージ

- **IndexedDB** — ファイルデータの永続化
- **OPFS**（Origin Private File System）— 大容量ファイルの効率的な保存
- **LocalStorage** — 設定・進捗・履歴の保存

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Vanilla JavaScript（ES Modules） |
| スタイリング | CSS 変数ベースのデザインシステム（20 レイヤー構成） |
| EPUB パーサー | [EPUB.js](https://github.com/futurepress/epub.js) |
| ZIP 展開 | [JSZip](https://stuk.github.io/jszip/) |
| RAR 展開 | [unrar.js](https://github.com/nickthedude/unrar.js)（WASM） |
| アニメーション | [Lottie](https://airbnb.design/lottie/) |
| 認証 | Firebase Authentication |
| バックエンド | Cloudflare Workers（KV + D1） |
| ホスティング | GitHub Pages / Cloudflare Pages |

---

## 📁 プロジェクト構成

```
epubReader/
├── index.html              … メインエントリーポイント
├── manifest.json           … PWA マニフェスト
├── sw.js                   … Service Worker
├── assets/
│   ├── app.js              … メインアプリケーション
│   ├── reader.js           … リーダーコントローラー
│   ├── storage.js          … ローカルストレージ管理
│   ├── cloudSync.js        … クラウド同期ロジック
│   ├── fileStore.js        … IndexedDB / OPFS ファイル管理
│   ├── auth.js             … Firebase 認証
│   ├── ui.js               … UI ヘルパー
│   ├── config.js            … 設定の初期化
│   ├── constants/          … 定数定義（SSOT）
│   │   ├── app-info.js     … アプリ情報
│   │   ├── reader.js       … リーダー設定
│   │   ├── formats.js      … 対応フォーマット
│   │   ├── storage.js      … ストレージ設定
│   │   ├── ui.js           … UI 定数
│   │   └── ...
│   ├── i18n/               … 多言語リソース（ja / en）
│   ├── css/                … CSS レイヤー（01-tokens 〜 20-drag-drop）
│   ├── js/
│   │   ├── core/           … ファイルハンドラー・同期ロジック
│   │   └── ui/             … レンダラー・要素管理
│   └── vendor/             … サードパーティライブラリ
├── src/
│   └── reader/
│       └── epubPaginator.js … EPUB ページネーション
├── workers/                … Cloudflare Workers（バックエンド API）
│   ├── src/index.js        … Worker エントリーポイント
│   ├── wrangler.toml       … Wrangler 設定
│   └── migrations/         … D1 マイグレーション
└── docs/                   … 開発ドキュメント
```

---

## 🚀 セットアップ

### ローカル開発

```bash
# リポジトリをクローン
git clone https://github.com/takahiyo/epubReader.git
cd epubReader

# 任意のHTTPサーバーで起動（ES Modules を使用しているためファイル直開きは不可）
npx serve .
# または
python -m http.server 8000
```

ブラウザで `http://localhost:3000`（または `http://localhost:8000`）にアクセスしてください。

### デプロイ

- **GitHub Pages**: [GITHUB_PAGES_SETUP.md](./GITHUB_PAGES_SETUP.md) を参照
- **Cloudflare Pages**: リポジトリを接続し、ビルドコマンドなし・出力ディレクトリを `/` に設定

### Cloudflare Workers（バックエンド）

```bash
cd workers
npm install
npx wrangler dev    # ローカル開発
npx wrangler deploy # 本番デプロイ
```

---

## 📄 開発ガイドライン

AI コーディングガイドライン・設計原則については以下のドキュメントを参照してください。

| ファイル | 内容 |
|----------|------|
| [CORE_PRINCIPLES.md](./CORE_PRINCIPLES.md) | 基本原則（SSOT・モジュール化） |
| [INDEX.md](./INDEX.md) | 目次・運用説明 |
| [MODULE_GUIDE.md](./MODULE_GUIDE.md) | モジュール化・依存注入 |
| [SSOT_GUIDE.md](./SSOT_GUIDE.md) | 定数管理・SSOT 実践 |
| [CSS_GUIDE.md](./CSS_GUIDE.md) | CSS 分割の詳細規則 |
| [COMMENT_GUIDE.md](./COMMENT_GUIDE.md) | コメント・ドキュメント規約 |
| [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) | 分割・リファクタリング |

---

## 📝 ライセンス

このプロジェクトは個人利用を目的としています。
