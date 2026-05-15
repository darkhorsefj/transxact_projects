import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { logout } from "@/services/auth.service";

export async function POST(): Promise<Response> {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
