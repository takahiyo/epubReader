export const NOTION_INTEGRATION_STATUS = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTED: "connected",
  PENDING: "pending",
  ERROR: "error",
});

export const NOTION_DEFAULT_SETTINGS = Object.freeze({
  status: NOTION_INTEGRATION_STATUS.DISCONNECTED,
  workspaceName: "",
  parentPageId: "",
  databaseId: "",
  lastConnectedAt: null,
  lastSyncAt: null,
});

export const NOTION_CONFIG = Object.freeze({
  API_VERSION: "2022-06-28",
  OAUTH_URL: "",
});
