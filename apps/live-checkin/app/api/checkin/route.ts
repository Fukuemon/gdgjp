// app/api/checkin/route.ts
import { withAuth } from "@/lib/middleware/auth";
import { type NextRequest, NextResponse } from "next/server";

const POST = async (req: NextRequest) =>
  withAuth(req, "checkin", async (req, session) => {
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

    const data: CheckInResponse = await connpassRes.json();

    if (!connpassRes.ok) {
      return NextResponse.json(data, { status: connpassRes.status });
    }

    return NextResponse.json(data);
  });

export { POST };
