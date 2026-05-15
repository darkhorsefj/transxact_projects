import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { getUnreadInboxCounts } from "@/services/notification.service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const counts = await getUnreadInboxCounts();
    return NextResponse.json(counts);
  } catch (error) {
    return apiError(error);
  }
}
