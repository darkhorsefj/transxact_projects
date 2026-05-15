import { NextRequest } from "next/server";
import { verifyJWT } from "./jwt.service";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

export async function getAdminUserIdFromRequest(request: NextRequest): Promise<number> {
  const cookieHeader = request.headers.get("cookie") || "";
  
  // Parse cookies properly
  const cookies = cookieHeader.split(";").reduce(
    (acc: Record<string, string>, cookie: string) => {
      const [name, value] = cookie.split("=").map((s) => s.trim());
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    },
    {},
  );

  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    throw new Error("Unauthorized");
  }

  try {
    const decoded = verifyJWT(token);
    if (decoded.role !== "admin") {
      throw new Error("Forbidden: Admin access required");
    }
    return decoded.userId;
  } catch {
    throw new Error("Unauthorized");
  }
}
