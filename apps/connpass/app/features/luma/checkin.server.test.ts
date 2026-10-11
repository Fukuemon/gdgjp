import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkInLumaGuest } from "./checkin.server";

const CHECKIN = { eventApiId: "evt-abc", proxyKey: "g-def" };
const SESSION_KEY = "luma:bot:sessionKey";

function makeEnv(kv = new Map<string, string>()): Env {
  return {
    SESSION_KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => {
        kv.set(k, v);
      },
    },
    LUMA_BOT_EMAIL: "bot@example.com",
    LUMA_BOT_PASSWORD: "secret",
  } as unknown as Env;
}

type Route = (url: URL, init: RequestInit) => Response | undefined;

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

const guest = (overrides: Record<string, unknown> = {}) => ({
  api_id: "gst-1",
  approval_status: "approved",
  last_checked_in_at: null,
  ...overrides,
});

let calls: { path: string; cookie: string | null; body: unknown }[];

function stubLuma(route: Route) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const cookie = new Headers(init.headers).get("cookie");
      calls.push({
        path: url.pathname,
        cookie,
        body: init.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams),
      });
      return route(url, init) ?? json({ message: "unexpected" }, 500);
    }),
  );
}

const happyPath: Route = (url) => {
  switch (url.pathname) {
    case "/auth/sign-in-with-password":
      return json({ signed_in: true }, 200, {
        "set-cookie": "luma.auth-session-key=usr-1.fresh; Path=/; HttpOnly",
      });
    case "/event/admin/get":
      return json({ event: { calendar_api_id: "cal-1" } });
    case "/event/admin/get-guest":
      return json({ guest: guest() });
    case "/event/admin/update-check-in":
      return json({ guest: guest({ last_checked_in_at: "2026-10-11T13:58:15.189Z" }) });
  }
};

beforeEach(() => stubLuma(happyPath));
afterEach(() => vi.unstubAllGlobals());

describe("checkInLumaGuest", () => {
  it("signs in, authorizes the event calendar, and checks the guest in by proxy key", async () => {
    const kv = new Map<string, string>();
    const authorize = vi.fn(async () => true);
    await expect(checkInLumaGuest(makeEnv(kv), CHECKIN, authorize)).resolves.toBe("checked_in");

    expect(authorize).toHaveBeenCalledWith("cal-1");
    expect(kv.get(SESSION_KEY)).toBe("usr-1.fresh");
    expect(kv.get("luma:event-calendar:evt-abc")).toBe("cal-1");
    expect(calls.map((c) => c.path)).toEqual([
      "/auth/sign-in-with-password",
      "/event/admin/get",
      "/event/admin/get-guest",
      "/event/admin/update-check-in",
    ]);
    expect(calls[0]?.body).toEqual({ email: "bot@example.com", password: "secret" });
    expect(calls[2]).toMatchObject({
      cookie: "luma.auth-session-key=usr-1.fresh",
      body: { event_api_id: "evt-abc", proxy_key: "g-def" },
    });
    expect(calls[3]?.body).toEqual({
      event_api_id: "evt-abc",
      check_in_method: "scanner",
      check_in_status: "checked-in",
      type: "guest",
      rsvp_api_id: "gst-1",
    });
  });

  it("reuses the stored session and cached calendar", async () => {
    const kv = new Map([
      [SESSION_KEY, "usr-1.stored"],
      ["luma:event-calendar:evt-abc", "cal-1"],
    ]);
    await expect(checkInLumaGuest(makeEnv(kv), CHECKIN, async () => true)).resolves.toBe(
      "checked_in",
    );
    expect(calls.map((c) => c.path)).toEqual([
      "/event/admin/get-guest",
      "/event/admin/update-check-in",
    ]);
    expect(calls[0]?.cookie).toBe("luma.auth-session-key=usr-1.stored");
  });

  it("signs in again once when the stored session has expired", async () => {
    const kv = new Map([[SESSION_KEY, "usr-1.stale"]]);
    stubLuma((url, init) => {
      const cookie = new Headers(init.headers).get("cookie") ?? "";
      if (url.pathname.startsWith("/event/") && cookie.includes("stale")) {
        return json({ message: "You are not signed in." }, 401);
      }
      return happyPath(url, init);
    });
    await expect(checkInLumaGuest(makeEnv(kv), CHECKIN, async () => true)).resolves.toBe(
      "checked_in",
    );
    expect(kv.get(SESSION_KEY)).toBe("usr-1.fresh");
    expect(calls.filter((c) => c.path === "/auth/sign-in-with-password")).toHaveLength(1);
  });

  it("is forbidden before touching the guest when the calendar is not authorized", async () => {
    await expect(checkInLumaGuest(makeEnv(), CHECKIN, async () => false)).resolves.toBe(
      "forbidden",
    );
    expect(calls.map((c) => c.path)).not.toContain("/event/admin/get-guest");
  });

  it("is forbidden when the bot cannot manage the event", async () => {
    stubLuma((url, init) =>
      url.pathname === "/event/admin/get" ? json({}, 403) : happyPath(url, init),
    );
    await expect(checkInLumaGuest(makeEnv(), CHECKIN, async () => true)).resolves.toBe("forbidden");
  });

  it("fails for an unknown ticket or an unapproved guest without checking in", async () => {
    stubLuma((url, init) =>
      url.pathname === "/event/admin/get-guest" ? json({}, 404) : happyPath(url, init),
    );
    await expect(checkInLumaGuest(makeEnv(), CHECKIN, async () => true)).resolves.toBe("failed");

    stubLuma((url, init) =>
      url.pathname === "/event/admin/get-guest"
        ? json({ guest: guest({ approval_status: "pending_approval" }) })
        : happyPath(url, init),
    );
    await expect(checkInLumaGuest(makeEnv(), CHECKIN, async () => true)).resolves.toBe("failed");
    expect(calls.map((c) => c.path)).not.toContain("/event/admin/update-check-in");
  });

  it("reports a sign-in that needs a second factor", async () => {
    stubLuma((url, init) =>
      url.pathname === "/auth/sign-in-with-password"
        ? json({ signed_in: false, step: "two_factor" })
        : happyPath(url, init),
    );
    await expect(checkInLumaGuest(makeEnv(), CHECKIN, async () => true)).rejects.toThrow(
      "luma_login_needs_two_factor",
    );
  });
});
