# GitHub Pages セットアップ手順

このアプリをGitHub Pagesで公開するための手順です。

## 方法1: GitHub UIから設定（推奨）

1. GitHubリポジトリページにアクセス:  
   https://github.com/takahiyo/epubReader

2. **Settings** タブをクリック

3. 左サイドバーの **Pages** をクリック

4. **Source** セクションで以下を選択:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`

5. **Save** をクリック

6. 数分待つとデプロイが完了し、以下のURLでアクセス可能になります:  
   https://takahiyo.github.io/epubReader/

## 方法2: GitHub Actionsを使用

`.github/workflows/deploy.yml` ファイルを手動でGitHub UIから作成:

1. リポジトリの **Actions** タブを開く
2. **set up a workflow yourself** をクリック
3. 以下の内容をコピー&ペースト:

\`\`\`yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Pages
        uses: actions/configure-pages@v4
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
\`\`\`

4. **Commit changes** をクリック

5. **Settings > Pages** で **Source** を `GitHub Actions` に変更

## アクセスURL

設定完了後、以下のURLでアクセス可能:

- **本番URL**: https://takahiyo.github.io/epubReader/
- **開発モード設定**: https://takahiyo.github.io/epubReader/dev.html
- **テストページ**: https://takahiyo.github.io/epubReader/test.html

## トラブルシューティング

### 404エラーが出る場合

1. **Settings > Pages** で設定を確認
2. **Actions** タブでデプロイ状況を確認
3. デプロイが完了するまで数分かかる場合があります

### 認証エラーが出る場合

1. まず開発モード設定ページにアクセス:  
   https://takahiyo.github.io/epubReader/dev.html
2. 「開発モードを有効化」をクリック
3. 「アプリを開く」をクリック

## 現在のテスト環境

開発中は以下のサンドボックスURLでテスト可能:

https://8000-iz8bn4mxp6xw7sf97p56t-18e660f9.sandbox.novita.ai/dev.html
