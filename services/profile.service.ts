"use server";

import db, { ensureDbSchema } from "@/db/connection";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSessionUser } from "./session.service";

export type ProfileUser = {
  id: number;
  name: string | null;
  email: string;
  role: "admin" | "member";
  status: "active" | "inactive" | "pending";
  lastLoginAt: string | null;
  createdAt: string;
};

export async function getProfile(): Promise<ProfileUser> {
  await ensureDbSchema();

  const session = await requireSessionUser();

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, session.id))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("User not found");
  }

  return rows[0];
}

export async function updateProfileName(name: string): Promise<ProfileUser> {
  await ensureDbSchema();

  const session = await requireSessionUser();

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }

  if (trimmed.length > 100) {
    throw new Error("Name must be 100 characters or less");
  }

  const now = new Date().toISOString();
  await db
    .update(user)
    .set({ name: trimmed, updatedAt: now })
    .where(eq(user.id, session.id));

  const updated = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, session.id))
    .limit(1);

  if (updated.length === 0) {
    throw new Error("Failed to fetch updated profile");
  }

  return updated[0];
}
