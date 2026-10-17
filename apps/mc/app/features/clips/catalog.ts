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
};

export const clips: Clip[] = (data as { clips: Clip[] }).clips;

const byId = new Map(clips.map((c) => [c.id, c]));

export function getClip(id: string | null | undefined): Clip | undefined {
  return id ? byId.get(id) : undefined;
}

export const commonClips = clips.filter((c) => c.track === null);

/** Tracks that have at least one clip, in order. */
export const tracks: { id: string; clips: Clip[] }[] = [...new Set(clips.map((c) => c.track))]
  .filter((t): t is string => t !== null)
  .sort()
  .map((id) => ({ id, clips: clips.filter((c) => c.track === id) }));

export function clipText(clip: Clip): string {
  return clip.segments.map((s) => s.t).join("");
}
