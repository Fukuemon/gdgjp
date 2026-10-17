import data from "./clips.json";

/** One phrase of a clip, in milliseconds from the start of the audio. */
export type Segment = { s: number; e: number; t: string };

export type Clip = {
  id: string;
  /** "A" | "B" | "C" | "D", or null for the shared standby clips. */
  track: string | null;
  /** Source WAV basename, shown as the faint sub-label. */
  file: string;
  /** Manuscript heading, e.g. "10:40 Opening 終了 ＆ 村上 憲郎 学長 呼び込み". */
  title: string;
  src: string;
  durationMs: number;
  /** Loop by default (A-01 is the doors-open loop). */
  loop: boolean;
  segments: Segment[];
  /** Added from the controller (R2 + D1) rather than bundled; editable. */
  uploaded?: true;
};

/** An uploaded clip as stored: placed right after `after` (null = first) in its group. */
export type UploadedClip = Clip & { uploaded: true; after: string | null; createdAt: number };

export const bundledClips: Clip[] = (data as { clips: Clip[] }).clips;

/** Tracks that have bundled clips, in order. Uploads go to these or to the common shelf. */
export const tracks: string[] = [...new Set(bundledClips.map((c) => c.track))]
  .filter((t): t is string => t !== null)
  .sort();

export function isTrack(id: string | null | undefined): id is string {
  return tracks.some((t) => t === id);
}

/** A track's channel plays that track's clips plus the shared standby clips. */
export function playableOn(clip: Pick<Clip, "track">, track: string): boolean {
  return clip.track === null || clip.track === track;
}

export function uploadedSrc(id: string): string {
  return `/media/${id}`;
}

/**
 * Splice uploaded clips into one group (a track, or the common shelf). Each
 * upload follows its anchor; several on the same anchor keep upload order,
 * and an upload's own followers come right after it. Uploads whose anchor
 * is gone (deleted, or moved to another group) fall to the end.
 */
function placeGroup(bundled: Clip[], uploaded: UploadedClip[]): Clip[] {
  const ordered = [...uploaded].sort((a, b) => a.createdAt - b.createdAt);
  const followers = new Map<string | null, UploadedClip[]>();
  for (const u of ordered) {
    const list = followers.get(u.after) ?? [];
    list.push(u);
    followers.set(u.after, list);
  }
  const out: Clip[] = [];
  const seen = new Set<string>();
  const emit = (clip: Clip) => {
    if (seen.has(clip.id)) return;
    seen.add(clip.id);
    out.push(clip);
    for (const f of followers.get(clip.id) ?? []) emit(f);
  };
  for (const f of followers.get(null) ?? []) emit(f);
  for (const clip of bundled) emit(clip);
  for (const u of ordered) emit(u);
  return out;
}

export type Catalog = {
  all: Clip[];
  common: Clip[];
  byTrack: Record<string, Clip[]>;
  get: (id: string | null | undefined) => Clip | undefined;
  /** What one track's channel serves: its clips plus the common shelf. */
  forTrack: (track: string) => Clip[];
};

export function buildCatalog(uploaded: UploadedClip[] = []): Catalog {
  const group = (track: string | null) =>
    placeGroup(
      bundledClips.filter((c) => c.track === track),
      uploaded.filter((c) => c.track === track),
    );
  const common = group(null);
  const byTrack = Object.fromEntries(tracks.map((t) => [t, group(t)]));
  const all = [...common, ...tracks.flatMap((t) => byTrack[t])];
  const byId = new Map(all.map((c) => [c.id, c]));
  return {
    all,
    common,
    byTrack,
    get: (id) => (id ? byId.get(id) : undefined),
    forTrack: (track) => [...common, ...(byTrack[track] ?? [])],
  };
}
