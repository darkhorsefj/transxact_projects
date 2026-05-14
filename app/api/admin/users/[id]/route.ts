import { NextRequest, NextResponse } from "next/server";
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
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
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
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized")
      ? 401
      : message.includes("Forbidden")
        ? 403
        : message.includes("cannot change your own role")
          ? 400
          : message.includes("not found")
            ? 404
            : 500;
    return NextResponse.json({ error: message }, { status });
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
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized")
      ? 401
      : message.includes("Forbidden")
        ? 403
        : message.includes("cannot delete your own account")
          ? 400
          : message.includes("not found")
            ? 404
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
