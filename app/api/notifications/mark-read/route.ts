import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { markNotificationAsRead } from "@/services/notification.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as { notificationId?: number };
    const notificationId = Number(payload.notificationId);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return NextResponse.json(
        { error: "notificationId must be a positive integer." },
        { status: 400 },
      );
    }

    await markNotificationAsRead(notificationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
