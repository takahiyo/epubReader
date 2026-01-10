import {
  initGoogleLogin,
  startGoogleLogin,
  onGoogleLoginStart,
  onGoogleLoginEnd,
  checkAuthStatus,
  getIdToken
} from "./auth.js";

import * as CloudSync from "./cloudSync.js";
import * as UI from "./ui.js";
import * as Reader from "./reader.js";

console.log("[Init] App.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Init] Initializing Epub Reader...");

  await Reader.initReader();
  UI.initUI();

  const auth = checkAuthStatus();

  if (auth.authenticated) {
    console.log("[Auth] Already logged in:", auth.userEmail);
    UI.showUserInfo(auth);
    await CloudSync.syncAllBooksFromCloud();
  } else {
    console.log("[Auth] Not logged in");
  }

  UI.onLoginClick(() => {
    startGoogleLogin();
  });

  UI.onLogoutClick(() => {
    CloudSync.logoutFromCloud();
    location.reload();
  });
});
import {
  initGoogleLogin,
  startGoogleLogin,
  onGoogleLoginStart,
  onGoogleLoginEnd,
  checkAuthStatus,
  getIdToken
} from "./auth.js";

import * as CloudSync from "./cloudSync.js";
import * as UI from "./ui.js";
import * as Reader from "./reader.js";

console.log("[Init] App.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Init] Initializing Epub Reader...");

  await Reader.initReader();
  UI.initUI();

  const auth = checkAuthStatus();

  if (auth.authenticated) {
    console.log("[Auth] Already logged in:", auth.userEmail);
    UI.showUserInfo(auth);
    await CloudSync.syncAllBooksFromCloud();
  } else {
    console.log("[Auth] Not logged in");
  }

  UI.onLoginClick(() => {
    startGoogleLogin();
  });

  UI.onLogoutClick(() => {
    CloudSync.logoutFromCloud();
    location.reload();
  });
});
