import { describe, expect, it } from "vitest";
import { audioMimeType, newUploadId, parseClipInput, parseNewClipInput } from "./clip-input";

const valid = {
  id: "U-0123456789",
  file: "hello.wav",
  durationMs: 5000,
  track: "A",
  after: null,
  title: " 見出し ",
  segments: [{ s: 0, e: 4000, t: "こんにちは" }],
};

describe("parseNewClipInput", () => {
  it("accepts a valid registration and trims text", () => {
    const parsed = parseNewClipInput(valid);
    expect(parsed).toEqual({ ok: true, value: { ...valid, title: "見出し" } });
  });

  it.each([
    ["id", { id: "../x" }],
    ["track", { track: "Z" }],
    ["title", { title: "  " }],
    ["segments", { segments: [] }],
    ["segments", { segments: [{ s: 0, e: 9000, t: "長すぎ" }] }],
    ["durationMs", { durationMs: 0 }],
  ])("rejects a bad %s", (error, patch) => {
    expect(parseNewClipInput({ ...valid, ...patch })).toEqual({ ok: false, error });
  });

  it("accepts the common shelf as track null", () => {
    expect(parseClipInput({ ...valid, track: null }, 5000).ok).toBe(true);
  });
});

describe("audioMimeType", () => {
  it("maps browser types and extensions to Gemini's names", () => {
    expect(audioMimeType("audio/x-wav", "a.wav")).toBe("audio/wav");
    expect(audioMimeType("", "a.MP3")).toBe("audio/mp3");
    expect(audioMimeType("audio/mpeg", "a")).toBe("audio/mp3");
    expect(audioMimeType("video/mp4", "a.mp4")).toBeNull();
  });
});

describe("newUploadId", () => {
  it("matches the id format", () => {
    expect(newUploadId()).toMatch(/^U-[0-9a-f]{10}$/);
  });
});
