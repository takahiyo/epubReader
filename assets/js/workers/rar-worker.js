import {
  ARCHIVE_LIBRARY_ERRORS,
  ARCHIVE_PROCESSING_ERRORS,
  ARCHIVE_WORKER_MESSAGES,
  CDN_URLS,
} from "../../constants.js";

let extractor = null;
let wasmBinary = null;
let createExtractorFromData = null;

async function loadUnrarModule() {
  if (createExtractorFromData && wasmBinary) {
    return { createExtractorFromData, wasmBinary };
  }

  const wasmResponse = await fetch(CDN_URLS.UNRAR_WASM);
  if (!wasmResponse.ok) {
    throw new Error(`${ARCHIVE_LIBRARY_ERRORS.UNRAR_LOAD_FAILED} (${wasmResponse.status})`);
  }
  wasmBinary = await wasmResponse.arrayBuffer();

  const module = await import(CDN_URLS.UNRAR_JS);
  createExtractorFromData = module.createExtractorFromData || module.default?.createExtractorFromData;
  if (!createExtractorFromData) {
    throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
  }
  return { createExtractorFromData, wasmBinary };
}

function buildHeaders(list) {
  return [...(list?.fileHeaders ?? [])];
}

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  if (!id || !type) return;

  try {
    if (type === ARCHIVE_WORKER_MESSAGES.INIT) {
      const { buffer } = payload || {};
      if (!buffer) {
        throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
      }
      const { createExtractorFromData: createExtractor, wasmBinary: wasmData } = await loadUnrarModule();
      extractor = await createExtractor({ data: new Uint8Array(buffer), wasmBinary: wasmData });
      const list = extractor.getFileList();
      const headers = buildHeaders(list);
      self.postMessage({ id, type, payload: { headers } });
      return;
    }

    if (type === ARCHIVE_WORKER_MESSAGES.EXTRACT) {
      if (!extractor) {
        throw new Error(ARCHIVE_LIBRARY_ERRORS.UNRAR_NOT_FOUND);
      }
      const { path } = payload || {};
      const extracted = extractor.extract({ files: [path] });
      const files = [...(extracted?.files ?? [])];
      const item = files.find((entry) => {
        const header = entry?.fileHeader ?? entry?.header ?? entry;
        const name = header?.name ?? header?.fileName ?? header?.filename ?? entry?.name ?? "";
        return name === path;
      });
      const data = item?.extraction?.data ?? item?.extraction ?? item?.data ?? null;
      if (!data || data.length === 0) {
        throw new Error(`${ARCHIVE_PROCESSING_ERRORS.RAR_EXTRACT_FAILED}: ${path}`);
      }
      const dataArray = data instanceof Uint8Array ? data : new Uint8Array(data);
      const slice = dataArray.buffer.slice(dataArray.byteOffset, dataArray.byteOffset + dataArray.byteLength);
      self.postMessage({ id, type, payload: { buffer: slice } }, [slice]);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, type: ARCHIVE_WORKER_MESSAGES.ERROR, error: { message } });
  }
});
