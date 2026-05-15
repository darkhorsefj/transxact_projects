import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { listSessions } from "@/services/sessions.service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return apiError(error);
  }
}
