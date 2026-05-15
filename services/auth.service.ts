"use server";

import { createUnifiedEmailContent, sendEmail } from "./email.service";
import db, { ensureDbSchema } from "@/db/connection";
import { type UserRole, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setCookie, deleteCookie } from "./cookies.service";
import { generateJWT } from "./jwt.service";

const AUTH_COOKIE_NAME = "transxact_project_auth_token";
const LOGIN_CODE_TTL_MINUTES = 10;
const LOGIN_CODE_COOLDOWN_SECONDS = 60;
const LOGIN_CODE_MAX_ATTEMPTS = 5;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateLoginCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function parseISOString(isoString: string): number {
  return Number(new Date(isoString));
}

async function sendLoginCode(email: string, code: string): Promise<void> {
  const content = createUnifiedEmailContent({
    headline: "Your login code",
    messageLines: [
      "Use the code below to sign in to your account.",
      "This code expires in 10 minutes.",
      "If you did not request this code, you can safely ignore this email.",
    ],
    codeBlock: code,
    previewText: "Enter your login code to sign in to Transxact Projects",
  });

  await sendEmail({
    to: email,
    subject: "Your Transxact Login Code",
    text: content.text,
    html: content.html,
  });
}

export async function requestLoginCode(
  email: string,
): Promise<{ expiresAt: string; cooldownSeconds: number }> {
  await ensureDbSchema();

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const existingUser = await db
    .select()
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (existingUser.length === 0) {
    throw new Error("No account exists for this email. Ask an admin for an invite.");
  }

  const currentUser = existingUser[0];
  if (currentUser.status === "inactive") {
    throw new Error("This account is inactive. Contact an admin.");
  }

  const now = Date.now();
  if (currentUser.codeLastRequestedAt) {
    const elapsedSeconds =
      (now - parseISOString(currentUser.codeLastRequestedAt)) / 1000;
    if (elapsedSeconds < LOGIN_CODE_COOLDOWN_SECONDS) {
      throw new Error(
        `Please wait ${Math.ceil(LOGIN_CODE_COOLDOWN_SECONDS - elapsedSeconds)} seconds before requesting another code.`,
      );
    }
  }

  const code = generateLoginCode();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(
    now + LOGIN_CODE_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await db
    .update(user)
    .set({
      code,
      codeExpiresAt: expiresAt,
      codeAttemptCount: 0,
      codeLastRequestedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(user.id, currentUser.id));

  await sendLoginCode(normalizedEmail, code);

  return {
    expiresAt,
    cooldownSeconds: LOGIN_CODE_COOLDOWN_SECONDS,
  };
}

export async function login(
  email: string,
  code: string,
): Promise<{ token: string }> {
  await ensureDbSchema();

  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedEmail || !normalizedCode) {
    throw new Error("Email and code are required");
  }

  const validCode = await db
    .select()
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (validCode.length === 0) {
    throw new Error("Invalid email or code.");
  }

  const existingUser = validCode[0];
  if (!existingUser.code || !existingUser.codeExpiresAt) {
    throw new Error("No active code found. Request a new login code.");
  }

  if (existingUser.codeAttemptCount >= LOGIN_CODE_MAX_ATTEMPTS) {
    throw new Error(
      "Too many incorrect attempts. Request a new login code and try again.",
    );
  }

  const nowIso = new Date().toISOString();
  if (parseISOString(existingUser.codeExpiresAt) < parseISOString(nowIso)) {
    throw new Error("Login code has expired. Request a new one.");
  }

  if (existingUser.code !== normalizedCode) {
    await db
      .update(user)
      .set({
        codeAttemptCount: existingUser.codeAttemptCount + 1,
        updatedAt: nowIso,
      })
      .where(eq(user.id, existingUser.id));

    throw new Error("Invalid email or code.");
  }

  const role: UserRole = existingUser.role ?? "member";
  const jwt = generateJWT({
    userId: existingUser.id,
    email: existingUser.email,
    role,
  });

  await setCookie(AUTH_COOKIE_NAME, jwt, {
    maxAge: SESSION_TTL_SECONDS,
  });

  await db
    .update(user)
    .set({
      jwt,
      status: "active",
      code: null,
      codeExpiresAt: null,
      codeAttemptCount: 0,
      lastLoginAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(user.id, existingUser.id));

  return { token: jwt };
}

export async function logout(): Promise<void> {
  await deleteCookie(AUTH_COOKIE_NAME);
}
