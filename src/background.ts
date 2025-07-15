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

async function handleUpdateTab(tab: browser.Tabs.Tab) {
  if (!tab.url?.startsWith("file://")) {
    const matchType: MatchType = "none";
    await setActionIcon(matchType);
    setTabCache(tab.id!, null, matchType);
    return;
  }

  const cached = getTabCache(tab.id!);
  if (cached) {
    await setActionIcon(cached.matchType);
    return;
  }

  const { accessToken } = await getStorage(["accessToken"]);
  if (!accessToken) {
    const matchType: MatchType = "login";
    await setActionIcon(matchType);
    await setStorage({ accessToken: null });
    setTabCache(tab.id!, null, matchType);
    return;
  }

  await setActionIcon("none");

  const path = decodeURIComponent(tab.url.replace("file://", ""));
  const { fileId, matchType } = await searchPath(path);
  await setActionIcon(matchType);
  setTabCache(tab.id!, fileId ?? null, matchType);
}

browser.tabs.onUpdated.addListener(async (_tabId: number, changeInfo, tab) => {
  try {
    if (changeInfo.status !== "complete") return;
    await handleUpdateTab(tab);
  } catch (e) {
    console.error("failed to complete onUpdated handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    await handleUpdateTab(tab);
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
    if (!cached) {
      throw "No matching file found in Google Drive.";
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
  deleteTabCache(tabId);
});

setInterval(
  () => {
    cleanupTabCache();
  },
  60 * 1000,
);
