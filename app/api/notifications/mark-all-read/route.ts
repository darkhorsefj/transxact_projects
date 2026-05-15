import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { markAllNotificationsAsRead } from "@/services/notification.service";

export async function POST(): Promise<Response> {
  try {
    const markedCount = await markAllNotificationsAsRead();
    return NextResponse.json({ ok: true, markedCount });
  } catch (error) {
    return apiError(error);
  }
}
