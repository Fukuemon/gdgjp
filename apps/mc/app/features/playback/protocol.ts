/**
 * Wire protocol between the controller pages, the McRoom Durable Object, and
 * the OBS player page. Everything is JSON text frames except the heartbeat,
 * which is the literal "ping" → "pong" pair answered by the DO's
 * WebSocket auto-response (it never wakes the object).
 */

import type { UploadedClip } from "~/features/clips/catalog";

export const PING = "ping";

/** One room per track: track A's controller and player only ever meet each other. */
export function roomName(track: string): string {
  return `track:${track}`;
}
export const PONG = "pong";

/** Player playback status. `gap` = waiting between loop iterations. */
export type PlayerStatus = "idle" | "playing" | "paused" | "ended" | "gap";

export type LoopSetting = { enabled: boolean; gapSec: number };

export type PlayerDiagnostics = {
  /** Clips fetched + decoded at startup. */
  preload: { loaded: number; total: number; failed: string[] };
  /** "blocked" once a play() was rejected with NotAllowedError. */
  autoplay: "ok" | "blocked" | "unknown";
  muted: boolean;
  volume: number;
  visibility: "visible" | "hidden";
  /** currentTime stopped advancing while status was "playing". */
  stalled: boolean;
  lastError: string | null;
  userAgent: string;
};

export type PlayerState = {
  clipId: string | null;
  status: PlayerStatus;
  positionMs: number;
  durationMs: number;
  /** Remaining wait before the next loop iteration, when status is "gap". */
  gapRemainingMs: number;
  diag: PlayerDiagnostics;
};

export type Command =
  | { kind: "play"; clipId: string; fromMs: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "restart" }
  | { kind: "seek"; ms: number };

export type FailureReason =
  | "offline" // the controller's own socket is down
  | "no-player" // no player socket connected to the room
  | "timeout" // no ack within ACK_TIMEOUT_MS
  | "autoplay-blocked"
  | "media-error"
  | "not-advancing"
  | "unknown-clip"
  | "invalid";

export type LogEntry = {
  at: number;
  level: "info" | "warn" | "error";
  /** Short machine-friendly code, rendered with an icon in the diagnostics. */
  code: string;
  detail?: string;
};

export type PlayerPresence = {
  connId: string;
  connectedAt: number;
  /** Server time of the last frame from this player. */
  lastSeenAt: number;
  state: PlayerState | null;
};

export type RoomConfig = {
  played: Record<string, true>;
  loops: Record<string, LoopSetting>;
};

// ─── controller → DO ─────────────────────────────────────────────────────────
export type ControllerMessage =
  | { type: "cmd"; id: string; cmd: Command }
  | { type: "setLoop"; clipId: string; setting: LoopSetting }
  | { type: "setPlayed"; clipId: string; value: boolean }
  | { type: "resetPlayed" }
  | { type: "rotateToken" }
  /**
   * Sent every HEARTBEAT_MS and relayed to players, which answer with a state
   * report. A hidden page's timers can be throttled to once a minute, but its
   * message handlers are not, so this keeps a hidden OBS source visibly alive.
   */
  | { type: "probe" };

// ─── player → DO ─────────────────────────────────────────────────────────────
export type PlayerMessage =
  | { type: "state"; state: PlayerState }
  | { type: "ack"; id: string; ok: true; state: PlayerState }
  | {
      type: "ack";
      id: string;
      ok: false;
      reason: FailureReason;
      detail?: string;
      state: PlayerState;
    }
  | { type: "log"; entry: Omit<LogEntry, "at"> };

// ─── DO → controller ─────────────────────────────────────────────────────────
export type ToControllerMessage =
  | {
      type: "snapshot";
      serverNow: number;
      token: string;
      config: RoomConfig;
      players: PlayerPresence[];
      log: LogEntry[];
      /** Every uploaded clip (all tracks): the editor needs other groups too. */
      clips: UploadedClip[];
    }
  | { type: "player"; serverNow: number; presence: PlayerPresence }
  | { type: "playerGone"; connId: string }
  | { type: "config"; config: RoomConfig }
  | { type: "token"; token: string }
  | { type: "catalog"; clips: UploadedClip[] }
  | { type: "result"; id: string; ok: true }
  | { type: "result"; id: string; ok: false; reason: FailureReason; detail?: string }
  | { type: "log"; entry: LogEntry };

// ─── DO → player ─────────────────────────────────────────────────────────────
export type ToPlayerMessage =
  | { type: "cmd"; id: string; cmd: Command }
  | { type: "config"; config: RoomConfig }
  /** Sent on connect and whenever an upload is added, edited, or removed. */
  | { type: "catalog"; clips: UploadedClip[] }
  | { type: "probe" };

/** Controller gives up on an ack after this long. */
export const ACK_TIMEOUT_MS = 1500;
/** Heartbeat interval for both sides. */
export const HEARTBEAT_MS = 1000;
/** No pong (or no player frame) for this long = disconnected. */
export const STALE_MS = 3000;
/** Player state report interval while sound is (or may soon be) audible. */
export const REPORT_ACTIVE_MS = 250;
export const REPORT_IDLE_MS = 1000;

export const MAX_LOOP_GAP_SEC = 600;

export function defaultLoop(clipLoop: boolean): LoopSetting {
  return { enabled: clipLoop, gapSec: 0 };
}

export function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
