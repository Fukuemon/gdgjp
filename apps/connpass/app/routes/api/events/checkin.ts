import { getBearerIdentity } from "@gdgjp/gdg-lib";
import type { ActionFunctionArgs } from "react-router";
import { accountsBaseUrl } from "~/features/auth/accounts-url.server";
import {
  canWriteAnyGroup,
  canWriteGroup,
  getAllowedLumaCalendar,
} from "~/features/auth/authorize.server";
import { checkInInBrowser } from "~/features/connpass/connpass-browser-read.server";
import { parseCheckinUrl } from "~/features/connpass/ui/checkin";
import { parseLumaCheckinUrl } from "~/features/luma/checkin-url";
import { checkInLumaGuest } from "~/features/luma/checkin.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const { env } = context.cloudflare;
  const identity = await getBearerIdentity(request, accountsBaseUrl(env));
  if (!identity) return Response.json({ error: "invalid_token" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const connpassCheckin = parseCheckinUrl(body?.url);
  const lumaCheckin = connpassCheckin ? null : parseLumaCheckinUrl(body?.url);

  let checkIn: () => Promise<"checked_in" | "failed" | "forbidden">;
  if (connpassCheckin) {
    checkIn = async () => {
      if (!(await canWriteAnyGroup(env.DB, identity))) return "forbidden";
      return (await checkInInBrowser(env, connpassCheckin.url)) ? "checked_in" : "failed";
    };
  } else if (lumaCheckin) {
    checkIn = () =>
      checkInLumaGuest(env, lumaCheckin, async (calendarApiId) => {
        const calendar = await getAllowedLumaCalendar(env.DB, calendarApiId);
        return calendar != null && canWriteGroup(identity, calendar);
      });
  } else {
    return Response.json({ error: "invalid_checkin_url" }, { status: 400 });
  }

  try {
    const result = await checkIn();
    if (result === "forbidden") return Response.json({ error: "forbidden" }, { status: 403 });
    return Response.json({ checkedIn: result === "checked_in" });
  } catch (error) {
    console.error(connpassCheckin ? "connpass_checkin_failed" : "luma_checkin_failed", error);
    return Response.json({ checkedIn: false });
  }
}
