import { Icons } from "@gdgjp/design-system";
import { useEffect, useRef } from "react";
import { commonClips } from "~/features/clips/catalog";
import { onFrame } from "~/lib/frame";
import { primaryIntent, showsPause } from "../intent";
import { useController } from "./controller-context";

/** Standby clips, reachable from every tab. Progress fills the chip itself. */
export function CommonShelf() {
  return (
    <div className="mc-shelf">
      {commonClips.map((clip) => (
        <ShelfChip key={clip.id} clipId={clip.id} label={clip.title} durationMs={clip.durationMs} />
      ))}
    </div>
  );
}

function ShelfChip({
  clipId,
  label,
  durationMs,
}: { clipId: string; label: string; durationMs: number }) {
  const { now, run, busy, positionOf } = useController();
  const ref = useRef<HTMLButtonElement>(null);
  const current = now.clipId === clipId;
  const pause = showsPause(clipId, now);
  const key = `${clipId}:primary`;

  useEffect(() => {
    if (!current) {
      ref.current?.style.setProperty("--p", "0");
      return;
    }
    return onFrame((t) => {
      const p = durationMs > 0 ? Math.min(1, positionOf(clipId, t) / durationMs) : 0;
      ref.current?.style.setProperty("--p", p.toFixed(4));
    });
  }, [current, clipId, durationMs, positionOf]);

  return (
    <button
      ref={ref}
      type="button"
      className="mc-chip"
      data-current={current || undefined}
      aria-busy={busy.has(key) || undefined}
      onClick={() => run(key, primaryIntent(clipId, 0, now))}
    >
      <span className="mc-chip-fill" aria-hidden="true" />
      {pause ? (
        <Icons name="Pause" size={18} aria-hidden="true" />
      ) : (
        <Icons name="Play" size={18} aria-hidden="true" />
      )}
      <span className="mc-chip-label">{label}</span>
    </button>
  );
}
