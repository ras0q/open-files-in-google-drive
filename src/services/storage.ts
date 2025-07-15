import browser from "webextension-polyfill";

type StorageData = {
  accessToken: string | null;
  rootId: string | null;
};

export async function getStorage<K extends keyof StorageData>(
  keys: K[],
): Promise<Pick<StorageData, K>> {
  const result = await browser.storage.local.get(keys);
  return result as Pick<StorageData, K>;
}

export async function setStorage(data: Partial<StorageData>): Promise<void> {
  await browser.storage.local.set(data);
}
