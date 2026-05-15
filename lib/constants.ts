export const AUTH_COOKIE_NAME = "transxact_project_auth_token";

export const AVATAR_COLORS = [
  "var(--avatar-0)",
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
  "var(--avatar-6)",
  "var(--avatar-7)",
] as const;

export const MESSAGE_AVATAR_COLORS = [
  "#5865F2", "#ED4245", "#57F287", "#FEE75C", "#EB459E",
  "#FF73FA", "#00B0F4", "#4D3CFF", "#95EFB4", "#F8B4B4",
  "#A3D5FF", "#F9A8D4", "#6EE7B7", "#FCD34D", "#A78BFA",
] as const;

export const MAX_EMAIL_ATTEMPTS = 3;
export const EMAIL_RETRY_MINUTES = [5, 15, 30];
