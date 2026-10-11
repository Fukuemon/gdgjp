import { getBearerIdentity } from "@gdgjp/gdg-lib";
import type { LoaderFunctionArgs } from "react-router";
import { accountsBaseUrl } from "~/features/auth/accounts-url.server";
import { requireAdmin } from "~/features/auth/authorize.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare;
  const identity = await getBearerIdentity(request, accountsBaseUrl(env));
  if (!identity) return Response.json({ error: "invalid_token" }, { status: 401 });
  if (!requireAdmin(identity)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  type CalendarRow = { calendarId: string; chapterId: string | null; enabled: number };
  const { results } = await env.DB.prepare(
    `SELECT calendar_api_id AS calendarId, chapter_id AS chapterId, enabled
     FROM luma_calendars ORDER BY calendar_api_id ASC`,
  ).all();
  const calendars = ((results ?? []) as CalendarRow[]).map((row) => ({
    calendarId: row.calendarId,
    chapterId: row.chapterId,
    enabled: row.enabled === 1,
  }));

  return Response.json({ calendars });
}
