import { NextResponse } from "next/server";
import { processPendingEmailQueueWithWorker } from "@/services/notification.service";
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
    const message =
      error instanceof Error ? error.message : "Unable to process email queue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
