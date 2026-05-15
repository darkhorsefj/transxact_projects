import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { getAdminUserIdFromRequest } from "@/services/auth-request.service";
import { exportUsersToCSV } from "@/services/user-management.service";
import type { UserRole, UserStatus } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    await getAdminUserIdFromRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const role = (searchParams.get("role") as UserRole | null) || undefined;
    const status = (searchParams.get("status") as UserStatus | null) || undefined;

    const csv = await exportUsersToCSV({
      search,
      role,
      status,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="users-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
