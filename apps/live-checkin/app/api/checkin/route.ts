// app/api/checkin/route.ts
import { auth, canUseQrScanner } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // サーバー側でセッションと accessToken を取得
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "認証が必要です。ログインし直してください。" },
      { status: 401 },
    );
  }

  // gdg-kwansai に所属していないユーザーは利用不可（サーバー側でも必ず検証）
  if (!canUseQrScanner(session.user.chapters)) {
    return NextResponse.json(
      { error: "このチャプターのメンバーのみ利用できます。" },
      { status: 403 },
    );
  }

  try {
    const { url } = await req.json();

    // サーバー間通信で connpass API を叩く (CORSが発生しない)
    const connpassRes = await fetch("https://connpass.gdgs.jp/api/checkin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        url: url,
      }),
    });

    const data = await connpassRes.json().catch(() => null);

    if (!connpassRes.ok) {
      return NextResponse.json(
        { ...(data ?? {}), error: data?.error ?? "upstream_error", upstream: true },
        { status: connpassRes.status },
      );
    }

    if (!data || typeof data.checkedIn !== "boolean") {
      return NextResponse.json(
        { error: "invalid_upstream_response", upstream: true },
        { status: 502 },
      );
    }

    return NextResponse.json(data as CheckInResponse);
  } catch (error) {
    console.error("Check-in Proxy Error:", error);
    return NextResponse.json(
      { error: "サーバー間リクエストでエラーが発生しました" },
      { status: 500 },
    );
  }
}
