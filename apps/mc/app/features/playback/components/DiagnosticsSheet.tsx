import {
  Button,
  IconButton,
  Icons,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  toast,
} from "@gdgjp/design-system";
import { describeLog, issueText, issuesOf } from "../diagnostics";
import type { PlayerView } from "../use-controller-room";
import { useController } from "./controller-context";

export function DiagnosticsSheet({
  open,
  onOpenChange,
}: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { track, room, confirmExtra, rotateToken, resetPlayed } = useController();
  const playerUrl =
    room.token && typeof window !== "undefined"
      ? `${window.location.origin}/play?track=${track}&t=${room.token}`
      : "";
  const issues = issuesOf(room);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(playerUrl);
      toast.success("コピーしました", { id: "copied" });
    } catch {
      toast.error("コピーできませんでした", { id: "copy-failed" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="mc-diag">
        <SheetTitle className="mc-diag-title">
          <Icons name="Activity" size={18} aria-hidden="true" />
          <span className="sr-only">診断</span>
        </SheetTitle>
        <SheetDescription className="sr-only">接続と配信PCの状態</SheetDescription>

        <section className="mc-diag-section">
          <h3 className="mc-diag-heading">
            <Icons name="Link" size={18} aria-hidden="true" /> Player URL (Track {track})
          </h3>
          <div className="mc-diag-url">
            <Input
              readOnly
              value={playerUrl}
              aria-label={`Player URL (Track ${track})`}
              data-testid="player-url"
            />
            <IconButton
              aria-label="コピー"
              variant="secondary"
              onClick={copy}
              disabled={!playerUrl}
            >
              <Icons name="Copy" size={18} aria-hidden="true" />
            </IconButton>
            <IconButton
              aria-label="再発行"
              variant="ghost"
              disabled={!playerUrl}
              onClick={async () => {
                if (
                  (await confirmExtra("rotateToken")) &&
                  (await confirmExtra("rotateTokenFinal"))
                ) {
                  rotateToken();
                }
              }}
            >
              <Icons name="RotateCw" size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </section>

        {issues.length > 0 && (
          <section className="mc-diag-section">
            <ul className="mc-diag-issues">
              {issues.map((issue) => (
                <li key={issue}>
                  <Icons name="AlertTriangle" size={18} aria-hidden="true" />
                  {issueText[issue]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mc-diag-section">
          <div className="mc-diag-row">
            {room.socket === "open" ? (
              <Icons name="Wifi" size={18} aria-hidden="true" />
            ) : (
              <Icons name="WifiLow" size={18} aria-hidden="true" />
            )}
            <span>司会PC</span>
            <span className="mc-diag-value" data-bad={room.socket !== "open" || undefined}>
              {room.socket}
              {room.socket === "open" && room.rtt !== null && ` · ${room.rtt}ms`}
            </span>
          </div>
          {room.players.length === 0 && (
            <div className="mc-diag-row">
              <Icons name="Radio" size={18} aria-hidden="true" />
              <span>配信PC</span>
              <span className="mc-diag-value" data-bad>
                —
              </span>
            </div>
          )}
          {room.players.map((p) => (
            <PlayerDetails key={p.connId} player={p} />
          ))}
        </section>

        <section className="mc-diag-section">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await confirmExtra("resetPlayed")) resetPlayed();
            }}
          >
            <Icons name="RotateCcw" size={18} aria-hidden="true" />
            再生済みをリセット
          </Button>
        </section>

        <section className="mc-diag-section mc-diag-log">
          <ol>
            {[...room.log].reverse().map((entry) => (
              <li key={`${entry.at}-${entry.code}-${entry.detail ?? ""}`} data-level={entry.level}>
                <time>{new Date(entry.at).toLocaleTimeString("ja-JP", { hour12: false })}</time>
                {entry.level === "error" ? (
                  <Icons name="AlertCircle" size={18} aria-hidden="true" />
                ) : entry.level === "warn" ? (
                  <Icons name="AlertTriangle" size={18} aria-hidden="true" />
                ) : (
                  <Icons name="Activity" size={18} aria-hidden="true" />
                )}
                <span>{describeLog(entry)}</span>
                {entry.detail && <span className="mc-diag-detail">{entry.detail}</span>}
              </li>
            ))}
          </ol>
        </section>
      </SheetContent>
    </Sheet>
  );
}

function PlayerDetails({ player }: { player: PlayerView }) {
  const d = player.state?.diag;
  const ago = Math.max(0, Math.round((performance.now() - player.receivedAt) / 100) / 10);
  return (
    <div className="mc-diag-player" data-alive={player.alive || undefined}>
      <div className="mc-diag-row">
        <Icons name="Radio" size={18} aria-hidden="true" />
        <span>配信PC {player.connId}</span>
        <span className="mc-diag-value" data-bad={!player.alive || undefined}>
          {player.alive ? (
            <Icons name="CircleCheck" size={18} aria-hidden="true" />
          ) : (
            <Icons name="AlertCircle" size={18} aria-hidden="true" />
          )}
          {ago}s
        </span>
      </div>
      {d && (
        <dl className="mc-diag-grid">
          <dt>preload</dt>
          <dd data-bad={d.preload.failed.length > 0 || undefined}>
            {d.preload.loaded}/{d.preload.total}
            {d.preload.failed.length > 0 && ` ✕ ${d.preload.failed.join(", ")}`}
          </dd>
          <dt>autoplay</dt>
          <dd data-bad={d.autoplay === "blocked" || undefined}>{d.autoplay}</dd>
          <dt>volume</dt>
          <dd data-bad={d.muted || d.volume === 0 || undefined}>
            {d.muted ? "muted" : `${Math.round(d.volume * 100)}%`}
          </dd>
          <dt>visibility</dt>
          <dd data-bad={d.visibility === "hidden" || undefined}>{d.visibility}</dd>
          <dt>clock</dt>
          <dd data-bad={d.stalled || undefined}>{d.stalled ? "stalled" : "ok"}</dd>
          <dt>status</dt>
          <dd>
            {player.state?.status}
            {player.state?.clipId && ` · ${player.state.clipId}`}
          </dd>
          {d.lastError && (
            <>
              <dt>error</dt>
              <dd data-bad>{d.lastError}</dd>
            </>
          )}
          <dt>UA</dt>
          <dd className="mc-diag-ua">{d.userAgent}</dd>
        </dl>
      )}
    </div>
  );
}
