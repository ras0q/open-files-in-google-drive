import browser from "webextension-polyfill";
import { setStorage } from "./storage.ts";

export async function authenticate() {
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
    throw "Failed to retrieve access token";
  }

  await setStorage({ accessToken });
}
