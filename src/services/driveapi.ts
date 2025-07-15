import { MatchType } from "./icon.ts";
import { getStorage, setStorage } from "./storage.ts";

async function driveApiRequest<T>({ path, searchParams }: {
  path?: `/${string}`;
  searchParams?: URLSearchParams;
}): Promise<T> {
  const { accessToken } = await getStorage(["accessToken"]);
  if (!accessToken) {
    throw "Access token is null";
  }

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files${path ?? ""}`,
  );
  if (searchParams) {
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    await setStorage({ accessToken: null });
  }
  if (res.status === 200) {
    return await res.json() as T;
  }

  throw `Unexpected status: ${res.status}, ${await res.text()}`;
}

type File = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
};

export async function searchFiles(
  query: { path: string },
): Promise<{ matchType: MatchType; fileId?: string }> {
  const { rootId } = await getStorage(["rootId"]);

  const pathParts = query.path
    .split("/")
    .filter((p) => p && !/[a-zA-Z]\:/.test(p));
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

  const searchParams = new URLSearchParams();
  searchParams.set("q", `(${namesQuery}) and trashed = false`);
  searchParams.set("fields", "files(id, name, mimeType, parents)");

  const { files } = await driveApiRequest<{ files: File[] }>({ searchParams });
  if (!files || files.length === 0) {
    return { matchType: "none" };
  }

  let fileId: string | undefined = undefined;
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const isFile = i === pathParts.length - 1;
    const candidates = files.filter((f: File) =>
      f.name === pathParts[i] &&
      isFile === (f.mimeType != mimeFolder)
    );
    if (!candidates || candidates.length === 0) {
      if (isFile) {
        return { matchType: "none" };
      }

      return { matchType: "partial", fileId };
    }

    if (
      candidates.every((f) => f.parents.length === 0 || f.parents[0] === rootId)
    ) {
      return { matchType: "full", fileId };
    }

    const candidatesWithParents = candidates.filter((c: File) =>
      files.find((f: File) => f.id === c.parents[0])
    );
    if (candidatesWithParents.length === 0) {
      const parentId = candidates[0]?.parents[0];
      const parentParams = new URLSearchParams();
      parentParams.set("fields", "parents");
      const { parents } = await driveApiRequest<{ parents?: string[] }>({
        path: `/${parentId}`,
        searchParams: parentParams,
      });
      if (!parents || parents.length === 0) {
        return { matchType: "full", fileId };
      }

      return { matchType: "partial", fileId };
    }

    if (isFile) {
      fileId = candidatesWithParents[0].id;
    }
  }

  return { matchType: "full", fileId };
}

export async function getFile(fileId: string) {
  const file = await driveApiRequest<File>({
    path: `/${fileId}`,
  });
  return file;
}
