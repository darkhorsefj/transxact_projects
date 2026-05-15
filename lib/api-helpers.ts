import { NextResponse } from "next/server";

export function apiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = errorStatus(message);
  return NextResponse.json({ error: message }, { status });
}

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("unauthorized") || lower.includes("signed in") || lower.includes("session expired")) return 401;
  if (lower.includes("forbidden")) return 403;
  if (lower.includes("not found") || lower.includes("does not exist")) return 404;
  if (lower.includes("already exists")) return 409;
  if (lower.includes("too many") || lower.includes("rate limit")) return 429;
  return 500;
}

export function parseIntegerParam(value: string | null, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}
