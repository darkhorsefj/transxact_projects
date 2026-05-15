"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiSave } from "react-icons/fi";
import { toast } from "sonner";
import AppButton from "@/app/ui/appButton";
import { statusBadgeMap, roleBadgeMap } from "@/app/ui/formStatus";

interface User {
  id: number;
  name: string | null;
  email: string;
  role: "admin" | "member";
  status: "active" | "inactive" | "pending";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface AuditLog {
  id: number;
  adminUserId: number;
  targetUserId: number;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
}

interface AuditLogsResult {
  logs: AuditLog[];
  total: number;
}

export function AdminUserDetail({ userId }: { userId: number }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRole, setNewRole] = useState<"admin" | "member" | null>(null);
  const [newStatus, setNewStatus] = useState<"active" | "inactive" | "pending" | null>(null);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${userId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }

      const userData: User = await response.json();
      setUser(userData);
      setNewRole(userData.role);
      setNewStatus(userData.status);

      const logsResponse = await fetch(`/api/admin/users/${userId}/audit-logs?limit=50`, {
        credentials: "include",
      });

      if (logsResponse.ok) {
        const logsData: AuditLogsResult = await logsResponse.json();
        setAuditLogs(logsData.logs);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load user");
      router.push("/admin/users");
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUserData();
  }, [fetchUserData]);

  const handleUpdateRole = async () => {
    if (!user || !newRole || newRole === user.role) {
      toast.error("Select a different role");
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error("Failed to update role");
      }

      const updatedUser: User = await response.json();
      setUser(updatedUser);
      toast.success("User role updated successfully");
      fetchUserData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  };

  const handleUpdateStatus = async () => {
    if (!user || !newStatus || newStatus === user.status) {
      toast.error("Select a different status");
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      const updatedUser: User = await response.json();
      setUser(updatedUser);
      toast.success("User status updated successfully");
      fetchUserData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  if (loading) {
    return (
      <section className="workflow-stack">
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div className="loading-spinner"></div>
          <p className="empty-row">Loading user details...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="workflow-stack">
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <p className="empty-row">User not found</p>
        </div>
      </section>
    );
  }

  return (
    <section className="workflow-stack">
      <Link href="/admin/users" className="text-link">
        <span className="icon-with-label">
          <FiArrowLeft /> Back to Users
        </span>
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
        <div className="card">
          <div className="card-header">
            <h2>User Information</h2>
          </div>

          <div className="form-stack" style={{ marginTop: 0 }}>
            <div className="field-wrap">
              <label className="field-label">Name</label>
              <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                {user.name || "\u2014"}
              </p>
            </div>

            <div className="field-wrap">
              <label className="field-label">Email</label>
              <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                {user.email}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="field-wrap">
                <label className="field-label">Created</label>
                <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="field-wrap">
                <label className="field-label">Last Login</label>
                <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Manage User</h2>
          </div>

          <div className="form-stack" style={{ marginTop: 0 }}>
            <div className="field-wrap">
              <label className="field-label">Role</label>
              <div className="button-row">
                <select
                  value={newRole || ""}
                  onChange={(e) => setNewRole(e.target.value as "admin" | "member")}
                  className="filter-input"
                  style={{ flex: 1 }}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
                {newRole !== user.role && (
                  <AppButton
                    variant="primary"
                    onClick={handleUpdateRole}
                    startIcon={<FiSave />}
                  >
                    Save
                  </AppButton>
                )}
              </div>
              <p className="field-note">
                Current: <strong>{user.role}</strong>
              </p>
            </div>

            <div className="field-wrap">
              <label className="field-label">Status</label>
              <div className="button-row">
                <select
                  value={newStatus || ""}
                  onChange={(e) => setNewStatus(e.target.value as "active" | "inactive" | "pending")}
                  className="filter-input"
                  style={{ flex: 1 }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
                {newStatus !== user.status && (
                  <AppButton
                    variant="primary"
                    onClick={handleUpdateStatus}
                    startIcon={<FiSave />}
                  >
                    Save
                  </AppButton>
                )}
              </div>
              <p className="field-note">
                Current: <strong>{user.status}</strong>
              </p>
            </div>

            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <div className="button-row">
                <span
                  className="workflow-status-pill"
                  style={{ ...roleBadgeMap[user.role], border: "none" }}
                >
                  {user.role}
                </span>
                <span
                  className="workflow-status-pill"
                  style={{ ...statusBadgeMap[user.status], border: "none" }}
                >
                  {user.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Audit Log</h2>
        </div>

        {auditLogs.length === 0 ? (
          <p className="empty-row" style={{ padding: "2rem 0" }}>
            No audit logs yet
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Previous Value</th>
                  <th scope="col">New Value</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ textTransform: "capitalize" }}>
                      <strong>{log.action.replace("_", " ")}</strong>
                    </td>
                    <td>
                      <code className="workflow-status-pill" style={{ background: "var(--surface-muted)", border: "none" }}>
                        {log.previousValue || "\u2014"}
                      </code>
                    </td>
                    <td>
                      <code className="workflow-status-pill" style={{ background: "var(--surface-muted)", border: "none" }}>
                        {log.newValue || "\u2014"}
                      </code>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 500 }}>
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
