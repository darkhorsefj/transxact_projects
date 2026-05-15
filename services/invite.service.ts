"use server";

import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import { auditLog, invite, type UserRole, type AuditLogAction, user } from "@/db/schema";
import { createUnifiedEmailContent, sendEmail } from "./email.service";
import { normalizeEmail } from "@/lib/utils";

const INVITE_EXPIRY_HOURS = 72;

interface CreateInviteInput {
  email: string;
  invitedByUserId: number;
  role?: UserRole;
}

interface AcceptInviteInput {
  token: string;
  name: string;
}

function inviteLink(token: string): string {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error("APP_BASE_URL environment variable is not set");
  }

  return `${baseUrl.replace(/\/$/, "")}/auth/register?token=${encodeURIComponent(token)}`;
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<{ email: string; expiresAt: string }> {
  await ensureDbSchema();

  const email = normalizeEmail(input.email);
  const role: UserRole = input.role ?? "member";
  if (!email) {
    throw new Error("Invite email is required");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const token = crypto.randomBytes(32).toString("hex");

  await db
    .update(invite)
    .set({
      revokedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(invite.email, email),
        isNull(invite.acceptedAt),
        isNull(invite.revokedAt),
      ),
    );

  const existingUser = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingUser.length === 0) {
    await db.insert(user).values({
      name: null,
      email,
      role,
      status: "pending",
      invitedByUserId: input.invitedByUserId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    await db
      .update(user)
      .set({
        role,
        status: "pending",
        invitedByUserId: input.invitedByUserId,
        updatedAt: nowIso,
      })
      .where(eq(user.id, existingUser[0].id));
  }

  await db.insert(invite).values({
    email,
    role,
    invitedByUserId: input.invitedByUserId,
    token,
    expiresAt,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Audit log
  const invitedUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (invitedUser[0]) {
    await db.insert(auditLog).values({
      adminUserId: input.invitedByUserId,
      targetUserId: invitedUser[0].id,
      action: "invited" as AuditLogAction,
      metadata: JSON.stringify({ invitedEmail: email }),
      createdAt: nowIso,
    });
  }

  const link = inviteLink(token);
  const content = createUnifiedEmailContent({
    headline: "You're invited to Transxact",
    messageLines: [
      "An admin has invited you to join the workspace.",
      "Click the button below to complete your registration and get started.",
      `This invite expires in ${INVITE_EXPIRY_HOURS} hours.`,
    ],
    actionLabel: "Complete registration",
    actionUrl: link,
    footerLines: ["If you were not expecting this invite, you can safely ignore this email."],
    previewText: "Complete your registration to join Transxact Projects",
  });

  await sendEmail({
    to: email,
    subject: "You've been invited to Transxact Projects",
    text: content.text,
    html: content.html,
  });

  return {
    email,
    expiresAt,
  };
}

export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<{ email: string; role: UserRole }> {
  await ensureDbSchema();

  const token = input.token.trim();
  const name = input.name.trim();

  if (!token) {
    throw new Error("Invite token is required");
  }

  if (!name) {
    throw new Error("Name is required");
  }

  const inviteRows = await db
    .select()
    .from(invite)
    .where(
      and(
        eq(invite.token, token),
        isNull(invite.acceptedAt),
        isNull(invite.revokedAt),
      ),
    )
    .limit(1);

  if (inviteRows.length === 0) {
    throw new Error("Invite token is invalid or no longer active");
  }

  const currentInvite = inviteRows[0];
  if (Number(new Date(currentInvite.expiresAt)) < Date.now()) {
    throw new Error("Invite has expired. Ask an admin to resend it.");
  }

  const nowIso = new Date().toISOString();
  const existingUser = await db
    .select()
    .from(user)
    .where(eq(user.email, currentInvite.email))
    .limit(1);

  if (existingUser.length === 0) {
    await db.insert(user).values({
      name,
      email: currentInvite.email,
      role: currentInvite.role,
      status: "active",
      invitedByUserId: currentInvite.invitedByUserId,
      invitationAcceptedAt: nowIso,
      firstLoginCompletedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    await db
      .update(user)
      .set({
        name,
        role: currentInvite.role,
        status: "active",
        invitationAcceptedAt: nowIso,
        firstLoginCompletedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(user.id, existingUser[0].id));
  }

  await db
    .update(invite)
    .set({
      acceptedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(invite.id, currentInvite.id));

  return {
    email: currentInvite.email,
    role: currentInvite.role,
  };
}
