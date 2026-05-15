import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { createRealtimeStream } from "@/services/realtime.service";
import { getSessionUserOrNull } from "@/services/session.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const currentUser = await getSessionUserOrNull();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stream = createRealtimeStream(currentUser.id, request.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
