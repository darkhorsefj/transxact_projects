export function formatDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
}

export function formatDueDate(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString();
}

export function displayName(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : email;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseBooleanFlag(value: number): boolean {
  return value === 1;
}

export function getInitials(label: string): string {
  const parts = label.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

export function getAvatarColorByLabel(label: string, colors: readonly string[]): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getAvatarColorByUserId(userId: number, colors: readonly string[]): string {
  return colors[Math.abs(userId) % colors.length];
}
