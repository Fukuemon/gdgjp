import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth, canUseQrScanner } from "@/auth";

export const withAuth = async (req: NextRequest, endpointId: string ,handler: (req: NextRequest, session: Session) => Promise<Response>) => {
    const session = await auth();
    if (!session?.accessToken) return NextResponse.json({ error: "認証が必要です。ログインし直してください。" }, { status: 401 });
    if (!canUseQrScanner(session.user.chapters)) return NextResponse.json({ error: "このチャプターのメンバーのみ利用できます。" }, { status: 403 });

    try {
        return await handler(req, session);
    } catch (error) {
        console.error(`[${endpointId}] Proxy Error: ${req.method} ${req.nextUrl.pathname}`, error);
        return NextResponse.json({ error: "サーバー間リクエストでエラーが発生しました" }, { status: 500 });
    }
};