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

export async function searchPath(
  path: string,
): Promise<{ matchType: MatchType; fileId?: string }> {
  const pathParts = path
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

  const filesMap = new Map(files.map((f) => [f.id, f]));
  const { rootId } = await getStorage(["rootId"]);

  async function getMatchDepth(
    file: File,
    depth: number,
  ): Promise<{ depth: number; isFull: boolean }> {
    let current = file;
    let d = depth;
    for (let i = depth - 1; i >= 0; i--) {
      const parentId = current.parents?.[0];
      if (!parentId || parentId === rootId) {
        return { depth: d, isFull: true };
      }

      const parent = filesMap.get(parentId);
      if (!parent) {
        const parentFile = await getFile(parentId);
        if (!parentFile) {
          return { depth: d, isFull: false };
        }

        current = parentFile;
        d--;
        continue;
      }

      if (parent.name !== pathParts[i]) {
        return { depth: d, isFull: false };
      }

      current = parent;
      d--;
    }

    return { depth: d, isFull: true };
  }

  const candidates = files.filter((f: File) =>
    f.name === pathParts[pathParts.length - 1] &&
    f.mimeType != mimeFolder
  );
  if (candidates.length === 0) {
    return { matchType: "none" };
  }

  let best: { file: File; depth: number } | null = null;
  for (const candidate of candidates) {
    const { depth, isFull } = await getMatchDepth(
      candidate,
      pathParts.length - 1,
    );
    if (isFull) {
      return { matchType: "full", fileId: candidate.id };
    }
    if (!best || depth < best.depth) {
      best = { file: candidate, depth };
    }
  }

  if (best) {
    return { matchType: "partial", fileId: best.file.id };
  }

  return { matchType: "none" };
}

export async function getFile(fileId: string) {
  const file = await driveApiRequest<File>({
    path: `/${fileId}`,
    searchParams: new URLSearchParams({
      fields: "id, name, mimeType, parents",
    }),
  });
  return file;
}
