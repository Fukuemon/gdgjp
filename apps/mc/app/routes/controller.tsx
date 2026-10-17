import { Tabs, TabsContent, TabsList, TabsTrigger } from "@gdgjp/design-system";
import { useLayoutEffect, useRef, useState } from "react";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { tracks } from "~/features/clips/catalog";
import { ClipCard } from "~/features/playback/components/ClipCard";
import { CommonShelf } from "~/features/playback/components/CommonShelf";
import { DiagnosticsSheet } from "~/features/playback/components/DiagnosticsSheet";
import { NowPlayingBar } from "~/features/playback/components/NowPlayingBar";
import { IssueStrip, StatusCluster } from "~/features/playback/components/StatusCluster";
import { ConfirmProvider, useConfirm } from "~/features/playback/components/confirm";
import { ControllerProvider } from "~/features/playback/components/controller-context";
import type { Route } from "./+types/controller";

export function meta() {
  return [{ title: "mc" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUserWithChapter(context.cloudflare.env, request);
  return null;
}

const TAB_KEY = "mc-tab";

export default function Controller() {
  return (
    <ConfirmProvider>
      <TrackChannels />
    </ConfirmProvider>
  );
}

function TrackChannels() {
  const confirm = useConfirm();
  const [tab, setTab] = useState(tracks[0]?.id ?? "");
  // Each tab remembers its own window scroll position.
  const scroll = useRef<Record<string, number>>({});

  useLayoutEffect(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      if (saved && tracks.some((t) => t.id === saved)) setTab(saved);
    } catch {
      // ignore
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: scroll.current[tab] ?? 0, behavior: "instant" });
  }, [tab]);

  // Switching tracks switches which streaming PC this screen controls.
  const changeTab = async (next: string) => {
    if (next === tab) return;
    const ok = await confirm({
      title: `トラック ${next} に切り替えますか？`,
      action: "切り替える",
    });
    if (!ok) return;
    scroll.current[tab] = window.scrollY;
    setTab(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {
      // ignore
    }
  };

  // The selected track is also the channel: track A's controller only ever
  // talks to track A's player. Re-keying drops the previous channel entirely.
  return (
    <Tabs
      value={tab}
      onValueChange={changeTab}
      // Arrow keys only move focus; switching (and its confirmation) needs Enter/click.
      activationMode="manual"
      className="mc-app"
    >
      <ControllerProvider key={tab} track={tab}>
        <ControllerScreen />
      </ControllerProvider>
    </Tabs>
  );
}
function ControllerScreen() {
  const [diagOpen, setDiagOpen] = useState(false);
  return (
    <>
      <header className="mc-header">
        <div className="mc-header-row">
          <TabsList className="mc-tabs" aria-label="トラック">
            {tracks.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="mc-tab">
                {t.id}
              </TabsTrigger>
            ))}
          </TabsList>
          <StatusCluster onOpenDiagnostics={() => setDiagOpen(true)} />
        </div>
        <IssueStrip />
        <CommonShelf />
      </header>
      <main className="mc-main">
        {tracks.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mc-list">
            {t.clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </TabsContent>
        ))}
      </main>
      <NowPlayingBar />
      <DiagnosticsSheet open={diagOpen} onOpenChange={setDiagOpen} />
    </>
  );
}
