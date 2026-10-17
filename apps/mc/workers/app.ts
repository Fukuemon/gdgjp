import { createRequestHandler } from "react-router";
import { canUseController } from "../app/features/auth/auth-redirect.server";
import { isTrack } from "../app/features/clips/catalog";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
);

/** One room per track: track A's controller and player only ever meet each other. */
function roomName(track: string): string {
  return `track:${track}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const role = url.searchParams.get("role");
      const track = url.searchParams.get("track");
      if (!isTrack(track)) return new Response("bad track", { status: 400 });
      if (role === "controller" && !(await canUseController(env, request))) {
        return new Response("unauthorized", { status: 401 });
      }
      if (role !== "controller" && role !== "player") {
        return new Response("bad role", { status: 400 });
      }
      return env.MC_ROOM.getByName(roomName(track)).fetch(request);
    }
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;

export { McRoom } from "./mc-room";
