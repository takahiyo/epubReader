# Web小説 API デバッグログ 3 (最終報告)

## 判明した事実
ユーザーテストの結果から、Codetabs（CORSプロキシ）を介して `ncode.syosetu.com` の目次ページを取得した際、**プロキシから返却されるHTMLが「空文字（0文字）」または「空に近い内容」** になっていることが確定しました。

```
web-novel-provider.js:205 [NarouProvider] HTML preview: 
web-novel-provider.js:213 [NarouProvider] Parsed TOC title: "魔導具師ダリヤはうつむかない", author: "甘岸久弥"
web-novel-provider.js:220 [NarouProvider] Total links found in HTML: 0
```
※タイトルが抽出できたように見えたのは、なろうAPI（検索結果）のデータをフォールバックとして使っていたためです。

## 原因
「小説家になろう」が導入している Cloudflare Turnstile などの強力なボット対策により、`api.codetabs.com` 等のパブリックなCORSプロキシからのアクセスが完全にブロック（または空の応答）されている状態です。

他のパブリックプロキシ（`corsproxy.io`）も `403 Forbidden` を返し、`api.allorigins.win` はタイムアウトしています。
つまり、**ブラウザ（クライアントサイド）から無料のパブリックプロキシを経由して「小説家になろう」をスクレイピングすることは、事実上不可能な状態**に陥っています。

## 解決策の提案
この問題を回避し、Web小説リーダー機能を復活・継続させるためには、以下のいずれかのような抜本的なアーキテクチャ変更が必要です。

1. **専用の Cloudflare Worker (バックエンド) の構築**
   - ユーザー自身が管理する Cloudflare Worker をプロキシとして立てる。
   - パブリックプロキシのようなアクセス過多によるIPバンを避けられ、必要に応じて User-Agent などの偽装も組み込めるため最も現実的です。
2. **Chrome拡張機能としての運用**
   - アプリをブラウザ拡張機能（Extension）としてパッケージングし直すことで、CORSの制約をバイパスし、ユーザーのブラウザから直接 `fetch` を行えるようにする。
3. **なろう以外のサイト（カクヨム等）に絞る**
   - ただし、カクヨム等も今後同様のボット対策が強化される可能性があります。
