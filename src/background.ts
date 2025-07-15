import browser from "webextension-polyfill";
import { getFile, searchPath } from "./services/driveapi.ts";
import { authenticate } from "./services/googleauth.ts";
import { getIconPath, MatchType } from "./services/icon.ts";
import { getStorage, setStorage } from "./services/storage.ts";
import {
  cleanupTabCache,
  deleteTabCache,
  getTabCache,
  setTabCache,
} from "./services/tabcache.ts";

function setActionIcon(matchType: MatchType) {
  return browser.action.setIcon({ path: getIconPath(matchType) });
}

function notify(message: string) {
  browser.notifications.create({
    type: "basic",
    iconUrl: getIconPath("default"),
    title: "Open Files in Google Drive",
    message,
  });
}

async function handleUpdateTab(
  tabId: number,
  url: string,
  useCache: boolean = true,
) {
  if (!url.startsWith("file://")) {
    await setActionIcon("none");
    return;
  }

  if (useCache) {
    const cached = getTabCache(tabId);
    if (cached) {
      await setActionIcon(cached.matchType);
      return;
    }
  }

  const { accessToken } = await getStorage(["accessToken"]);
  if (!accessToken) {
    const matchType: MatchType = "login";
    await setActionIcon(matchType);
    await setStorage({ accessToken: null });
    setTabCache(tabId, null, matchType);
    return;
  }

  await setActionIcon("none");

  const path = decodeURIComponent(url.replace("file://", ""));
  const { fileId, matchType } = await searchPath(path);
  await setActionIcon(matchType);
  setTabCache(tabId, fileId ?? null, matchType);
}

browser.tabs.onUpdated.addListener(async (tabId: number, changeInfo, tab) => {
  try {
    if (changeInfo.status !== "complete" || !tab.url) return;

    const useCache = false;
    await handleUpdateTab(tabId, tab.url, useCache);
  } catch (e) {
    console.error("failed to complete onUpdated handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (!tab.url) return;

    await handleUpdateTab(activeInfo.tabId, tab.url);
  } catch (e) {
    console.error("failed to complete onActivated handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

browser.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.url?.startsWith("file://")) {
      throw "Cannot support opening the remote file now.";
    }

    const { accessToken } = await getStorage(["accessToken"]);
    if (!accessToken) {
      await authenticate();
      const { id: rootId } = await getFile("root");
      await setStorage({ rootId });
      await setActionIcon("none");
      notify("Authenticated successfully. Please reload the page.");
      return;
    }

    const cached = getTabCache(tab.id!);
    if (!cached || !cached.fileId) {
      notify("No matching file found in Google Drive.");
      return;
    }

    await browser.tabs.create({
      url: `https://drive.google.com/file/d/${cached.fileId}/view`,
    });
  } catch (e) {
    console.error("failed to complete onClicked handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  try {
    deleteTabCache(tabId);
  } catch (e) {
    console.error("failed to complete onRemoved handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

setInterval(
  () => {
    cleanupTabCache();
  },
  60 * 1000,
);
