import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { revokeSession } from "@/services/sessions.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
    }

    await revokeSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
