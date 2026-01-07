/* Placeholder unrar-js build.
 * NOTE: Replace this file with the official unrar-js 0.4.0 UMD build.
 */
(function (global) {
  function missing() {
    throw new Error("unrar vendor file is a placeholder. Replace assets/vendor/unrar.js with the official build.");
  }
  global.unrar = {
    createExtractorFromData: missing,
  };
})(typeof window !== "undefined" ? window : this);
