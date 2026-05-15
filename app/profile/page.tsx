"use client";

import { useState, useEffect, useCallback } from "react";
import { FiMonitor, FiSave, FiUser, FiX } from "react-icons/fi";
import { toast } from "sonner";
import AppButton from "@/app/ui/appButton";
import TextField from "@/app/ui/textField";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";
import { formatDateTime } from "@/lib/utils";
import { getProfile, updateProfileName } from "@/services/profile.service";
import type { ProfileUser } from "@/services/profile.service";

const roleBadgeStyle: Record<string, React.CSSProperties> = {
  admin: { background: "var(--brand-soft)", color: "var(--brand)" },
  member: { background: "var(--info-soft)", color: "var(--info)" },
};

const statusBadgeStyle: Record<string, React.CSSProperties> = {
  active: { background: "var(--success-soft)", color: "var(--success)" },
  inactive: { background: "var(--error-soft)", color: "var(--error)" },
  pending: { background: "var(--info-soft)", color: "var(--info)" },
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  interface SessionItem {
    id: number;
    deviceLabel: string;
    ipAddress: string | null;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
    isActive: number;
  }

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch {
      // silent
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProfile();
        setProfile(data);
        setName(data.name ?? "");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to load profile";
        setStatus({ tone: "error", message: msg });
        toast.error(msg);
      } finally {
        setLoading(false);
      }
      await fetchSessions();
    })();
  }, [fetchSessions]);

  const handleRevokeSession = async (sessionId: number): Promise<void> => {
    setRevokingId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke session");
      toast.success("Session revoked");
      fetchSessions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to revoke session";
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus({ tone: "error", message: "Name is required" });
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const updated = await updateProfileName(trimmed);
      setProfile(updated);
      setName(updated.name ?? "");
      setStatus({ tone: "success", message: "Profile updated successfully" });
      toast.success("Profile updated");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update profile";
      setStatus({ tone: "error", message: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="workflow-stack">
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div className="loading-spinner"></div>
          <p className="empty-row">Loading profile...</p>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="workflow-stack">
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <p className="empty-row">Could not load profile.</p>
        </div>
      </section>
    );
  }

  const hasChanges = name.trim() !== (profile.name ?? "");

  return (
    <section className="workflow-stack">
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
        <div className="card">
          <div className="card-header">
            <h2 className="icon-with-label">
              <FiUser aria-hidden="true" />
              <span>Profile</span>
            </h2>
          </div>

          <div className="form-stack" style={{ marginTop: 0 }}>
            <TextField
              id="name"
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (status?.tone === "error") setStatus(null);
              }}
              placeholder="Your name"
              disabled={saving}
              required
            />

            <div className="field-wrap">
              <label className="field-label">Email</label>
              <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                {profile.email}
              </p>
              <p className="field-note">Email cannot be changed.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="field-wrap">
                <label className="field-label">Member since</label>
                <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                  {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="field-wrap">
                <label className="field-label">Last login</label>
                <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                  {profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>

            <div className="button-row" style={{ paddingTop: "0.5rem" }}>
              <span className="workflow-status-pill" style={{ ...roleBadgeStyle[profile.role], border: "none" }}>
                {profile.role}
              </span>
              <span className="workflow-status-pill" style={{ ...statusBadgeStyle[profile.status], border: "none" }}>
                {profile.status}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Edit Profile</h2>
          </div>

          <div className="form-stack" style={{ marginTop: 0 }}>
            <InlineStatus tone={status?.tone ?? "info"} message={status?.message ?? null} />

            <AppButton
              onClick={handleSave}
              isLoading={saving}
              loadingLabel="Saving..."
              disabled={!hasChanges}
              startIcon={<FiSave aria-hidden="true" />}
            >
              Save changes
            </AppButton>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="icon-with-label">
              <FiMonitor aria-hidden="true" />
              <span>Sessions</span>
            </h2>
          </div>

          <div className="table-wrap">
            {sessionsLoading ? (
              <p className="empty-row">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="empty-row">No active sessions.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Device</th>
                    <th scope="col">Last used</th>
                    <th scope="col">Created</th>
                    <th scope="col">Status</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: "500" }}>
                        <span className="icon-with-label">
                          <FiMonitor size={14} />
                          <span>{s.deviceLabel}</span>
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{formatDateTime(s.lastUsedAt)}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{formatDateTime(s.createdAt)}</td>
                      <td>
                        <span
                          className="workflow-status-pill"
                          style={{
                            background: s.isActive ? "var(--success-soft)" : "var(--error-soft)",
                            color: s.isActive ? "var(--success)" : "var(--error)",
                            border: "none",
                          }}
                        >
                          {s.isActive ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td>
                        {s.isActive && (
                          <AppButton
                            variant="ghost"
                            onClick={() => void handleRevokeSession(s.id)}
                            disabled={revokingId === s.id}
                            isLoading={revokingId === s.id}
                            loadingLabel="Revoking..."
                          >
                            <FiX size={14} />
                          </AppButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
