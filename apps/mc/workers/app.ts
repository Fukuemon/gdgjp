import { createRequestHandler } from "react-router";
import { canUseController } from "../app/features/auth/auth-redirect.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
);

/** There is exactly one room: the app serves a single event's audio. */
const ROOM = "main";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const role = url.searchParams.get("role");
      if (role === "controller" && !(await canUseController(env, request))) {
        return new Response("unauthorized", { status: 401 });
      }
      if (role !== "controller" && role !== "player") {
        return new Response("bad role", { status: 400 });
      }
      return env.MC_ROOM.getByName(ROOM).fetch(request);
    }
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;

export { McRoom } from "./mc-room";
