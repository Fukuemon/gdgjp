import { describe, expect, it } from "vitest";
import { type UploadedClip, buildCatalog, bundledClips } from "./catalog";

function upload(id: string, track: string | null, after: string | null, createdAt: number) {
  return {
    id,
    track,
    after,
    createdAt,
    uploaded: true,
    file: `${id}.wav`,
    title: id,
    src: `/media/${id}`,
    durationMs: 1000,
    loop: false,
    segments: [{ s: 0, e: 1000, t: id }],
  } satisfies UploadedClip;
}

const ids = (clips: { id: string }[]) => clips.map((c) => c.id);

describe("buildCatalog", () => {
  const a = bundledClips.filter((c) => c.track === "A").map((c) => c.id);

  it("is the bundled catalogue with no uploads", () => {
    const catalog = buildCatalog();
    expect(ids(catalog.byTrack.A)).toEqual(a);
    expect(catalog.get(a[0])?.id).toBe(a[0]);
  });

  it("places uploads after their anchor, in upload order, followers after their parent", () => {
    const catalog = buildCatalog([
      upload("U-2", "A", a[0], 2),
      upload("U-1", "A", a[0], 1),
      upload("U-3", "A", "U-1", 3),
      upload("U-0", "A", null, 0),
    ]);
    expect(ids(catalog.byTrack.A).slice(0, 6)).toEqual(["U-0", a[0], "U-1", "U-3", "U-2", a[1]]);
  });

  it("sends uploads with a missing or foreign anchor to the end of their group", () => {
    const b0 = bundledClips.find((c) => c.track === "B")?.id ?? "";
    const catalog = buildCatalog([upload("U-1", "A", "gone", 1), upload("U-2", "A", b0, 2)]);
    expect(ids(catalog.byTrack.A).slice(-2)).toEqual(["U-1", "U-2"]);
  });

  it("serves common uploads on every track", () => {
    const catalog = buildCatalog([upload("U-9", null, null, 1)]);
    expect(catalog.common[0].id).toBe("U-9");
    expect(ids(catalog.forTrack("B"))).toContain("U-9");
    expect(ids(catalog.forTrack("B"))).not.toContain(a[0]);
  });
});
