import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { getAdminUserIdFromRequest } from "@/services/auth-request.service";
import { listUsers } from "@/services/user-management.service";
import { createInvite } from "@/services/invite.service";
import type { UserRole, UserStatus } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    await getAdminUserIdFromRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 20;
    const search = searchParams.get("search") || undefined;
    const role = (searchParams.get("role") as UserRole | null) || undefined;
    const status = (searchParams.get("status") as UserStatus | null) || undefined;

    const result = await listUsers({
      page,
      limit,
      search,
      role,
      status,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUserId = await getAdminUserIdFromRequest(request);
    const body = await request.json();

    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 },
      );
    }

    const result = await createInvite({
      email,
      role: role as UserRole,
      invitedByUserId: adminUserId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
