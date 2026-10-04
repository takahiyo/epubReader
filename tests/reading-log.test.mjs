/** Markdown reading-log data integrity, links, timestamps and privacy regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReadingLogMarkdown } from '../assets/js/core/reading-log.js';

const now = new Date(2026, 9, 4, 12, 34, 56);
const state = { title: '作品名', author: '作者名', percentage: 35.24, bookId: 'same-book',
  bookType: 'epub', pageIndex: 24, totalPages: 100, appUrl: 'https://example.test/reader/?token=secret#private' };

test('only a two-person multiplication-sign filename separates artist and original author', () => {
  for (const names of ['漫画家×原作者', ' 漫画家 × 原作者 ']) {
    const output = generateReadingLogMarkdown({ ...state, fileName: '[' + names + ']作品_01.cbz', bookType: 'zip' }, { now, language: 'en' });
    assert.match(output, /\nauthors:\n  - "\[\[漫画家\]\]"\nauthor_names:\n  - "漫画家"\n/);
    assert.match(output, /\noriginal_authors:\n  - "\[\[原作者\]\]"\noriginal_author_names:\n  - "原作者"\n/);
    assert.equal(output.split('\n---\n')[1], '\n## Thoughts and notes\n');
    const japanese = generateReadingLogMarkdown({ ...state, fileName: '[' + names + ']作品_01.cbz', bookType: 'zip' }, { now, language: 'ja' });
    assert.match(japanese, /\n作者:\n  - "\[\[漫画家\]\]"\n作者名:\n  - "漫画家"\n/);
    assert.match(japanese, /\n原作者:\n  - "\[\[原作者\]\]"\n原作者名:\n  - "原作者"\n/);
  }
});

test('ASCII x, names outside the convention and ambiguous multiplication signs keep their original roles', () => {
  for (const name of ['Alex', 'Max x Alex', 'A×B×C', 'A×', '×B']) {
    const output = generateReadingLogMarkdown({ ...state, fileName: '[' + name + ']作品.cbz' }, { now, language: 'en' });
    assert.ok(output.includes('author_names:\n  - ' + JSON.stringify(name) + '\n'));
    assert.match(output, /\noriginal_authors: \[\]\noriginal_author_names: \[\]\n/);
  }
  const metadata = generateReadingLogMarkdown({ ...state, author: 'A×B' }, { now, language: 'en' });
  assert.match(metadata, /\nauthor_names:\n  - "A×B"\n/);
  assert.match(metadata, /\noriginal_authors: \[\]\n/);
});

test('filename author and title override metadata for EPUB and comic exports while preserving underscores and volumes', () => {
  for (const [bookType, extension] of [['epub', 'epub'], ['zip', 'CBZ'], ['rar', 'cbr']]) {
    const input = { ...state, bookType, fileName: '[作者名]作品_名_第003巻.' + extension,
      title: '異なる書籍メタデータ', author: '異なる作者メタデータ' };
    const before = structuredClone(input);
    const output = generateReadingLogMarkdown(input, { now, language: 'en' });
    assert.match(output, /\ntitle: "作品_名_第003巻"\n/);
    assert.match(output, /\nbook: "\[\[作品_名_第003巻\]\]"\n/);
    assert.match(output, /\nauthors:\n  - "\[\[作者名\]\]"\nauthor_names:\n  - "作者名"\n/);
    assert.ok(!output.includes('異なる書籍メタデータ'));
    assert.ok(!output.includes('異なる作者メタデータ'));
    assert.deepEqual(input, before);
  }
});

test('legacy filename-derived titles also separate the author prefix without splitting author names', () => {
  const output = generateReadingLogMarkdown({ title: '[作者_A・作者B]作品_タイトル_01.epub', bookType: 'epub' }, { now, language: 'en' });
  assert.match(output, /\ntitle: "作品_タイトル_01"\n/);
  assert.match(output, /\nauthor_names:\n  - "作者_A・作者B"\n/);
});

test('incomplete conventions and ordinary filenames retain metadata; web titles are not parsed as filenames', () => {
  for (const fileName of ['普通の書籍.epub', '[]作品.epub', '[作者名].epub', '[作者名]   .epub', '前置き[作者名]作品.epub']) {
    const output = generateReadingLogMarkdown({ ...state, fileName }, { now, language: 'en' });
    assert.match(output, /\ntitle: "作品名"\n/);
    assert.match(output, /\nauthor_names:\n  - "作者名"\n/);
  }
  const web = generateReadingLogMarkdown({ title: '[番外編]作品名', author: '実際の作者', bookType: 'web_novel' }, { now, language: 'en' });
  assert.match(web, /\ntitle: "\[番外編\]作品名"\n/);
  assert.match(web, /\nauthor_names:\n  - "実際の作者"\n/);
});

test('a complete Markdown note links book and authors and exports numeric, flat properties', () => {
  const output = generateReadingLogMarkdown(state, { now, language: 'en' });
  assert.ok(output.startsWith('---\n'));
  assert.match(output, /\nbook: "\[\[作品名\]\]"\n/);
  assert.match(output, /\nauthors:\n  - "\[\[作者名\]\]"\n/);
  assert.match(output, /\nauthor_names:\n  - "作者名"\n/);
  assert.match(output, /\nprogress: 35.2\n/);
  assert.match(output, /\nstatus: "reading"\n/);
  assert.match(output, /\npage: 25\ntotal_pages: 100\n/);
  assert.match(output, /\nbook_id: "same-book"\n/);
  assert.match(output, /\ndate: 2026-10-04\nrecorded_at: 2026-10-04T12:34:56[+-]\d{2}:\d{2}\n/);
  assert.equal(output.split('\n---\n')[1], '\n## Thoughts and notes\n');
});

test('punctuation cannot turn links into aliases, headings, folders or frontmatter injection', () => {
  const title = 'Book: "A" / [B] #part | alias ^id\n---\npassword: injected';
  const output = generateReadingLogMarkdown({ ...state, title, author: ['A|B', 'A|B', 'C/D'] }, { now, language: 'en' });
  assert.equal(output.split('\n').filter(line => line === '---').length, 2);
  assert.ok(output.includes('title: ' + JSON.stringify(title)));
  assert.ok(output.includes('book: "[[Book： ＂A＂ ／ ［B］ ＃part ｜ alias ＾id --- password： injected]]"'));
  assert.match(output, /authors:\n  - "\[\[A｜B\]\]"\n  - "\[\[C／D\]\]"/);
  assert.ok(output.includes('author_names:\n  - "A|B"\n  - "C/D"'));
  assert.ok(!output.includes('\npassword: injected\n'));
});

test('invalid progress is bounded and rounding does not prematurely mark a book completed', () => {
  for (const value of [NaN, Infinity, undefined, -30]) {
    const output = generateReadingLogMarkdown({ percentage: value }, { now, language: 'en' });
    assert.match(output, /\nprogress: 0\n/);
    assert.match(output, /\nstatus: "reading"\n/);
  }
  assert.match(generateReadingLogMarkdown({ percentage: 99.99 }, { now, language: 'en' }), /\nstatus: "reading"\n/);
  assert.match(generateReadingLogMarkdown({ percentage: 110 }, { now, language: 'en' }), /\nstatus: "completed"\nprogress: 100\n/);
});

test('unknown image authors and absent pagination are represented without invented metadata', () => {
  const output = generateReadingLogMarkdown({ title: 'Comic', author: '画像書籍', bookType: 'zip', totalPages: 0 }, { now, language: 'en' });
  assert.match(output, /\nauthors: \[\]\nauthor_names: \[\]\n/);
  assert.ok(!output.includes('[[画像書籍]]'));
  assert.ok(!output.includes('\npage:'));
  assert.ok(!output.includes('\ntotal_pages:'));
});

test('Japanese names and English keys retain matching typed values with a notes-only body', () => {
  const ja = generateReadingLogMarkdown(state, { now, language: 'ja' });
  const en = generateReadingLogMarkdown(state, { now, language: 'en' });
  const keys = {
    "type": "記録種別",
    "schema_version": "形式版",
    "date": "記録日",
    "recorded_at": "記録日時",
    "book": "作品",
    "title": "作品名",
    "authors": "作者",
    "author_names": "作者名",
    "original_authors": "原作者",
    "original_author_names": "原作者名",
    "status": "読書状態",
    "progress": "進捗",
    "book_id": "書籍ID",
    "format": "書籍形式",
    "page": "ページ",
    "total_pages": "総ページ数",
    "app": "アプリ",
    "app_url": "アプリURL"
  };
  const normalized = ja.split('\n---\n')[0].split('\n').map(line => {
    const split = line.indexOf(':');
    const key = line.slice(0, split);
    const canonical = Object.keys(keys).find(name => keys[name] === key);
    return canonical ? canonical + line.slice(split) : line;
  }).join('\n');
  assert.equal(normalized, en.split('\n---\n')[0]);
  assert.match(ja, /\n進捗: 35.2\n/);
  assert.match(ja, /\n記録日: 2026-10-04\n記録日時: 2026-10-04T12:34:56[+-]\d{2}:\d{2}\n/);
  assert.match(ja, /\ntags:\n  - "reading-log"\n/);
  assert.match(ja, /\n形式版: 2\n/);
  assert.equal(ja.split('\n---\n')[1], '\n## 感想・メモ\n');
  assert.equal(en.split('\n---\n')[1], '\n## Thoughts and notes\n');
  assert.equal(generateReadingLogMarkdown(state, { now, language: 'unknown' }), en);
});

test('export allowlist excludes arbitrary book contents and URL secrets without mutating input', () => {
  const source = { ...state, visibleText: 'secret-excerpt', token: 'secret-token', filePath: 'private-path',
    location: { spineIndex: 1, visibleText: 'secret-excerpt' } };
  const before = structuredClone(source);
  const output = generateReadingLogMarkdown(source, { now, language: 'en' });
  for (const secret of ['secret-excerpt', 'secret-token', 'private-path', '?token=', '#private']) assert.ok(!output.includes(secret));
  assert.match(output, /\napp_url: "https:\/\/example.test\/reader\/"\n/);
  assert.deepEqual(source, before);
});
