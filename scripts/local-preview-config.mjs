/** Local preview settings; no dependencies on application modules that may fail to load. */
export const LOCAL_PREVIEW = Object.freeze({
  host: '127.0.0.1', port: 8000,
  publicFiles: Object.freeze(['index.html', 'dev.html', 'manifest.json', 'sw.js']),
  publicDirectories: Object.freeze(['assets', 'src', '.well-known']),
  contentTypes: Object.freeze({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' }),
});
