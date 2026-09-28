/** Download the pinned browser libraries for isolated EPUB regression tests, never production assets. */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CDN_URLS } from '../assets/constants/assets.js';

const directory = new URL('../scratch/review-fixtures/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, url] of [['jszip.cjs', CDN_URLS.JSZIP], ['epub.js', CDN_URLS.EPUBJS]]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot prepare ${name}: HTTP ${response.status}`);
  const output = new URL(name, directory);
  await writeFile(output, new Uint8Array(await response.arrayBuffer()));
  console.log(`Prepared ${fileURLToPath(output)}`);
}
