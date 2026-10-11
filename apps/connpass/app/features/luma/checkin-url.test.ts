import { describe, expect, it } from "vitest";
import { parseLumaCheckinUrl } from "./checkin-url";

describe("parseLumaCheckinUrl", () => {
  it("accepts a Luma ticket QR payload", () => {
    expect(
      parseLumaCheckinUrl("https://luma.com/check-in/evt-ADQlYMqBNjx0Lz1?pk=g-xxESl2JH0e6RQCs"),
    ).toEqual({ eventApiId: "evt-ADQlYMqBNjx0Lz1", proxyKey: "g-xxESl2JH0e6RQCs" });
  });

  it("accepts the legacy lu.ma host, a trailing slash and surrounding whitespace", () => {
    expect(parseLumaCheckinUrl(" https://lu.ma/check-in/evt-abc/?pk=g-def#x ")).toEqual({
      eventApiId: "evt-abc",
      proxyKey: "g-def",
    });
  });

  it.each([
    undefined,
    42,
    "not a url",
    "http://luma.com/check-in/evt-abc?pk=g-def",
    "https://evil.example/check-in/evt-abc?pk=g-def",
    "https://api.luma.com/check-in/evt-abc?pk=g-def",
    "https://user:pass@luma.com/check-in/evt-abc?pk=g-def",
    "https://luma.com:8443/check-in/evt-abc?pk=g-def",
    "https://luma.com/check-in/evt-abc",
    "https://luma.com/check-in/evt-abc?pk=gst-def",
    "https://luma.com/check-in/evt-abc?pk=g-def%26x",
    "https://luma.com/check-in/evt-abc/scan?pk=g-def",
    "https://luma.com/event/evt-abc?pk=g-def",
  ])("rejects %s", (raw) => {
    expect(parseLumaCheckinUrl(raw)).toBeNull();
  });
});
