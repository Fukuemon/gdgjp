import { describe, expect, it } from "vitest";
import { primaryIntent, restartIntent, seekIntent, showsPause } from "./intent";

describe("primaryIntent", () => {
  it("pauses the playing clip behind a confirmation", () => {
    expect(primaryIntent("A-01", 0, { clipId: "A-01", status: "playing" })).toEqual({
      cmd: { kind: "pause" },
      confirm: "pause",
    });
  });

  it("asks before stopping a loop that is waiting", () => {
    expect(primaryIntent("A-01", 0, { clipId: "A-01", status: "gap" }).confirm).toBe("stopLoop");
  });

  it("resumes a paused clip without asking", () => {
    expect(primaryIntent("A-01", 0, { clipId: "A-01", status: "paused" })).toEqual({
      cmd: { kind: "resume" },
      confirm: null,
    });
  });

  it("replays an ended clip from the start", () => {
    expect(primaryIntent("A-01", 9000, { clipId: "A-01", status: "ended" }).cmd).toEqual({
      kind: "play",
      clipId: "A-01",
      fromMs: 0,
    });
  });

  it("plays another clip from its cue, confirming only if something is audible", () => {
    expect(primaryIntent("B-02", 4000, { clipId: "A-01", status: "playing" })).toEqual({
      cmd: { kind: "play", clipId: "B-02", fromMs: 4000 },
      confirm: "switch",
    });
    expect(primaryIntent("B-02", 4000, { clipId: "A-01", status: "paused" }).confirm).toBeNull();
    expect(primaryIntent("B-02", 0, { clipId: null, status: "idle" }).confirm).toBeNull();
  });
});

describe("restartIntent / seekIntent", () => {
  it("confirm only while audible", () => {
    expect(restartIntent({ clipId: "A-01", status: "playing" }).confirm).toBe("restart");
    expect(restartIntent({ clipId: "A-01", status: "paused" }).confirm).toBeNull();
    expect(seekIntent(1200.4, { clipId: "A-01", status: "playing" })).toEqual({
      cmd: { kind: "seek", ms: 1200 },
      confirm: "seek",
    });
    expect(seekIntent(-5, { clipId: "A-01", status: "paused" })).toEqual({
      cmd: { kind: "seek", ms: 0 },
      confirm: null,
    });
  });
});

describe("showsPause", () => {
  it("only for the current audible clip", () => {
    expect(showsPause("A-01", { clipId: "A-01", status: "gap" })).toBe(true);
    expect(showsPause("A-01", { clipId: "A-01", status: "paused" })).toBe(false);
    expect(showsPause("A-02", { clipId: "A-01", status: "playing" })).toBe(false);
  });
});
