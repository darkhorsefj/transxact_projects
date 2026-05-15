import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { listRecentNotifications } from "@/services/notification.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const resolvedLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), 20)
        : 8;
    const notifications = await listRecentNotifications(resolvedLimit);
    return NextResponse.json({ notifications });
  } catch (error) {
    return apiError(error);
  }
}
