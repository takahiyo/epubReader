import { ensureDriveAccessToken } from "./driveAuth.js";

export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    const settings = this.storage.getSettings();
    if (settings.source === "drive") {
      return settings;
    }
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
    const settings = this.getSettings();
    if (settings.source === "drive") {
      return this.pushToDrive(settings);
    }
    const { endpoint, apiKey } = settings;
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
    const settings = this.getSettings();
    if (settings.source === "drive") {
      return this.pullFromDrive(settings);
    }
    const { endpoint, apiKey } = settings;
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

  async pushToDrive(settings) {
    const accessToken = this.ensureDriveToken(settings);
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const fileId = await this.uploadToDrive(accessToken, payload, settings);
    if (fileId && fileId !== settings.driveFileId) {
      this.storage.setSettings({ driveFileId: fileId });
    }
    return { source: "drive", fileId };
  }

  async pullFromDrive(settings) {
    const accessToken = this.ensureDriveToken(settings);
    const fileId = await this.resolveDriveFileId(accessToken, settings);
    if (!fileId) {
      throw new Error("Drive 上に同期ファイルが見つかりませんでした");
    }
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Drive からの取得に失敗しました (${response.status})`);
    }
    const json = await response.json();
    if (json?.data) {
      this.storage.importData(JSON.stringify(json.data));
    }
    if (fileId !== settings.driveFileId) {
      this.storage.setSettings({ driveFileId: fileId });
    }
    return json;
  }

  ensureDriveToken(settings) {
    const token = ensureDriveAccessToken(settings, (driveToken) => {
      this.storage.setSettings({ driveToken });
    });
    return token;
  }

  async resolveDriveFileId(accessToken, settings) {
    if (settings.driveFileId) return settings.driveFileId;
    const name = settings.driveFileName || "epub-reader-data.json";
    const query = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Drive のファイル検索に失敗しました (${response.status})`);
    }
    const result = await response.json();
    const found = result?.files?.[0];
    return found?.id ?? null;
  }

  async uploadToDrive(accessToken, payload, settings) {
    const boundary = `-------drive-sync-${Math.random().toString(16).slice(2)}`;
    const metadata = {
      name: settings.driveFileName || "epub-reader-data.json",
      mimeType: "application/json",
    };
    if (settings.driveFolderId) {
      metadata.parents = [settings.driveFolderId];
    }
    const bodyParts = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(payload),
      `--${boundary}--`,
      "",
    ];
    const body = bodyParts.join("\r\n");
    const fileId = settings.driveFileId;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const method = fileId ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Drive への保存に失敗しました (${response.status})`);
    }
    const json = await response.json();
    return json.id;
  }
}
