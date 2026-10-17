import { toast } from "@gdgjp/design-system";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Clip } from "~/features/clips/catalog";
import { useCatalog } from "~/features/clips/catalog-context";
import type { CommandResult } from "../ack-tracker";
import { type ConfirmKind, type Intent, type Now, confirmCopy } from "../intent";
import type { FailureReason, LoopSetting, PlayerState } from "../protocol";
import {
  type PlayerView,
  type RoomView,
  positionAt,
  useControllerRoom,
} from "../use-controller-room";
import { type ConfirmCopy, useConfirm } from "./confirm";

/** Confirmations that are not playback commands. */
export function extraCopy(track: string) {
  return {
    resetPlayed: { title: "再生済みをリセットしますか？", action: "リセットする" },
    rotateToken: { title: "Player URL を再発行しますか？", action: "再発行する" },
    deleteClip: { title: "この音声を削除しますか？", action: "削除する", danger: true },
    // Asked right after rotateToken: the one action here that can silently
    // take a track off air until someone re-configures OBS.
    rotateTokenFinal: {
      title: "本当に Player URL を再発行しますか？",
      description: `配信PCの OBS に設定済みの Player URL (Track ${track}) は即座に無効になります。新しい URL を OBS に設定し直すまで、トラック ${track} の音声は配信されません。`,
      action: "再発行する",
      danger: true,
    },
  } satisfies Record<string, ConfirmCopy>;
}

type ExtraConfirm = keyof ReturnType<typeof extraCopy>;

export const failureText: Record<FailureReason, string> = {
  offline: "司会PCがオフラインです",
  "no-player": "配信PCが接続されていません",
  timeout: "配信PCから応答がありません",
  "autoplay-blocked": "配信PCで自動再生がブロックされています",
  "media-error": "配信PCで再生エラーが発生しました",
  "not-advancing": "配信PCで音声が進んでいません",
  "unknown-clip": "音声が見つかりません",
  invalid: "この操作はできません",
};

type Ctx = {
  /** The track whose channel (room) this controller is attached to. */
  track: string;
  room: RoomView;
  /** The clip the floating bar shows: the player's, or the last one we saw. */
  now: Now & { state: PlayerState | null };
  primaryRef: React.RefObject<PlayerView | null>;
  /** Live position of `clipId` if it is the player's current clip, else its cue. */
  positionOf: (clipId: string, now: number) => number;
  cues: Record<string, number>;
  setCue: (clipId: string, ms: number) => void;
  busy: Set<string>;
  run: (key: string, intent: Intent) => Promise<boolean>;
  confirmExtra: (kind: ExtraConfirm) => Promise<boolean>;
  setLoop: (clipId: string, setting: LoopSetting) => void;
  setPlayed: (clipId: string, value: boolean) => void;
  resetPlayed: () => void;
  rotateToken: () => void;
  loopOf: (clip: Clip) => LoopSetting;
};

const ControllerContext = createContext<Ctx | null>(null);

export function useController(): Ctx {
  const ctx = useContext(ControllerContext);
  if (!ctx) throw new Error("useController outside ControllerProvider");
  return ctx;
}

const CUE_KEY = "mc-cues";

function readCues(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CUE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Mount with `key={track}`: switching tracks must drop every piece of the
 * previous channel's state (socket, player view, last known clip).
 */
export function ControllerProvider({ track, children }: { track: string; children: ReactNode }) {
  const { room, send, setLoop, setPlayed, resetPlayed, rotateToken } = useControllerRoom(track);
  const [cues, setCues] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => setCues(readCues()), []);

  const { setUploaded } = useCatalog();
  useEffect(() => {
    if (room.uploaded) setUploaded(room.uploaded);
  }, [room.uploaded, setUploaded]);

  const primaryRef = useRef<PlayerView | null>(null);
  primaryRef.current = room.primary;
  // Keep the last known clip on screen even while the player is unreachable.
  const lastState = useRef<PlayerState | null>(null);
  if (room.primary?.state?.clipId) lastState.current = room.primary.state;
  const state = room.primary?.state ?? lastState.current;
  const now: Ctx["now"] = useMemo(
    () => ({
      clipId: state?.clipId ?? null,
      status: room.primary?.state ? room.primary.state.status : state ? "paused" : "idle",
      state,
    }),
    [state, room.primary?.state],
  );
  const nowRef = useRef(now);
  nowRef.current = now;
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const setCue = useCallback((clipId: string, ms: number) => {
    setCues((prev) => {
      const next = { ...prev, [clipId]: Math.round(ms) };
      try {
        localStorage.setItem(CUE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: cues just won't survive a reload
      }
      return next;
    });
  }, []);

  const ask = useConfirm();

  const run = useCallback(
    async (key: string, intent: Intent) => {
      if (intent.confirm && !(await ask(confirmCopy[intent.confirm as ConfirmKind]))) return false;
      setBusy((prev) => new Set(prev).add(key));
      let result: CommandResult;
      try {
        result = await send(intent.cmd);
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      if (!result.ok) {
        toast.error(failureText[result.reason], {
          description: result.detail,
          id: `fail-${result.reason}`,
        });
      }
      return result.ok;
    },
    [ask, send],
  );

  const positionOf = useCallback((clipId: string, t: number) => {
    const p = primaryRef.current;
    if (p?.state?.clipId === clipId) return positionAt(p, t);
    const n = nowRef.current;
    if (n.state?.clipId === clipId) return n.state.positionMs;
    return cuesRef.current[clipId] ?? 0;
  }, []);

  const loopOf = useCallback(
    (clip: Clip) => room.config.loops[clip.id] ?? { enabled: clip.loop, gapSec: 0 },
    [room.config.loops],
  );

  const value: Ctx = {
    track,
    room,
    now,
    primaryRef,
    positionOf,
    cues,
    setCue,
    busy,
    run,
    confirmExtra: (kind) => ask(extraCopy(track)[kind]),
    setLoop,
    setPlayed,
    resetPlayed,
    rotateToken,
    loopOf,
  };

  return <ControllerContext.Provider value={value}>{children}</ControllerContext.Provider>;
}
