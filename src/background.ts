import browser from "webextension-polyfill";

const ICON_PATHS = {
  default: "public/icon-default.png",
  login: "public/icon-login.png",
  strong: "public/icon-strong.png",
  weak: "public/icon-weak.png",
  none: "public/icon-none.png",
} as const;
type MatchType = keyof typeof ICON_PATHS;

type StorageData = {
  accessToken?: string;
  fileId?: string;
  matchType?: MatchType;
};

async function getStorage<K extends keyof StorageData>(
  keys: K[] | K,
): Promise<Pick<StorageData, K>> {
  const result = await browser.storage.local.get(keys as string[]);
  return result as Pick<StorageData, K>;
}

async function setStorage(data: Partial<StorageData>): Promise<void> {
  await browser.storage.local.set(data);
}

function notifyUser(message: string) {
  browser.notifications.create({
    type: "basic",
    iconUrl: ICON_PATHS["default"],
    title: "Open Files in Google Drive",
    message,
  });
}

async function authenticate() {
  const manifest = browser.runtime.getManifest() as
    & browser.Manifest.WebExtensionManifest
    & {
      oauth2: {
        client_id: string;
        scopes: string[];
      };
    };
  const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
  authUrl.searchParams.set("client_id", manifest.oauth2.client_id);
  authUrl.searchParams.set("scope", manifest.oauth2.scopes.join(" "));
  authUrl.searchParams.set("redirect_uri", browser.identity.getRedirectURL());
  authUrl.searchParams.set("response_type", "token");

  try {
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });
    const accessToken = new URL(responseUrl.replace(/#/, "?"))
      .searchParams
      .get("access_token");
    if (!accessToken) {
      notifyUser("Failed to retrieve access token");
      return;
    }

    await setStorage({ accessToken });
    notifyUser("Google Drive authentication successful.");
  } catch (e: unknown) {
    notifyUser("Google Drive authentication failed.");
    console.error(e);
  }
}

async function searchDrive(
  query: { path?: string; name?: string },
): Promise<{ matchType: MatchType; fileId?: string }> {
  const { accessToken } = await getStorage("accessToken");
  if (!accessToken) {
    return { matchType: "login" };
  }

  const DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";

  // path search
  if (query.path) {
    const sanitizedPath = query.path.replace(/'/g, "\\'");
    const searchDriveUrl = new URL(DRIVE_API_URL);
    searchDriveUrl.searchParams.set(
      "q",
      `appProperties has { key='localPath' and value='${sanitizedPath}' } and trashed = false`,
    );
    const res = await fetch(searchDriveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const { files } = await res.json();
      if (files && files.length > 0) {
        return { matchType: "strong", fileId: files[0].id };
      }
    }
  }

  // name only search
  if (query.name) {
    const sanitizedName = query.name.replace(/'/g, "\\'");
    const searchDriveUrl = new URL(DRIVE_API_URL);
    searchDriveUrl.searchParams.set(
      "q",
      `name = '${sanitizedName}' and trashed = false`,
    );
    const res = await fetch(searchDriveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const { files } = await res.json();
      if (files && files.length > 0) {
        return { matchType: "weak", fileId: files[0].id };
      }
    }
  }

  return { matchType: "none", fileId: undefined };
}

browser.tabs.onUpdated.addListener(async (_tabId: number, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith("file://")) {
    browser.action.setIcon({ path: ICON_PATHS["default"] });
    await setStorage({ fileId: undefined, matchType: "default" });
    return;
  }

  const path = decodeURIComponent(tab.url.replace("file://", ""));
  {
    const { fileId, matchType } = await searchDrive({ path });
    if (matchType !== "none") {
      browser.action.setIcon({ path: ICON_PATHS[matchType] });
      await setStorage({ fileId, matchType });
      return;
    }
  }

  {
    const name = path.split("/").pop();
    const { fileId, matchType } = await searchDrive({ name });
    browser.action.setIcon({ path: ICON_PATHS[matchType] });
    await setStorage({ fileId, matchType });
  }
});

browser.action.onClicked.addListener(async () => {
  const { accessToken, fileId, matchType } = await getStorage([
    "accessToken",
    "fileId",
    "matchType",
  ]);
  if (!accessToken || matchType === "login") {
    notifyUser("Please authenticate with Google Drive to use this extension.");
    await authenticate();
    return;
  }

  if (matchType === "none" || !fileId) {
    notifyUser("No matching file found in Google Drive.");
    return;
  }

  if (matchType === "strong") {
    notifyUser("Exact match found. Opening in Google Drive.");
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    await browser.tabs.create({ url });
    return;
  }

  if (matchType === "weak") {
    notifyUser("Partial match found. Opening in Google Drive.");
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    await browser.tabs.create({ url });
    return;
  }

  notifyUser("Ready. Click the icon to search for files in Google Drive.");
});
