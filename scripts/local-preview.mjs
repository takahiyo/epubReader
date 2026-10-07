/** Dependency-free localhost preview. Serve only public app files, never repository metadata. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { LOCAL_PREVIEW as C } from './local-preview-config.mjs';

/** @param {Object} options Root for preview @returns {http.Server} Loopback-only static application server. */
export function createPreviewServer({ root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  const rootPath = path.resolve(root);
  const permitted = relative => C.publicFiles.includes(relative) || C.publicDirectories.some(directory => relative.startsWith(directory + '/'));
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end();
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = path.resolve(rootPath, relative);
      if (!target.startsWith(rootPath + path.sep) || !permitted(path.relative(rootPath, target).split(path.sep).join('/'))) return response.writeHead(404).end();
      const actual = await fs.realpath(target);
      if (!actual.startsWith(rootPath + path.sep) || !permitted(path.relative(rootPath, actual).split(path.sep).join('/'))) return response.writeHead(404).end();
      const bytes = await fs.readFile(actual);
      response.writeHead(200, { 'Content-Type': (C.contentTypes[path.extname(actual)] || 'application/octet-stream') +
        (['.html', '.js', '.css', '.json'].includes(path.extname(actual)) ? '; charset=utf-8' : ''),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404).end(); }
  });
}

/** @param {string[]} args CLI arguments @returns {Promise<http.Server>} Running preview, optionally opening the browser. */
export async function startPreview(args = []) {
  const index = args.indexOf('--port');
  const port = index < 0 ? C.port : Number(args[index + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid preview port');
  const server = createPreviewServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, C.host, resolve); });
  const url = `http://${C.host}:${server.address().port}/`;
  console.log(`BookReader: ${url}`);
  console.log('Keep this server running while reading. Ctrl+C stops the preview.');
  if (args.includes('--open')) {
    const opener = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const processHandle = spawn(...opener, { windowsHide: true, stdio: 'ignore' });
    processHandle.on('error', error => console.error(`Open ${url} in your browser: ${error.message}`));
  }
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startPreview(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
