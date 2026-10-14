import type { Page } from "@cloudflare/playwright";

export type CheckinUrl = { url: string; eventId: string };

const CHECKIN_PATH = /^\/event\/(\d+)\/qr_checkin\/\d+\/\d+\/?$/;

/**
 * Accept only connpass reception QR URLs
 * (`https://connpass.com/event/<eventId>/qr_checkin/<n>/<n>/`) so the bot never
 * navigates to an arbitrary caller-supplied address.
 */
export function parseCheckinUrl(raw: unknown): CheckinUrl | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "connpass.com") return null;
  if (url.username || url.password || url.port) return null;
  const match = CHECKIN_PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return { url: `https://connpass.com${path}`, eventId: match[1] };
}

export type CheckinReason = "already_checked_in" | "failed";
export type CheckinResult = {
  checkedIn: boolean;
  /** connpass username of the participant, when the result page exposes it. */
  userId: string | null;
  reason: CheckinReason | null;
};

const CHECKIN_ALREADY =
  /(すでに|既に|もう).{0,20}(受付|出席|チェックイン)|受付済|チェックイン済|出席済/;
const CHECKIN_SUCCESS =
  /受付(が|を)?(完了|しました)|出席(登録|に)|チェックイン(が|を)?(完了|しました)/;
const CHECKIN_FAILURE = /(無効|見つかりません|権限|エラー|失敗|できません)/;
const USER_LINK = /href="(?:https:\/\/connpass\.com)?\/user\/([^/"?#]+)\/?"/;

/** Drop site chrome so the logged-in bot's own profile link is never mistaken for the attendee. */
function mainContent(html: string): string {
  return html
    .replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
}

/** Classify the page connpass returns for a reception QR URL (shared by fetch and browser paths). */
export function parseCheckinPage(html: string): CheckinResult {
  const main = mainContent(html);
  const text = main
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const userId = USER_LINK.exec(main)?.[1] ?? null;
  if (CHECKIN_FAILURE.test(text)) return { checkedIn: false, userId, reason: "failed" };
  if (CHECKIN_ALREADY.test(text)) return { checkedIn: false, userId, reason: "already_checked_in" };
  if (CHECKIN_SUCCESS.test(text)) return { checkedIn: true, userId, reason: null };
  return { checkedIn: false, userId, reason: "failed" };
}

/**
 * Open the reception QR URL as the bot (a co-admin of the event), which is all
 * connpass needs to mark the participant as attended. Images, fonts, media and CSS
 * are aborted since only the result text is read.
 */
export async function checkInWithQrUrl(page: Page, checkinUrl: string): Promise<CheckinResult> {
  await page.route("**/*", (route) =>
    ["image", "font", "media", "stylesheet"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue(),
  );
  const response = await page.goto(checkinUrl, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) throw new Error("connpass_login_required");
  if (!response?.ok()) return { checkedIn: false, userId: null, reason: "failed" };
  return parseCheckinPage(await page.content());
}
