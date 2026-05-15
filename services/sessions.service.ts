"use server";

import { desc, eq, and } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import { userSession } from "@/db/schema";
import { requireSessionUser } from "./session.service";

export interface SessionItem {
  id: number;
  deviceLabel: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isActive: number;
}

export async function listSessions(): Promise<SessionItem[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  return db
    .select({
      id: userSession.id,
      deviceLabel: userSession.deviceLabel,
      ipAddress: userSession.ipAddress,
      createdAt: userSession.createdAt,
      lastUsedAt: userSession.lastUsedAt,
      expiresAt: userSession.expiresAt,
      isActive: userSession.isActive,
    })
    .from(userSession)
    .where(eq(userSession.userId, currentUser.id))
    .orderBy(desc(userSession.lastUsedAt))
    .limit(50);
}

export async function revokeSession(sessionId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({ id: userSession.id })
    .from(userSession)
    .where(
      and(eq(userSession.id, sessionId), eq(userSession.userId, currentUser.id)),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Session not found.");
  }

  await db
    .update(userSession)
    .set({ isActive: 0 })
    .where(eq(userSession.id, sessionId));
}
