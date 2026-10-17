import { describe, expect, it } from "vitest";
import { Smoother } from "./smoother";

describe("Smoother", () => {
  it("tracks small continuous moves exactly", () => {
    const s = new Smoother(300);
    s.step(1000, 16);
    expect(s.step(1016, 16)).toBe(1016);
    expect(s.step(1032, 16)).toBe(1032);
  });

  it("glides across a jump and settles on the target", () => {
    const s = new Smoother(300);
    s.step(0, 16);
    const first = s.step(10_000, 16);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(10_000);
    let v = first;
    for (let i = 0; i < 120; i++) v = s.step(10_000, 16);
    expect(v).toBe(10_000);
  });

  it("snaps when asked", () => {
    const s = new Smoother(300);
    s.step(0, 16);
    expect(s.step(5000, 16, true)).toBe(5000);
  });
});
