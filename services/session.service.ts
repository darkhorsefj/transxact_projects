import crypto from "node:crypto";
import db, { ensureDbSchema } from "@/db/connection";
import { type UserRole, type UserStatus, user, userSession } from "@/db/schema";
import { getCookie } from "./cookies.service";
import { verifyJWT } from "./jwt.service";
import { and, eq, gt } from "drizzle-orm";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

export interface SessionUser {
  id: number;
  name: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
}

async function getSessionUserByToken(token: string): Promise<SessionUser> {
  await ensureDbSchema();

  const payload = verifyJWT(token);

  // Validate session exists and is active
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();
  const session = await db
    .select({ id: userSession.id })
    .from(userSession)
    .where(
      and(
        eq(userSession.token, tokenHash),
        eq(userSession.isActive, 1),
        gt(userSession.expiresAt, nowIso),
      ),
    )
    .limit(1);

  if (session.length === 0) {
    throw new Error("Session expired. Please sign in again.");
  }

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, payload.userId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("You must be signed in to continue.");
  }

  return rows[0];
}

export async function requireSessionUser(): Promise<SessionUser> {
  const authToken = await getCookie(AUTH_COOKIE_NAME);
  if (!authToken) {
    throw new Error("You must be signed in to continue.");
  }

  const currentUser = await getSessionUserByToken(authToken);
  if (currentUser.status !== "active") {
    throw new Error("You must be signed in to continue.");
  }

  return currentUser;
}

export async function requireAdminUser(): Promise<SessionUser> {
  const currentUser = await requireSessionUser();
  if (currentUser.role !== "admin") {
    throw new Error("Admin access is required.");
  }

  return currentUser;
}

export async function getSessionUserOrNull(): Promise<SessionUser | null> {
  const authToken = await getCookie(AUTH_COOKIE_NAME);
  if (!authToken) {
    return null;
  }

  try {
    const currentUser = await getSessionUserByToken(authToken);
    if (currentUser.status !== "active") {
      return null;
    }

    return currentUser;
  } catch {
    return null;
  }
}
