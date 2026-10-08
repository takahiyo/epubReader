/** User-facing help grounded in local storage, cloud payload, authentication and reading-log implementations. */
export const HELP_CONTENT = Object.freeze({
  ja: {
    button: 'ヘルプ', close: 'ヘルプを閉じる', title: '安心して使うために',
    intro: '書籍を読むためのデータと、端末間で共有する読書情報を分けて扱っています。保存先と送信内容を知ったうえでお使いください。',
    sections: [
      { title: '統合電子書庫', paragraphs: [
        '左メニュー、または読書メニューの「書籍 → 統合電子書庫」で、EPUB・画像書庫・Kindle・U-NEXTの所蔵をまとめて整理できます。シリーズを選び、巻表示と並び順を設定してください。同じ巻を別サービスでも持っている場合は「所蔵先を追加」を使います。',
        'KU等の借用・返却は手動記録です。返却後も進捗と読了履歴は残ります。目録はこの端末内だけに保存し、既存の読書同期とは別です。「JSON保存」でバックアップでき、「JSON復元」は目録全体を置き換えます。外部サービスの進捗や利用可否は自動取得しません。',
        '書籍をチェックして「選択した書籍をCSV出力」を使うと、シリーズ・巻・所蔵先を記入済みの見本として保存できます。新しい巻に使う場合は書名・巻表示・book_key・サービス内ID・URLを確認して変更し、「CSV一括登録」でプレビューを確認してください。空のCSVひな形も利用できます。同じサービスID・購入借用区分はスキップし、既存情報を更新しません。IDのない行は再取り込みで重複する場合があります。',
        '既存の巻はチェックして「選択した巻を整理」からシリーズ・巻表示・並び順をまとめて設定できます。ページや検索の変更後も選択は残るため、整理画面の対象を確認して保存してください。所蔵先・読書進捗・KU履歴は維持します。',
        '「選択した書籍を複写登録」で巻情報と全所蔵先を見本にした編集画面を開けます。サービス内ID・URL・本体の紐付け・進捗・履歴は新しい書籍へコピーしません。所属する巻が0冊になったシリーズは、保存時に一覧から削除します。'
      ] },
      { title: 'はじめ方と端末を替えるとき', paragraphs: [
        '「書籍 → 開く」でEPUB・画像書庫などを選びます。読書画面のメニューから、ライブラリ・目次・しおり・検索・設定にアクセスできます。文字サイズや縦横表示は設定から変更できます。',
        '別の端末で続きから読むには、同じGoogleアカウントでログインし、その端末でも同じ書籍ファイルを選んでください。同期は書籍本体を配布する機能ではありません。ファイルが異なる版・編集済みの場合、同じ作品として結びつかないことがあります。'
      ] },
      { title: '端末内に保存するもの', paragraphs: [
        '選択した書籍本体は、そのブラウザーの端末内保存領域（IndexedDB・大きなファイルではOPFS）に保存します。読書位置・しおり・履歴・設定などもブラウザー内に保存します。通常の書籍読み込みで、元ファイルを書き換えることはありません。',
        'ブラウザーのサイトデータ削除、プライベートブラウズの終了、端末の容量不足などにより保存内容を失う場合があります。元の書籍ファイルは別途保管してください。ブラウザー・サイト・端末が違えば、保存領域も別になります。'
      ] },
      { title: '同期するもの・しないもの', paragraphs: [
        'Googleログイン後、作品名・作者・書籍を照合する識別情報、進捗・読書位置・表示設定、しおりの位置・ラベル・更新日時、しおりの端末識別情報などを同期サーバーへ送信します。標準の同期先はCloudflare Workers経由のデータベースです。',
        'ローカル書籍のファイル本体・画像・本文断片・端末のファイルパスは同期しません。書籍が端末間で自動転送されたり、Googleドライブへ自動アップロードされたりすることもありません。作品名や自分で付けたしおりラベルは送信されるため、個人情報を書き込む場合はその点に注意してください。'
      ] },
      { title: '同期と読書位置の復元', paragraphs: [
        'ログインや書籍を開くタイミング、読書中の更新などで読書情報を同期します。通信できない間は端末内で読み進められます。通信が戻ったら設定の「アカウントと同期」で同期状況を確認し、必要なら手動同期してください。',
        '新しい更新日時を使って進捗を調整し、しおりは端末間の追加・削除を反映します。端末側とクラウド側の位置が異なるときは、選択画面で使う位置を選ぶ場合があります。EPUBは画面サイズで変わるページ番号だけでなく本文内の位置を使いますが、異なる書籍データや表示条件によって復元位置に差が出る場合があります。'
      ] },
      { title: 'ログインと外部通信について', paragraphs: [
        'ログインはGoogle／Firebase認証を利用し、同期サーバーで認証トークンを検証してアカウントごとの記録を扱います。標準の同期先への通信はHTTPSです。ログインはGoogleドライブ内の書籍を自動で読み出すためのものではありません。',
        '同期データは、利用者だけが復号できるエンドツーエンド暗号化ではありません。クラウド運用側からも読めないことを保証する設計ではないため、同期内容は上記の範囲に限定しています。共有端末では利用後にログアウトし、端末内に残る書籍や記録にも配慮してください。',
        'アプリの読み込みや認証では外部サービスからライブラリ等を取得します。Web小説の検索・取得では作品サイトや取得用プロキシへ通信し、検索語や作品URLが送られる場合があります。これはローカル書籍本体の同期とは別の通信です。'
      ] },
      { title: '読書録をObsidianなどへ保存する', paragraphs: [
        '読書メニューの「読書録」は、現在の読書状態を1ノート分のMarkdownとしてコピー、またはOSの共有機能へ渡します。新しいノートの先頭に貼り付けてください。本文は「感想・メモ」欄だけで、記録は先頭のYAMLプロパティにまとめます。既存ノートの本文途中では、プロパティとして認識されない場合があります。',
        '作品・作者・原作者は内部リンクと元の名前、進捗は0〜100の数値、日時はタイムゾーン付きで出力します。読書状態はreading／completedで、100%以上ならcompletedです。記録日時はコピーした時点であり、読了日を別途記録する機能ではありません。ページ・総ページ数はそのときの表示条件による値です。',
        '日本語表示では「作品」「作者」「原作者」「進捗」など、英語表示ではbook／authors／original_authors／progressなどのプロパティ名になります。集計する記録は言語を揃えると扱いやすくなります。tagsはObsidianのタグ機能のため共通で維持します。',
        'ファイル名が[作者名]作品_名_巻数.extなら作者と作品名を分け、拡張子を除きます。作品側の_や巻数はそのままです。[漫画家×原作者]は左を作者、右を原作者と推定します。英字xや3名以上は分けません。誤った推定は貼り付け後のプロパティを修正してください。',
        '読書録には書籍本文・認証情報・ローカルパスを含めません。ただし作品名・作者・書籍ID・進捗等は含むため、送信先と内容を確認して共有してください。共有先アプリに渡した後の保存・公開範囲は、そのアプリの設定に従います。'
      ] },
      { title: '困ったとき', paragraphs: [
        '書籍を開けない：元ファイルを選び直し、対応形式・端末の空き容量を確認してください。同期された一覧に表示されても、その端末に書籍本体があるとは限りません。',
        '続きが違う：同じアカウント・同じファイルを使っているかと、同期状況を確認してください。複数端末で同時に読み進めた場合は、使いたい位置を選んでください。',
        '画面が古い：通信できる状態でアプリを再読み込みし、表示されるバージョンを確認してください。サイトデータの削除は端末内の書籍・記録も消すため、更新のために安易に削除しないでください。'
      ] }
    ]
  },
  en: {
    button: 'Help', close: 'Close help', title: 'Using BookReader with confidence',
    intro: 'Book files and reading information are handled separately. Learn what stays on this device and what is sent when you use sync or sharing.',
    sections: [
      { title: 'Unified catalog', paragraphs: [
        'Open Unified catalog in the left menu, or under Books in the reading menu, to organize EPUB, image archive, Kindle and U-NEXT holdings. Choose a series and set the volume label and order. Use Add holding for another provider of the same volume.',
        'Subscription loans such as KU are recorded manually. Returning a loan keeps progress and completion history. This catalog is stored only on this device, separately from reading sync. Save JSON creates a backup; Restore JSON replaces the entire catalog. External progress and availability are not automatically retrieved.',
        'Check books and use Export selected books to CSV for filled examples of series, volumes and holdings. For a new volume, check and change the title, volume label, book_key, service ID and URL, then review with Import CSV. A blank template is also available. Duplicate service IDs and access types are skipped without updating existing records. Reimporting rows without service IDs may create duplicates.',
        'Check existing volumes and use Organize selected volumes to assign a series and edit volume labels and order together. Selections remain across pages and searches, so review the editor targets before saving. Holdings, reading progress and KU history are preserved.',
        'Use Copy selected books for registration to review copies of volume metadata and all holdings. Service IDs, URLs, file bindings, progress and history are not copied to new books. Series with no remaining volumes are removed from lists when changes are saved.'
      ] },
      { title: 'Getting started and switching devices', paragraphs: [
        'Choose an EPUB or image archive from Books → Open. The reading menu provides Library, Contents, Bookmarks, Search and Settings. Adjust text size and reading orientation in Settings.',
        'To resume on another device, sign in with the same Google account and select the same book file on that device. Sync does not distribute book files. Different editions or edited files may not be identified as the same book.'
      ] },
      { title: 'What stays on this device', paragraphs: [
        'Selected book files are stored in this browser on your device, using IndexedDB or OPFS for large files. Reading positions, bookmarks, history and settings are also saved locally. Normal reading does not modify your original file.',
        'Clearing site data, ending private browsing or storage pressure can remove saved data. Keep the original book files separately. Different browsers, sites and devices have separate storage.'
      ] },
      { title: 'What sync sends', paragraphs: [
        'After Google sign-in, sync sends book titles, authors, matching identifiers, progress, reading positions, display preferences, bookmark positions and labels, update times and bookmark device identifiers. The default service stores this information in a database through Cloudflare Workers.',
        'Local book files, images, excerpts and filesystem paths are not synced. Books are not automatically transferred between devices or uploaded to Google Drive. Titles and labels you write for bookmarks are sent, so consider that before including personal information.'
      ] },
      { title: 'Sync and restoring your position', paragraphs: [
        'Reading information syncs at sign-in, when opening books and during reading updates. You can continue reading locally without a connection. When connectivity returns, check the sync status under Account and sync in Settings and use manual sync if needed.',
        'Progress uses update times, while bookmark additions and deletions are merged across devices. If local and cloud positions differ, you may be asked which to use. EPUB restoration uses a position within the text rather than only a page number that changes with screen size. Different book data or display conditions may still affect the restored position.'
      ] },
      { title: 'Sign-in and external connections', paragraphs: [
        'Sign-in uses Google/Firebase authentication. The sync server verifies the authentication token and handles records per account. The default sync connection uses HTTPS. Sign-in does not automatically read books from Google Drive.',
        'Sync data is not end-to-end encrypted with a key held only by you. This design does not guarantee that the cloud operator cannot read it, which is why sync contents are limited to the information above. Sign out after using a shared device and consider the books and records remaining in its local storage.',
        'Loading the app and authentication can request libraries from external services. Web-novel search and retrieval contact the source site or a retrieval proxy, potentially sending search terms or book URLs. These requests are separate from syncing local book files.'
      ] },
      { title: 'Saving a reading log in Obsidian or another editor', paragraphs: [
        'Reading Log in the reading menu copies a snapshot as one Markdown note or hands it to the operating system share sheet. Paste it at the start of a new note. Records are stored in YAML properties; the body only provides a Thoughts and notes section. Pasting into the middle of an existing note may not create properties.',
        'Books, authors and original authors have internal links and raw names. Progress is a number from 0 to 100; timestamps include the timezone. Status is reading or completed, with completed used at 100% or above. The timestamp is the capture time, not a separate completion date. Page counts reflect the current display conditions.',
        'Property names follow the interface language: Japanese uses names such as 作品, 作者, 原作者 and 進捗; English uses book, authors, original_authors and progress. Keep the language consistent for easier aggregation. The tags key is kept in both languages for Obsidian.',
        'For [author]Book_title_volume.ext filenames, the author and title are separated and the extension removed. Underscores and volume information remain in the title. [artist×original author] assigns the left name to the artist and the right name to the original author. ASCII x and three or more names are not split. Correct mistaken inference in the pasted properties.',
        'Reading logs exclude book contents, authentication data and local paths, but include titles, authors, book IDs and progress. Check the destination and contents before sharing. After handing the note to another app, its storage and visibility follow that app’s settings.'
      ] },
      { title: 'Troubleshooting', paragraphs: [
        'Cannot open a book: select the original file again and check the supported format and available storage. A synced library entry does not mean the book file exists on this device.',
        'Wrong reading position: check that you use the same account and file, then check sync status. If you read on several devices at once, select the position you want to keep.',
        'Outdated screen: reload the app while online and check its version. Avoid clearing site data just to update; that can also delete locally saved books and records.'
      ] }
    ]
  }
});
