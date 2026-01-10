# GAS (Google Apps Script) デプロイ手順

このドキュメントは、ブックリーダーのクラウド同期用 GAS バックエンドをデプロイする手順です。

## 前提条件
- Google アカウント
- Google Cloud Console でプロジェクトを作成済み
- OAuth 2.0 クライアント ID を取得済み（Web アプリケーション用）

## Step 1: Google Apps Script プロジェクトの作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「BookReader Sync API」などに変更
4. `GAS_BookReader` ファイルの内容をコピー＆ペーストして既存の `Code.gs` を置き換える

## Step 2: スクリプトプロパティの設定

1. プロジェクト設定（歯車アイコン）をクリック
2. 「スクリプト プロパティ」タブを選択
3. 「スクリプト プロパティを追加」をクリック
4. 以下のプロパティを追加：

| プロパティ | 値 |
|-----------|-----|
| `GOOGLE_CLIENT_ID` | あなたの OAuth 2.0 クライアント ID（例：`123456789-xxxxx.apps.googleusercontent.com`） |

### OAuth 2.0 クライアント ID の取得方法

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択
3. 「API とサービス」→「認証情報」に移動
4. 「認証情報を作成」→「OAuth クライアント ID」を選択
5. アプリケーションの種類：「ウェブ アプリケーション」
6. 承認済みの JavaScript 生成元に以下を追加：
   - `https://your-domain.github.io` (GitHub Pages の場合)
   - `http://localhost:8080` (ローカル開発用)
7. 承認済みのリダイレクト URI に以下を追加：
   - `https://your-domain.github.io` (GitHub Pages の場合)
   - `http://localhost:8080` (ローカル開発用)
8. 「作成」をクリックしてクライアント ID を取得

## Step 3: ウェブアプリとしてデプロイ

### 重要：デプロイ設定

以下の設定が**必須**です。誤った設定だと CORS エラーや 401 Unauthorized が発生します。

1. 右上の「デプロイ」→「新しいデプロイ」をクリック
2. 「デプロイタイプの選択」→「ウェブアプリ」を選択
3. 以下の設定を**必ず**行う：

| 設定項目 | 値 | 説明 |
|---------|-----|------|
| **説明** | `v1.0` など | バージョン管理用（任意） |
| **次のユーザーとして実行** | **自分（スクリプト所有者）** | **必須：これを選ばないとアクセスできない** |
| **アクセスできるユーザー** | **全員** | **必須：ブラウザから匿名アクセスを許可** |

4. 「デプロイ」をクリック
5. **初回のみ**：承認画面が表示されるので、以下の手順で承認：
   - 「アクセスを承認」をクリック
   - Google アカウントでログイン
   - 「詳細」→「（プロジェクト名）に移動」をクリック
   - 「許可」をクリック
6. デプロイ完了後、**ウェブアプリの URL** をコピー
   - 形式：`https://script.google.com/macros/s/xxxxxxxxxxxxx/exec`
   - この URL をブックリーダーの設定に使用します

### ⚠️ よくある間違い

#### ❌ 「アクセスできるユーザー」を「自分のみ」に設定
→ ブラウザからのアクセスが **401 Unauthorized** になります

#### ❌ 「次のユーザーとして実行」を「アクセスしているユーザー」に設定
→ ブラウザが Google ログイン画面にリダイレクトされ **CORS エラー** になります

#### ✅ 正しい設定
- 実行ユーザー：**自分（スクリプト所有者）**
- アクセス権：**全員**

これにより、ブラウザは idToken を送るだけで認証され、GAS 側で検証されます。

## Step 4: ブックリーダーの設定

1. ブックリーダーを開く
2. 設定画面を開く
3. 「保存先」→「Google Apps Script」を選択
4. 「GAS エンドポイント」に、Step 3 でコピーした URL を貼り付け
   - 例：`https://script.google.com/macros/s/xxxxxxxxxxxxx/exec`
5. 「Google ログイン」ボタンをクリックして認証
6. 同期テスト：
   - Android WebView でアプリを開く
   - ログイン直後に index が同期されることを確認
   - ライブラリ画面に既存の書籍が表示されることを確認

## Step 5: デバッグ方法

### GAS 側のログ確認

1. Google Apps Script エディタで「実行」→「executions」を開く
2. 最近の実行ログを確認
3. `console.log` の出力を確認：
   ```
   {
     "timestamp": "2024-01-10T12:00:00.000Z",
     "path": "/sync/index/pull",
     "hasPayload": true,
     "hasToken": true,
     "authenticated": true,
     "userKey": "123456789012345678901"
   }
   ```

### ブラウザ側のデバッグ

1. ブラウザの開発者ツール（F12）を開く
2. Console タブで以下を確認：
   - CORS エラーが出ていないか
   - 401 Unauthorized が出ていないか
   - Network タブでレスポンスの詳細を確認

### よくあるエラーと対処法

#### CORS Blocked
**原因**：デプロイ設定が間違っている  
**対処**：「アクセスできるユーザー」を「全員」に変更して再デプロイ

#### 401 Unauthorized
**原因1**：デプロイ設定が「自分のみ」になっている  
**対処**：「アクセスできるユーザー」を「全員」に変更

**原因2**：idToken が送られていない  
**対処**：ブックリーダーで「Google ログイン」を実行

**原因3**：GOOGLE_CLIENT_ID が設定されていない  
**対処**：スクリプトプロパティを確認

#### 認証エラー: トークンの検証に失敗しました
**原因**：idToken の audience が一致しない  
**対処**：
1. スクリプトプロパティの `GOOGLE_CLIENT_ID` が正しいか確認
2. フロントエンドの Google OAuth クライアント ID と一致しているか確認

## Step 6: 更新とメンテナンス

### コードを更新した場合

1. GAS エディタでコードを更新
2. 「デプロイ」→「デプロイを管理」をクリック
3. 既存のデプロイを選択
4. 「バージョン」→「新バージョン」を選択
5. 「デプロイ」をクリック
6. URL は変わらないので、ブックリーダー側の設定変更は不要

### データのバックアップ

PropertiesService に保存されたデータをバックアップする場合：

```javascript
function backupAllData() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  Logger.log(JSON.stringify(allProps, null, 2));
  return allProps;
}
```

この関数を実行し、ログから JSON をコピーして保存してください。

### ストレージ容量の注意

- **PropertiesService の制限**：各プロパティは最大 9KB、合計で約 500KB
- 大量のユーザーや書籍データを扱う場合は、Google Sheets や Firestore への移行を検討してください

## トラブルシューティング

### デプロイ URL が見つからない

1. 「デプロイ」→「デプロイを管理」をクリック
2. 「アクティブなデプロイ」の「ウェブアプリ」の URL をコピー

### 「承認が必要です」と表示される

1. 初回デプロイ時は必ず承認が必要
2. 「詳細」→「（プロジェクト名）に移動」をクリック
3. 「許可」をクリック
4. 承認後、再度デプロイを実行

### エラーログが見つからない

1. GAS エディタで「実行」→「executions」を開く
2. フィルターで「すべて」を選択
3. 最近の失敗した実行を確認

### テスト実行方法

GAS エディタで直接テストする場合：

```javascript
function testIndexPull() {
  const testEvent = {
    pathInfo: "/sync/index/pull",
    postData: {
      contents: JSON.stringify({
        idToken: "your-test-id-token-here"
      })
    }
  };
  
  const result = doPost(testEvent);
  Logger.log(result.getContent());
}
```

## まとめ

正しくデプロイされた場合：
- ✅ ブラウザから `/sync/index/pull` にアクセス可能
- ✅ idToken を送ることで認証され、200 OK が返る
- ✅ Android WebView でログイン後、自動的に index が同期される
- ✅ ライブラリ画面に書籍が表示される

デプロイに問題がある場合は、このドキュメントの「デバッグ方法」と「トラブルシューティング」を参照してください。
