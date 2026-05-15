"use client";

import { useState, useEffect } from "react";
import { FiSave, FiUser } from "react-icons/fi";
import { toast } from "sonner";
import AppButton from "@/app/ui/appButton";
import TextField from "@/app/ui/textField";
import InlineStatus from "@/app/ui/inlineStatus";
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

interface FormStatus {
  tone: "success" | "error" | "info";
  message: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

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
    })();
  }, []);

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
      </div>
    </section>
  );
}
