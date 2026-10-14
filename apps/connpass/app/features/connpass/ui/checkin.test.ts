import { describe, expect, it } from "vitest";
import { parseCheckinPage, parseCheckinUrl } from "./checkin";

describe("parseCheckinPage", () => {
  it("reports success with the attendee id, ignoring header links", () => {
    const html = `<header><a href="/user/bot/">bot</a></header><main><a href="/user/taro/">Taro</a> 受付が完了しました</main>`;
    expect(parseCheckinPage(html)).toEqual({ checkedIn: true, userId: "taro", reason: null });
  });

  it("reports already checked in", () => {
    const html = `<main><a href="/user/taro/">Taro</a>さんはすでに受付済みです</main>`;
    expect(parseCheckinPage(html)).toMatchObject({
      checkedIn: false,
      reason: "already_checked_in",
    });
  });

  it("reports failure for invalid pages", () => {
    expect(parseCheckinPage("<main>無効なQRコードです</main>")).toMatchObject({
      checkedIn: false,
      reason: "failed",
    });
  });
});

describe("parseCheckinUrl", () => {
  it("accepts a connpass reception QR URL", () => {
    expect(parseCheckinUrl("https://connpass.com/event/388434/qr_checkin/831287/7082717/")).toEqual(
      {
        url: "https://connpass.com/event/388434/qr_checkin/831287/7082717/",
        eventId: "388434",
      },
    );
  });

  it("normalizes a missing trailing slash and drops query and fragment", () => {
    expect(parseCheckinUrl(" https://connpass.com/event/1/qr_checkin/2/3?x=1#y ")).toEqual({
      url: "https://connpass.com/event/1/qr_checkin/2/3/",
      eventId: "1",
    });
  });

  it.each([
    undefined,
    42,
    "not a url",
    "http://connpass.com/event/1/qr_checkin/2/3/",
    "https://evil.example/event/1/qr_checkin/2/3/",
    "https://gdg-tokyo.connpass.com/event/1/qr_checkin/2/3/",
    "https://user:pass@connpass.com/event/1/qr_checkin/2/3/",
    "https://connpass.com:8443/event/1/qr_checkin/2/3/",
    "https://connpass.com/event/1/",
    "https://connpass.com/event/1/qr_checkin/2/",
    "https://connpass.com/event/1/qr_checkin/2/3/extra/",
  ])("rejects %s", (raw) => {
    expect(parseCheckinUrl(raw)).toBeNull();
  });
});
