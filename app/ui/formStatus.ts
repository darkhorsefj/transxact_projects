import type React from "react";

export interface FormStatus {
  tone: "success" | "error" | "info";
  message: string;
}

export const statusBadgeMap: Record<string, React.CSSProperties> = {
  active: { background: "var(--success-soft)", color: "var(--success)" },
  inactive: { background: "var(--error-soft)", color: "var(--error)" },
  pending: { background: "var(--info-soft)", color: "var(--info)" },
};

export const roleBadgeMap: Record<string, React.CSSProperties> = {
  admin: { background: "var(--brand-soft)", color: "var(--brand)" },
  member: { background: "var(--info-soft)", color: "var(--info)" },
};
