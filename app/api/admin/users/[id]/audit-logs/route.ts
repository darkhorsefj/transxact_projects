import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { getAdminUserIdFromRequest } from "@/services/auth-request.service";
import { getAuditLogs } from "@/services/user-management.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getAdminUserIdFromRequest(request);
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 20;

    const result = await getAuditLogs(userId, { page, limit });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
