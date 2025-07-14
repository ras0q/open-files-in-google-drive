import browser from "webextension-polyfill";

const MATCH_TYPES = ["default", "login", "full", "partial", "none"] as const;
type MatchType = typeof MATCH_TYPES[number];

function getIconPath(matchType: MatchType) {
  return `public/icon-${matchType}.png`;
}

type StorageData = {
  accessToken?: string | null;
  fileId?: string | null;
};

async function getStorage<K extends keyof StorageData>(
  keys: K[],
): Promise<Pick<StorageData, K>> {
  const result = await browser.storage.local.get(keys);
  return result as Pick<StorageData, K>;
}

async function setStorage(data: Partial<StorageData>): Promise<void> {
  await browser.storage.local.set(data);
}

function notifyUser(message: string) {
  browser.notifications.create({
    type: "basic",
    iconUrl: getIconPath("default"),
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
}

type File = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
};

async function searchDrive(
  query: { path: string },
): Promise<{ matchType: MatchType; fileId?: string }> {
  const { accessToken } = await getStorage(["accessToken"]);
  if (!accessToken) {
    return { matchType: "login" };
  }

  if (query.path) {
    const pathParts = query.path.split("/").filter(Boolean);
    if (pathParts.length === 0) {
      return { matchType: "none" };
    }

    const mimeFolder = "application/vnd.google-apps.folder";
    const namesQuery = pathParts
      .map((n, i) =>
        `(name = '${n.replace(/'/g, "\\'")}' and mimeType ${
          i === pathParts.length - 1 ? "!=" : "="
        } '${mimeFolder}')`
      )
      .join(" or ");

    const searchDriveUrl = new URL("https://www.googleapis.com/drive/v3/files");
    searchDriveUrl.searchParams.set("q", `(${namesQuery}) and trashed = false`);
    searchDriveUrl.searchParams.set(
      "fields",
      "files(id, name, mimeType, parents)",
    );

    const res = await fetch(searchDriveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        setStorage({ accessToken: null });
        return { matchType: "login" };
      }

      console.error(
        "failed to list files",
        res.status,
        res.statusText,
        await res.text(),
      );
      return { matchType: "none" };
    }

    const { files } = await res.json() as { files: File[] };
    if (!files || files.length === 0) {
      return { matchType: "none" };
    }

    let fileId: string | undefined = undefined;
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const isFile = i === pathParts.length - 1;
      const candidates = files.filter((f) =>
        f.name === pathParts[i] &&
        isFile === (f.mimeType != mimeFolder)
      );
      if (!candidates || candidates.length === 0) {
        if (isFile) {
          return { matchType: "none" };
        }

        return { matchType: "partial", fileId };
      }

      if (candidates.every((f) => f.parents.length === 0)) {
        return { matchType: "full", fileId };
      }

      const candidatesWithParents = candidates.filter((c) =>
        files.find((f) => f.id === c.parents[0])
      );
      if (candidatesWithParents.length === 0) {
        return { matchType: "partial", fileId };
      }

      if (isFile) {
        fileId = candidatesWithParents[0].id;
      }
    }

    return { matchType: "full", fileId };
  }

  return { matchType: "none", fileId: undefined };
}

browser.tabs.onUpdated.addListener(async (_tabId: number, changeInfo, tab) => {
  try {
    if (changeInfo.status !== "complete") return;
    if (!tab.url?.startsWith("file:///")) {
      browser.action.setIcon({ path: getIconPath("none") });
      await setStorage({ fileId: null });
      return;
    }

    const path = decodeURIComponent(tab.url.replace("file:///", ""));
    const { fileId, matchType } = await searchDrive({ path });
    browser.action.setIcon({ path: getIconPath(matchType) });
    await setStorage({ fileId });
  } catch (e) {
    console.error("failed to complete onUpdated handler", e);
  }
});

browser.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.url?.startsWith("file:///")) {
      notifyUser("Cannot open the remote file now.");
      return;
    }

    const { accessToken, fileId } = await getStorage(["accessToken", "fileId"]);
    if (!accessToken) {
      notifyUser("Please authenticate with Google Drive.");
      await authenticate();
      browser.action.setIcon({ path: getIconPath("none") });
      return;
    }

    if (!fileId) {
      notifyUser("No matching file found in Google Drive.");
      return;
    }

    await browser.tabs.create({
      url: `https://drive.google.com/file/d/${fileId}/view`,
    });
  } catch (e) {
    console.error("failed to complete onClicked handler", e);
  }
});
