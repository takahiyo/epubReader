import { ensureDriveAccessToken } from "./driveAuth.js";
import { ensureOneDriveAccessToken } from "./onedriveAuth.js";

export class CloudSync {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    const settings = this.storage.getSettings();
    if (settings.source === "drive" || settings.source === "onedrive") {
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
    if (settings.source === "onedrive") {
      return this.pushToOneDrive(settings);
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
    if (settings.source === "onedrive") {
      return this.pullFromOneDrive(settings);
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

  async pushToOneDrive(settings) {
    const accessToken = this.ensureOneDriveToken(settings);
    const payload = {
      updatedAt: Date.now(),
      data: this.storage.snapshot(),
    };
    const fileId = await this.uploadToOneDrive(accessToken, payload, settings);
    if (fileId && fileId !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: fileId });
    }
    return { source: "onedrive", fileId };
  }

  async pullFromOneDrive(settings) {
    const accessToken = this.ensureOneDriveToken(settings);
    const item = await this.resolveOneDriveItem(accessToken, settings);
    if (!item?.id) {
      throw new Error("OneDrive 上に同期ファイルが見つかりませんでした");
    }
    const response = await fetch(this.buildOneDriveContentUrl({ ...settings, onedriveFileId: item.id }), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`OneDrive からの取得に失敗しました (${response.status})`);
    }
    const json = await response.json();
    if (json?.data) {
      this.storage.importData(JSON.stringify(json.data));
    }
    if (item.id && item.id !== settings.onedriveFileId) {
      this.storage.setSettings({ onedriveFileId: item.id });
    }
    return json;
  }

  ensureOneDriveToken(settings) {
    const token = ensureOneDriveAccessToken(settings, (onedriveToken) => {
      this.storage.setSettings({ onedriveToken });
    });
    return token;
  }

  encodeOneDrivePath(path) {
    return path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  buildOneDrivePath(settings) {
    const fallback = settings.driveFileName || "epub-reader-data.json";
    const rawPath = settings.onedriveFilePath || fallback;
    const normalized = rawPath.replace(/^\/+/, "");
    return normalized || fallback;
  }

  buildOneDriveContentUrl(settings) {
    if (settings.onedriveFileId) {
      return `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}/content`;
    }
    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}:/content`;
  }

  async resolveOneDriveItem(accessToken, settings) {
    if (settings.onedriveFileId) {
      const byId = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${settings.onedriveFileId}?select=id,name,lastModifiedDateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (byId.ok) {
        return byId.json();
      }
      if (byId.status !== 404) {
        throw new Error(`OneDrive のファイル確認に失敗しました (${byId.status})`);
      }
    }

    const path = this.buildOneDrivePath(settings);
    const encodedPath = this.encodeOneDrivePath(path);
    const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodedPath}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`OneDrive のファイル検索に失敗しました (${response.status})`);
    }
    const result = await response.json();
    return result ?? null;
  }

  async uploadToOneDrive(accessToken, payload, settings) {
    const url = this.buildOneDriveContentUrl(settings);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`OneDrive への保存に失敗しました (${response.status})`);
    }
    const meta = await response.json().catch(() => null);
    return meta?.id ?? null;
  }
}
