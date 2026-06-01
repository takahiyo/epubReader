/**
 * network-loader.js
 * 
 * URLから直接ファイルを取得するロジック（Fetch API利用）。
 * 主にQuest 3のScoped Storage回避策として、NASやWebDAVからファイルを直接ダウンロードするために使用する。
 */

/**
 * ネットワークからファイルを取得する
 * @param {string} url - 取得先URL
 * @param {Object} options - { user, pass, onProgress }
 * @returns {Promise<File>} 取得したFileオブジェクト
 */
export const fetchFileFromNetwork = async (url, options = {}) => {
    const { user, pass, onProgress } = options;
    const headers = new Headers();
    
    if (user && pass) {
        headers.set('Authorization', 'Basic ' + btoa(`${user}:${pass}`));
    }
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            // サーバー側がCORS設定されている必要がある
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        // ファイル名をURLから推定するか、Content-Dispositionから取得
        let filename = url.split('/').pop().split('?')[0] || 'downloaded_book';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }

        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength, 10);
        let loaded = 0;

        if (!contentLength || !onProgress) {
            // 進捗表示が不要、またはサイズ不明の場合は一括取得
            const blob = await response.blob();
            return new File([blob], filename, { type: blob.type });
        }

        // チャンクごとに取得して進捗を通知する
        const reader = response.body.getReader();
        const stream = new ReadableStream({
            async start(controller) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    loaded += value.byteLength;
                    if (onProgress) {
                        onProgress({ loaded, total });
                    }
                    controller.enqueue(value);
                }
                controller.close();
            }
        });

        const responseStream = new Response(stream);
        const blob = await responseStream.blob();
        
        // 拡張子からMIMEタイプを推定（必要に応じて）
        return new File([blob], filename, { type: blob.type });

    } catch (error) {
        console.error('[network-loader] Fetch error:', error);
        throw error;
    }
};

/**
 * URL履歴の保存・取得ロジック
 */
const HISTORY_KEY = 'bookreader_network_history';
const MAX_HISTORY = 10;

export const getNetworkHistory = () => {
    try {
        const history = localStorage.getItem(HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        return [];
    }
};

export const addNetworkHistory = (url) => {
    try {
        let history = getNetworkHistory();
        history = history.filter(u => u !== url); // 重複排除
        history.unshift(url);
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.warn('Failed to save network history');
    }
};
