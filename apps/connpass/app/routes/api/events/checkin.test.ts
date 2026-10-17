import { describe, expect, it, vi } from "vitest";

vi.mock("@gdgjp/gdg-lib", () => ({ getBearerIdentity: async () => ({ sub: "u" }) }));
vi.mock("~/features/auth/accounts-url.server", () => ({ accountsBaseUrl: () => "http://idp" }));
vi.mock("~/features/auth/authorize.server", () => ({
  canWriteAnyGroup: async () => true,
  canWriteGroup: () => true,
  getAllowedLumaCalendar: async () => null,
}));
const fast = vi.fn();
vi.mock("~/features/connpass/checkin-fetch.server", () => ({ checkInWithFetch: () => fast() }));
vi.mock("~/features/connpass/connpass-browser-read.server", () => ({ checkInInBrowser: vi.fn() }));

import { action } from "./checkin";

const promo = new Map([["Nisss78", "AIHACKATHON"]]);
const env = { PROMO_USERS_KV: { get: async (k: string) => promo.get(k) ?? null } };

async function call(): Promise<{ checkedIn: boolean; promoCode: string | null }> {
  const request = new Request("http://x/api/checkin", {
    method: "POST",
    body: JSON.stringify({ url: "https://connpass.com/event/1/qr_checkin/2/3/" }),
  });
  const res = await action({ request, context: { cloudflare: { env } } } as never);
  return (await (res as Response).json()) as Awaited<ReturnType<typeof call>>;
}

describe("checkin promoCode", () => {
  it("returns the promo code for a registered user", async () => {
    fast.mockResolvedValue({ checkedIn: true, userId: "Nisss78", reason: null });
    expect(await call()).toMatchObject({ checkedIn: true, promoCode: "AIHACKATHON" });
  });
  it("returns null for an unregistered user", async () => {
    fast.mockResolvedValue({ checkedIn: true, userId: "nobody", reason: null });
    expect((await call()).promoCode).toBeNull();
  });
  it("returns null when not checked in", async () => {
    fast.mockResolvedValue({ checkedIn: false, userId: "Nisss78", reason: "already_checked_in" });
    expect((await call()).promoCode).toBeNull();
  });
});
