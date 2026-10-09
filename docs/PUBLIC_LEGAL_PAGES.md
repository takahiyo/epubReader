# 公開ポリシー・規約

2026-10-10 / dev

運営者はFlateight、問い合わせ窓口はbookreader@flateight.jp（ユーザー指定）。

## ページと更新

- `privacy.html` / `privacy-en.html`：プライバシーポリシー
- `terms.html` / `terms-en.html`：利用規約
- 文面の原本：`scripts/legal-content.mjs`
- 更新後に `node scripts/generate-legal-pages.mjs`、`node scripts/generate-sw-cache-config.mjs` を実行。

日本語・英語とも本文を静的HTMLで配信し、ログイン・JavaScript・外部フォントを必要としない。初期画面と設定画面にリンクを配置し、アプリの表示言語に合わせて切り替える。読書画面を維持するため別タブで開く。PWAのプリキャッシュにも含める。

## 配置後のGoogle Cloud設定

本番ドメインへこの変更を配置し、ログアウト状態で各URLを開けることを確認してから、「Google Auth Platform → ブランディング」のリンクを次に設定する。

- ホームページ：`https://bookreader.flateight.jp/`
- プライバシーポリシー：`https://bookreader.flateight.jp/privacy.html`
- 利用規約：`https://bookreader.flateight.jp/terms.html`

devへのローカル編集だけでは公開URLの存在を確認できない。認可元ドメインの設定や公開審査は別途管理画面で行う。

## 実装と運用の対応

文面はGoogle/Firebase認証、Driveの直接取得、読書同期、明示的に有効にする書庫同期、画像書庫エラーの自動診断、Web小説プロキシ、共有・書き出しを対象とする。診断送信にはファイル名や書庫内の項目名を含むことがあるため、本文を同期しないこととは分けて説明した。

現在のサービスにはクラウド情報の一括削除用ユーザー画面や、自動削除期限の処理がない。問い合わせ窓口で本人確認後に削除・利用停止の依頼を扱う運用とし、未実装の自動削除期限を約束しない。運営者は公開前に窓口メールの受信と、読書情報・書庫情報・診断情報・Firebaseのアカウント記録・バックアップを対象にした依頼処理手順を確認する。ログアウト・同期停止・Googleの権限解除はデータ削除とは異なる。

この変更は文書と閲覧導線を追加する。新たな強制同意画面や同意済み記録は追加しない。将来データ利用を重要な点で変更する場合は、通知と必要な同意を得る仕組みも実装する。文面の追加だけで法令適合やGoogleの審査通過を保証するものではない。

## 検証

公開ページの直接取得（認証・JavaScriptなし）、目次／ページ間リンク、連絡先、言語切替、PWAキャッシュ登録とオフライン時のポリシー応答を自動検証した。既存の同期・Drive・ローカルプレビュー・送信データ制限を含む関連テスト40件が成功。

Codexのブラウザーで日本語のポリシー・規約、英語の規約、初期画面への戻り、設定画面のリンクを確認した。小さい画面の表示では文書の横スクロールがなく、初期画面のリンクが画面内に収まり、設定画面でもリンクと説明が表示された。確認画像は `scratch/legal-settings-mobile.png`（コミット対象外）。

## 公式資料

- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [OAuth公開時の確認要件](https://support.google.com/cloud/answer/13464321)
- [個人情報保護委員会・法令／ガイドライン](https://www.ppc.go.jp/personalinfo/legal/)
- [消費者庁・消費者契約法](https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/)
