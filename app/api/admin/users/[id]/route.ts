import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { getAdminUserIdFromRequest } from "@/services/auth-request.service";
import {
  getUserById,
  updateUserRole,
  updateUserStatus,
  deleteUser,
} from "@/services/user-management.service";
import type { UserRole, UserStatus } from "@/db/schema";

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

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(targetUser, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminUserId = await getAdminUserIdFromRequest(request);
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const body = await request.json();

    let updatedUser;

    if (body.role) {
      updatedUser = await updateUserRole(adminUserId, userId, body.role as UserRole);
    } else if (body.status) {
      updatedUser = await updateUserStatus(adminUserId, userId, body.status as UserStatus);
    } else {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    return NextResponse.json(updatedUser, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminUserId = await getAdminUserIdFromRequest(request);
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    await deleteUser(adminUserId, userId);

    return NextResponse.json({ message: "User deleted successfully" }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
