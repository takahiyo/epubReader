# Epub Reader (静的ウェブアプリ / PWA)

ブラウザだけで EPUB と画像スキャン書籍（CBZ/ZIP）を読める軽量なリーダーです。Windows / Android / iPad / Quest 3 のブラウザで動作し、しおり・ブックマーク・履歴をローカルに保存します。Firebase SDK での直接通信と、フォールバック用の Cloudflare Workers 経由通信による冗長化されたクラウド同期を提供します。

本プロジェクトは開発スピードと試行錯誤を重視し、**AI によるバイブコーディング（vibe coding）**を積極的に取り入れて実装しています。

---

## 特徴

- 📚 EPUB と画像スキャン(CBZ/ZIP)の両対応
- 🔖 しおり / ブックマーク / 履歴の自動保存
- 🔄 冗長化されたクラウド同期 (Firebase SDK → フォールバック: Cloudflare Workers)
- 🖼️ 挿絵・画像のクリック拡大、画像書籍のページ送り UI
- 📑 ライブラリ/履歴ビューと進捗表示、最後のしおりからの再開
- 💾 IndexedDB にファイルを保存するため、再読み込み後もアップロード不要
- 📱 PWA 対応（インストール/オフライン利用可能）
- 🥽 Quest 3 ブラウザ対応（VR環境での読書体験）

---

## 対応環境

- **Windows**：Chrome / Edge
- **Android**：Chrome
- **iPad**：Safari / Chrome（WebKit）
- **Quest 3**：Meta Quest Browser

※「まずブラウザで使えること」を最優先し、PWA は上乗せで提供します。

### Quest 3 対応に関する重要事項

Quest 3 でのブラウザ利用を継続的にサポートするため、以下の要件を満たす必要があります：

#### 1. ブラウザ環境の制約

- **Meta Quest Browser の仕様**：Chromium ベースですが、独自の制約があります
- **ファイルアップロード**：Quest 3 のブラウザはローカルファイルシステムへのアクセスが制限されているため、ファイル選択UIに特別な配慮が必要
- **パフォーマンス**：VR デバイスのため、メモリとCPUリソースに制約があります

#### 2. 必須の技術要件

- **標準 Web API のみ使用**：Quest Browser で動作する標準的な Web API に限定
  - `File API`（ファイル読み込み）
  - `IndexedDB`（ローカルストレージ）
  - `Fetch API`（ネットワーク通信）
- **Firebase SDK の互換性**：
  - Firebase JavaScript SDK v9+ (modular) は Quest Browser でも動作確認済み
  - CDN 経由での読み込みを推奨（バンドルサイズの最小化）
- **軽量な実装**：
  - 大きな画像や複雑な DOM 操作を避ける
  - レイジーローディングの活用
  - メモリリークの防止

#### 3. UI/UX の考慮事項

- **コントローラー操作**：Quest 3 のハンドコントローラーでの操作を想定
  - クリック可能な要素は十分なサイズを確保（最低44x44px推奨）
  - ホバー効果に依存しない設計
- **視認性**：
  - VR 環境では画面との距離が異なるため、フォントサイズを調整可能に
  - コントラスト比を高く保つ
- **仮想キーボード**：テキスト入力が必要な場合、Quest の仮想キーボードを考慮

#### 4. テスト・検証方法

Quest 3 での動作確認には以下の方法を推奨：

- **実機テスト**：定期的に Quest 3 実機でテストする
- **リモートデバッグ**：
  - Quest Browser の開発者ツールは制限されているため、`console.log` をUI上に表示する仕組みを用意
  - エラーハンドリングを徹底し、ユーザーに分かりやすいエラーメッセージを表示
- **パフォーマンスモニタリング**：
  - メモリ使用量の監視
  - 大きなファイル（100MB以上のEPUB等）での動作確認

#### 5. 既知の制限事項

- **ファイルサイズ**：非常に大きなファイル（200MB以上）は Quest 3 ではパフォーマンスが低下する可能性
- **同時読み込み**：複数の大きなファイルを同時に開くと、メモリ不足でクラッシュする可能性
- **PWA インストール**：Quest Browser での PWA インストールは限定的なサポート

#### 6. 今後の開発での注意点

Quest 3 対応を維持するため、以下を継続的に実施：

- **後方互換性の維持**：新機能追加時も Quest Browser での動作を確認
- **ポリフィルの活用**：最新の Web API を使用する場合、Quest Browser での互換性を確認し、必要に応じてポリフィルを追加
- **フォールバック実装**：Quest 固有の問題が発生した場合のフォールバック処理を用意
- **ドキュメント更新**：Quest 3 での動作に影響する変更があった場合、README を更新

---

## アーキテクチャ

```
┌─────────────────────────────────────┐
│ Browser                              │
│  (Windows/Android/iPad/Quest 3)      │
│  - Web App / PWA                     │
│  - IndexedDB (library cache)         │
│  - Firebase SDK (優先)               │
└───────────┬─────────────────────────┘
            │
            ├─ ① 優先: Firebase SDK (直接通信)
            │   HTTPS
            │   ▼
            │  ┌──────────────────────────────┐
            │  │ Firebase Database             │
            │  │  - Firestore or Realtime DB   │
            │  │  - bookmarks/history/settings │
            │  └──────────────────────────────┘
            │
            └─ ② フォールバック: Cloudflare Workers 経由
                HTTPS
                ▼
               ┌──────────────────────────────┐
               │ Cloudflare Workers (API)      │
               │  - auth / validation / routing│
               └───────────────┬──────────────┘
                               │
                               ▼
               ┌──────────────────────────────┐
               │ Firebase Database             │
               │  - Firestore or Realtime DB   │
               │  - bookmarks/history/settings │
               └──────────────────────────────┘

(静的配信は Cloudflare Pages)
```

### 運用前提

- **ソース管理**：GitHub（本リポジトリ）
- **ホスティング**：Cloudflare Pages（静的サイトとして配信）
- **同期方式（冗長化）**：
  - **優先**: Firebase SDK による直接通信
  - **フォールバック**: Cloudflare Workers 経由での通信（SDK 通信失敗時）
- **永続化**：Firebase Database（Firestore または Realtime Database）

---

## 使い方

1. `index.html` をブラウザで開くか、Cloudflare Pages などで公開します。
2. 「EPUB を選択」または「画像スキャン書籍」をクリックし、`.epub` もしくは `.cbz/.zip` を読み込みます。
3. 読書中に「ここにしおりを追加」で位置を保存できます。しおり一覧や履歴から再開可能です。
4. テーマ切替や拡大表示などは画面右側のボタンから操作します。

### Quest 3 での使い方

1. Quest 3 で Meta Quest Browser を起動
2. アプリの URL にアクセス
3. ファイル選択時は Quest のファイルブラウザが開きます（PC からファイルを転送しておく必要があります）
4. ハンドコントローラーのポインターで操作
5. 読書中は両手コントローラーまたは片手でページ送りが可能

---

## クラウド同期

### 同期方式の方針（冗長化構成）

本アプリは **Firebase SDK による直接通信を優先** し、SDK での通信に失敗した場合に **自動的に Cloudflare Workers 経由の通信にフォールバック** する冗長化構成を採用しています。

この方式により、以下のメリットがあります：

- **通常時の高速性**: Firebase SDK による直接通信で低レイテンシを実現
- **耐障害性**: ネットワーク制限や広告ブロッカーで SDK が使えない環境でも Workers 経由で動作
- **メンテナンス性**: Firebase のメンテナンス時や一時的な障害時も継続利用可能
- **Quest 3 対応**: VR 環境でも確実に同期可能

### 同期対象

- しおり / ブックマーク
- 履歴
- 進捗
- UI 設定（テーマ、表示など）

### 設定方法

#### 1) Firebase SDK 設定（優先方式）

アプリの設定画面で以下の Firebase 設定を入力します：

```json
{
  "apiKey": "your-firebase-api-key",
  "authDomain": "your-app.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-app.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "your-app-id",
  "databaseURL": "https://your-app.firebaseio.com"
}
```

**注意**: Firestore を使う場合は `databaseURL` は不要です。Realtime Database を使う場合は必要です。

#### 2) Cloudflare Workers エンドポイント設定（フォールバック用）

Firebase SDK での通信が失敗した場合に使用される Workers の URL を設定します：

```
https://your-worker.your-subdomain.workers.dev
```

#### 3) 同期の実行

1. 設定完了後、「今すぐクラウド同期」を押します
2. アプリは以下の順序で通信を試行します：
   - **Step 1**: Firebase SDK で直接通信を試行
   - **Step 2**: SDK が失敗した場合、Workers 経由で通信
3. しおり/履歴/進捗/設定が JSON 形式で保存されます
4. 同期完了後、他の端末からも同じデータにアクセスできます

### 通信フローの詳細

```javascript
// 疑似コード
async function syncToCloud(data) {
  try {
    // ① Firebase SDK で直接通信を試行
    await saveToFirebaseSDK(data);
    console.log('Firebase SDK で同期成功');
    return { success: true, method: 'sdk' };
  } catch (sdkError) {
    console.warn('Firebase SDK 通信失敗、Workers にフォールバック', sdkError);
    
    try {
      // ② Workers 経由で通信
      await saveViaWorkers(data);
      console.log('Workers 経由で同期成功');
      return { success: true, method: 'workers' };
    } catch (workersError) {
      console.error('すべての同期方式が失敗', workersError);
      return { success: false, error: workersError };
    }
  }
}
```

### Firebase SDK 実装の要件

ブラウザ側では Firebase JavaScript SDK (v9+ modular SDK) を使用します：

```html
<!-- CDN 経由で読み込み（Quest 3 互換性のため推奨） -->
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
  import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
  // または Realtime Database
  import { getDatabase, ref, set, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
</script>
```

### Workers 実装例（フォールバック用）

Workers はシンプルなプロキシとして実装します。Firebase Admin SDK を使用して Firebase にアクセスします。

```javascript
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export default {
  async fetch(request, env) {
    // CORS 対応（Quest 3 を含むすべてのクライアントから接続可能に）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // Firebase Admin SDK 初期化
      const app = initializeApp({
        credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)),
      });
      const db = getFirestore(app);

      const { action, payload, userId } = await request.json();

      if (action === 'save') {
        // データを保存
        await db.collection('users').doc(userId).set(payload.data, { merge: true });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      if (action === 'load') {
        // データを読み込み
        const docSnap = await db.collection('users').doc(userId).get();
        const data = docSnap.exists ? docSnap.data() : null;
        return new Response(JSON.stringify({ data }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      return new Response('Bad request', { status: 400 });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
```

**環境変数設定**:
- `FIREBASE_SERVICE_ACCOUNT`: Firebase サービスアカウントの JSON キー

---

## ⚠️ 同期機能に関する注意（トラブルシューティング）

### 冗長化構成により改善される問題

本アプリの冗長化構成により、以下のような環境でも同期が動作する可能性が高まります：

- **広告ブロッカー有効時**: Firebase SDK が遮断されても Workers 経由で通信
- **企業ネットワーク**: Firebase SDK がファイアウォールで遮断されても Workers 経由で通信
- **一部のモバイル環境**: SDK の初期化に失敗する環境でも Workers で補完
- **Quest 3 環境**: VR 特有のネットワーク制約がある場合も Workers で対応

### それでも同期が失敗する場合

#### 1. 広告ブロック機能の確認

uBlock Origin, AdBlock, Privacy Badger などが有効な場合、**両方の通信経路が遮断される可能性**があります。本アプリのページに対してこれらの機能を無効化してください。

#### 2. Brave ブラウザの場合

アドレスバーのライオンマーク（Brave Shields）をクリックし、シールドを **DOWN（無効）** に設定してください。

#### 3. Quest 3 の場合

- Meta Quest Browser の設定で、サイトへのアクセス権限を確認
- Quest のネットワーク設定を確認（Wi-Fi 接続が安定しているか）
- Quest の開発者モードが有効な場合、通信が制限される可能性があります

#### 4. ネットワーク環境の確認

社内ネットワークや学校の Wi-Fi で、Firebase と Workers の両方への接続が制限されている場合があります。

#### 5. 開発者ツールでの確認

ブラウザの開発者ツール（F12）→ Console タブで、どちらの通信方式が使用されているか確認できます：

- `Firebase SDK で同期成功` → SDK での直接通信が成功
- `Firebase SDK 通信失敗、Workers にフォールバック` → Workers 経由に切り替わった
- `すべての同期方式が失敗` → 両方とも失敗（設定や環境を確認）

**Quest 3 の場合**：開発者ツールが使いにくいため、アプリ内にデバッグログ表示機能を実装することを推奨します。

---

## 同期・バックアップの流れ

- 「設定・閲覧データを書き出す」で JSON をダウンロードできます（他端末への手動移行用）
- 「設定を読み込む」にバックアップ JSON を渡すと、しおりや履歴が復元されます
- ファイル本体は IndexedDB に保存されます。別端末で開く場合はファイルを再アップロードするか、クラウド同期で設定を復元してください

端末移行時は以下のいずれかで復元します：
- (A) クラウド同期（Firebase SDK → Workers フォールバック）
- (B) JSON の手動移行

---

## セットアップ（開発者向け）

### 1) ローカルで起動

静的ファイルなので、ローカル HTTP サーバで動作確認できます。

- Python：`python -m http.server 8000`
- Node.js：`npx serve`

起動後：`http://localhost:8000/` を開きます。

**Quest 3 でのテスト**：
1. PC と Quest 3 を同じネットワークに接続
2. PC の IP アドレスを確認（例：192.168.1.100）
3. Quest 3 のブラウザで `http://192.168.1.100:8000/` にアクセス

### 2) Firebase プロジェクトのセットアップ

#### Firestore を使う場合

1. Firebase Console でプロジェクトを作成
2. Firestore Database を有効化
3. セキュリティルールを設定：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. ウェブアプリを追加して Firebase 設定を取得
5. アプリの設定画面に Firebase 設定を入力

#### Realtime Database を使う場合

1. Firebase Console でプロジェクトを作成
2. Realtime Database を有効化
3. セキュリティルールを設定：

```json
{
  "rules": {
    "users": {
      "$userId": {
        ".read": "$userId === auth.uid",
        ".write": "$userId === auth.uid"
      }
    }
  }
}
```

4. ウェブアプリを追加して Firebase 設定を取得（`databaseURL` も含む）
5. アプリの設定画面に Firebase 設定を入力

### 3) Cloudflare Pages へデプロイ

- GitHub リポジトリと Pages を連携し、`main` への push で自動デプロイ
- 静的サイトのため、基本的にビルド工程は不要

### 4) Cloudflare Workers のセットアップ（フォールバック用）

1. Workers プロジェクトを作成：

```bash
npm create cloudflare@latest epub-reader-sync
cd epub-reader-sync
```

2. Firebase Admin SDK をインストール：

```bash
npm install firebase-admin
```

3. 上記の Workers 実装例をコピー

4. Firebase サービスアカウントキーを取得：
   - Firebase Console → プロジェクト設定 → サービスアカウント
   - 「新しい秘密鍵の生成」でキーをダウンロード

5. Workers の環境変数に設定：

```bash
wrangler secret put FIREBASE_SERVICE_ACCOUNT
# JSON キーの内容を貼り付け
```

6. デプロイ：

```bash
wrangler deploy
```

7. デプロイされた Workers の URL をアプリの設定に追加

---

## リポジトリ構成

```
epub-reader/
├── index.html              # アプリ本体
├── assets/
│   ├── js/
│   │   ├── sync.js         # 同期ロジック（SDK → Workers フォールバック）
│   │   ├── epub-reader.js  # EPUB読み込み処理
│   │   └── image-reader.js # 画像書籍読み込み処理
│   ├── css/
│   │   └── styles.css      # スタイルシート
│   └── vendor/             # 外部ライブラリ
│       ├── jszip/          # ZIP解凍用
│       └── unrar/          # RAR解凍用（必要に応じて）
├── workers/                # Cloudflare Workers（フォールバック用API）
│   ├── src/
│   │   └── index.js        # Workers エントリーポイント
│   ├── wrangler.toml       # Workers 設定
│   └── package.json
├── tools/                  # 開発・検証用ツール
│   ├── dev.html            # 開発用テストページ
│   └── test.html           # 機能テスト用ページ
└── README.md               # 本ファイル
```

### CDN 経由で読み込むライブラリ

- **epub.js**：EPUB パース・レンダリング
- **Firebase SDK**：認証・データベース（v9+ modular）
- その他必要に応じて追加

### 不要コード/不要ファイルの整理方針

本プロジェクトは「AI バイブコーディングで素早く作る」性格上、試作の残骸が溜まりやすい前提です。以下の基準で整理します：

- **本番配信に不要**：`dev.html` / `test.html` / `index.html.backup` などは `tools/` に移動
- **旧実装の残骸**：Workers のみの実装や GAS 前提のコードは削除
- **実装が二重化している**：同じ責務の関数・設定が複数ある場合は統合
- **Quest 3 互換性のチェック**：新機能追加時は Quest 3 での動作を確認し、互換性のないコードは削除または代替実装を用意

---

## 開発メモ

### 技術スタック

- **フロントエンド**：Vanilla JavaScript（フレームワークなし）
- **同期ロジック**：Firebase SDK (v9+ modular) + Cloudflare Workers
- **ストレージ**：IndexedDB（ファイル本体）、Firebase Database（同期データ）
- **ホスティング**：Cloudflare Pages（静的サイト）
- **API**：Cloudflare Workers（フォールバック用プロキシ）

### Quest 3 対応の実装ポイント

- **タッチイベント**：Quest Browser はタッチイベントをサポート。クリックイベントと併用
- **メモリ管理**：大きなファイルを扱う際は、適切にメモリを解放
- **エラーハンドリング**：Quest では開発者ツールが使いにくいため、UI上でエラーを表示
- **パフォーマンス**：重い処理は Web Worker で非同期実行（可能な範囲で）

### AI バイブコーディングのポイント

- プロンプトで要件を明確に伝え、動作する最小限のコードを生成
- 複雑な処理は段階的に実装し、各段階でテスト
- Quest 3 での動作確認は実機で行い、問題があれば AI にフィードバック
- コードの重複や不要な部分は定期的にリファクタリング

---

## Roadmap

### 完了済み
- ✅ Firebase SDK → Workers フォールバックの冗長化実装
- ✅ Quest 3 基本対応（ファイル読み込み、ページ送り、同期）

### 実装中
- 🔄 PWA の安定化（iPad/Safari の挙動差分吸収）
- 🔄 Quest 3 UI の最適化（コントローラー操作の改善）

### 今後の予定
- ⏳ 同期の衝突解決（最終更新タイムスタンプベース、マージ方針）
- ⏳ 複数端末間のリアルタイム同期（Firebase onSnapshot 活用）
- ⏳ オフライン対応の強化（IndexedDB との同期キュー）
- ⏳ Quest 3 専用機能
  - VR 空間での読書体験の最適化
  - 3D UI要素の追加（実験的）
  - ハンドトラッキング対応（将来的に）
- ⏳ パフォーマンス改善
  - 大容量ファイルの段階的読み込み
  - Web Worker を活用した非同期処理
  - Quest 3 でのメモリ使用量最適化

---

## トラブルシューティング

### Quest 3 で同期が失敗する

1. Quest のネットワーク設定を確認
2. Firebase SDK と Workers の両方の URL にアクセスできるか確認
3. アプリ内のデバッグログで詳細なエラーメッセージを確認

### Quest 3 でファイルが開けない

1. ファイルが Quest のストレージに正しく保存されているか確認
2. ファイルサイズが大きすぎないか確認（200MB 以下推奨）
3. ファイル形式が正しいか確認（.epub, .cbz, .zip）

### Quest 3 でパフォーマンスが悪い

1. 他のアプリやブラウザタブを閉じる
2. Quest を再起動する
3. ファイルサイズを小さくする（画像圧縮など）
4. IndexedDB をクリアして再度ファイルを読み込む

---

## ライセンス

本リポジトリのコードはプロジェクト要件に従い自由に利用してください。

---

## 貢献

バグ報告や機能要望は GitHub Issues でお願いします。特に Quest 3 での動作に関するフィードバックは大歓迎です。

プルリクエストも歓迎しますが、以下の点にご注意ください：
- Quest 3 での動作確認を行ってください
- コードは可能な限りシンプルに保ってください
- 新しい依存関係の追加は最小限にしてください
