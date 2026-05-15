import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { processPendingEmailQueueWithWorker } from "@/services/email-queue.service";
import { getSessionUserOrNull } from "@/services/session.service";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const currentUser = await getSessionUserOrNull();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processPendingEmailQueueWithWorker();
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
