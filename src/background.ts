import browser from "webextension-polyfill";
import { getFile, searchPath } from "./services/driveapi.ts";
import { authenticate } from "./services/googleauth.ts";
import { getIconPath, MatchType } from "./services/icon.ts";
import { getStorage, setStorage } from "./services/storage.ts";

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

browser.tabs.onUpdated.addListener(async (_tabId: number, changeInfo, tab) => {
  try {
    if (changeInfo.status !== "complete") return;
    if (!tab.url?.startsWith("file://")) {
      await setActionIcon("none");
      await setStorage({ fileId: null });
      return;
    }

    const { accessToken } = await getStorage(["accessToken"]);
    if (!accessToken) {
      await setActionIcon("login");
      await setStorage({ accessToken: null });
      return;
    }

    const path = decodeURIComponent(tab.url.replace("file://", ""));
    const { fileId, matchType } = await searchPath(path);
    await setActionIcon(matchType);
    await setStorage({ fileId });
  } catch (e) {
    console.error("failed to complete onUpdated handler:", e);
    notify(`An error occurred: ${e}`);
  }
});

browser.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.url?.startsWith("file://")) {
      throw "Cannot support opening the remote file now.";
    }

    const { accessToken, fileId } = await getStorage(["accessToken", "fileId"]);
    if (!accessToken) {
      await authenticate();
      const { id: rootId } = await getFile("root");
      await setStorage({ rootId });
      await setActionIcon("none");
      notify("Authenticated successfully. Please reload the page.");
      return;
    }

    if (!fileId) {
      throw "No matching file found in Google Drive.";
    }

    await browser.tabs.create({
      url: `https://drive.google.com/file/d/${fileId}/view`,
    });
  } catch (e) {
    console.error("failed to complete onClicked handler:", e);
    notify(`An error occurred: ${e}`);
  }
});
