export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    const settings = this.storage.getSettings();
    if (!settings.endpoint) {
      throw new Error("エンドポイントが設定されていません");
    }
    return settings;
  }

  buildHeaders(apiKey) {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  async push() {
    const { endpoint, apiKey } = this.getSettings();
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "save", payload }),
    });

    if (!response.ok) {
      throw new Error(`同期に失敗しました (${response.status})`);
    }

    return response.json().catch(() => ({}));
  }

  async pull() {
    const { endpoint, apiKey } = this.getSettings();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ action: "load" }),
    });

    if (!response.ok) {
      throw new Error(`データ取得に失敗しました (${response.status})`);
    }

    const json = await response.json();
    if (json?.data) {
      this.storage.importData(JSON.stringify(json.data));
    }
    return json;
  }
}
