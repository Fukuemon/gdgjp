import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AckTracker } from "./ack-tracker";

describe("AckTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the ack", async () => {
    const t = new AckTracker(1500);
    const p = t.track("1");
    expect(t.settle("1", { ok: true })).toBe(true);
    await expect(p).resolves.toEqual({ ok: true });
    expect(t.size).toBe(0);
  });

  it("times out when no ack arrives", async () => {
    const t = new AckTracker(1500);
    const p = t.track("1");
    vi.advanceTimersByTime(1499);
    expect(t.size).toBe(1);
    vi.advanceTimersByTime(1);
    await expect(p).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("ignores a late ack after the timeout", async () => {
    const t = new AckTracker(1500);
    const p = t.track("1");
    vi.advanceTimersByTime(2000);
    expect(t.settle("1", { ok: true })).toBe(false);
    await expect(p).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("fails everything in flight on disconnect", async () => {
    const t = new AckTracker(1500);
    const a = t.track("a");
    const b = t.track("b");
    t.failAll("offline");
    await expect(a).resolves.toEqual({ ok: false, reason: "offline" });
    await expect(b).resolves.toEqual({ ok: false, reason: "offline" });
  });
});
