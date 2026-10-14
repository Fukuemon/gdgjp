import { loadStorageState } from "./session.server";
import { type CheckinResult, parseCheckinPage } from "./ui/checkin";

type StoredCookie = { name: string; value: string; domain: string; expires?: number };

/** Cookie header for connpass.com built from the bot's Playwright storageState in KV. */
export async function connpassCookieHeader(env: Env): Promise<string | null> {
  const state = (await loadStorageState(env)) as { cookies?: StoredCookie[] } | undefined;
  const now = Date.now() / 1000;
  const cookies = (state?.cookies ?? []).filter(
    (c) =>
      c.domain.replace(/^\./, "").endsWith("connpass.com") &&
      (c.expires == null || c.expires < 0 || c.expires > now),
  );
  return cookies.length ? cookies.map((c) => `${c.name}=${c.value}`).join("; ") : null;
}

/**
 * Fast path: replay the QR URL with the KV session cookies, no browser. Returns null
 * whenever the outcome is not trustworthy (no cookies, login redirect, non-200) so
 * the caller falls back to the browser, which can also re-login.
 */
export async function checkInWithFetch(
  env: Env,
  checkinUrl: string,
): Promise<CheckinResult | null> {
  const cookie = await connpassCookieHeader(env);
  if (!cookie) return null;
  const response = await fetch(checkinUrl, {
    headers: { cookie, "user-agent": "Mozilla/5.0 (compatible; gdg-connpass-bot)" },
    redirect: "manual",
  });
  if (response.status !== 200) return null;
  return parseCheckinPage(await response.text());
}
