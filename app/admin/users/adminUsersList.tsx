"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FiSearch,
  FiDownload,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiChevronLeft,
  FiChevronRight,
  FiMail,
  FiUserPlus,
  FiSave,
} from "react-icons/fi";
import { toast } from "sonner";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import Modal from "@/app/ui/modal";
import { statusBadgeMap, roleBadgeMap } from "@/app/ui/formStatus";

interface User {
  id: number;
  name: string | null;
  email: string;
  role: "admin" | "member";
  status: "active" | "inactive" | "pending";
  lastLoginAt: string | null;
  createdAt: string;
}

interface ListResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function AdminUsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "admin" | "member">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "pending">("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "member">("member");
  const [editStatus, setEditStatus] = useState<"active" | "inactive" | "pending">("active");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditStatus(user.status);
    setIsEditModalOpen(true);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", "20");
      if (search) params.append("search", search);
      if (roleFilter) params.append("role", roleFilter);
      if (statusFilter) params.append("status", statusFilter);

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data: ListResult = await response.json();
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (roleFilter) params.append("role", roleFilter);
      if (statusFilter) params.append("status", statusFilter);

      const response = await fetch(`/api/admin/users/export/csv?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to export users");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Users exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export users");
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete user");
      }

      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteStatus({ tone: "error", message: "Email is required" });
      return;
    }

    try {
      setIsInviting(true);
      setInviteStatus(null);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to invite user");
      }

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteModalOpen(false);
      fetchUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to invite user";
      setInviteStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    if (editRole === editingUser.role && editStatus === editingUser.status) {
      toast.error("No changes made");
      return;
    }

    try {
      setIsSavingEdit(true);
      const body: Record<string, string> = {};
      if (editRole !== editingUser.role) body.role = editRole;
      if (editStatus !== editingUser.status) body.status = editStatus;

      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("Failed to update user");
      }

      toast.success("User updated successfully");
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <section className="workflow-stack">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>User Management</h2>
            <p>Manage system users, roles, and permissions</p>
          </div>
          <div className="card-controls">
            <AppButton
              variant="primary"
              onClick={() => {
                setInviteEmail("");
                setInviteRole("member");
                setInviteStatus(null);
                setIsInviteModalOpen(true);
              }}
              startIcon={<FiPlus />}
            >
              Invite User
            </AppButton>
          </div>
        </div>

        <div className="workflow-form">
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch
              style={{ position: "absolute", left: "0.66rem", top: "0.6rem", color: "var(--text-muted)" }}
              size={18}
            />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="filter-input"
              style={{ paddingLeft: "2.2rem", width: "100%" }}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as "" | "admin" | "member");
              setPage(1);
            }}
            className="filter-input"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | "active" | "inactive" | "pending");
              setPage(1);
            }}
            className="filter-input"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>

          <AppButton
            variant="secondary"
            onClick={handleExportCSV}
            startIcon={<FiDownload />}
          >
            Export CSV
          </AppButton>
        </div>

        <div className="pagination-info">
          <span>Showing <strong>{users.length}</strong> of <strong>{total}</strong> users</span>
        </div>
      </div>

      {loading ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div className="loading-spinner"></div>
          <p className="empty-row">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <p className="empty-row">No users found</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Login</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="workflow-title">{user.name || "\u2014"}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        className="workflow-status-pill"
                        style={{ ...roleBadgeMap[user.role], border: "none" }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className="workflow-status-pill"
                        style={{ ...statusBadgeMap[user.status], border: "none" }}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td>
                      <div className="button-row">
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-link"
                          title="Edit user"
                        >
                          <span className="icon-with-label">
                            <FiEdit2 /> Edit
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-link"
                          style={{ color: "var(--error)" }}
                          title="Delete user"
                        >
                          <span className="icon-with-label">
                            <FiTrash2 /> Delete
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar">
            <span className="pagination-info">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="button-row">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="app-button is-ghost"
                title="Previous page"
              >
                <span className="app-button-content">
                  <FiChevronLeft />
                </span>
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="app-button is-ghost"
                title="Next page"
              >
                <span className="app-button-content">
                  <FiChevronRight />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          setInviteStatus(null);
        }}
        title="Invite New User"
      >
        <div className="form-stack" style={{ marginTop: 0 }}>
          <div className="field-wrap">
            <label htmlFor="invite-email" className="field-label">Email Address</label>
            <div style={{ position: "relative" }}>
              <FiMail
                style={{ position: "absolute", left: "0.72rem", top: "0.7rem", color: "var(--text-muted)" }}
              />
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="text-input"
                style={{ paddingLeft: "2.2rem" }}
                required
              />
            </div>
          </div>

          <div className="field-wrap">
            <label htmlFor="invite-role" className="field-label">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="filter-input"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p className="field-note">
              {inviteRole === "admin"
                ? "Admins can manage users and system settings"
                : "Members have basic access to projects and tasks"}
            </p>
          </div>

          <AppButton
            onClick={handleInvite}
            fullWidth
            disabled={isInviting}
            isLoading={isInviting}
            loadingLabel="Sending..."
            startIcon={<FiUserPlus />}
          >
            Send Invitation
          </AppButton>

          <InlineStatus
            tone={inviteStatus?.tone ?? "info"}
            message={inviteStatus?.message ?? null}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
        }}
        title={editingUser ? `Edit ${editingUser.name || editingUser.email}` : "Edit User"}
      >
        {editingUser && (
          <div className="form-stack" style={{ marginTop: 0 }}>
            <div className="field-wrap">
              <label className="field-label">Name</label>
              <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                {editingUser.name || "\u2014"}
              </p>
            </div>

            <div className="field-wrap">
              <label className="field-label">Email</label>
              <p className="text-input" style={{ cursor: "default", background: "var(--surface-muted)" }}>
                {editingUser.email}
              </p>
            </div>

            <div className="field-wrap">
              <label htmlFor="edit-role" className="field-label">Role</label>
              <select
                id="edit-role"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as "admin" | "member")}
                className="filter-input"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <p className="field-note">
                Current: <strong>{editingUser.role}</strong>
              </p>
            </div>

            <div className="field-wrap">
              <label htmlFor="edit-status" className="field-label">Status</label>
              <select
                id="edit-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as "active" | "inactive" | "pending")}
                className="filter-input"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
              <p className="field-note">
                Current: <strong>{editingUser.status}</strong>
              </p>
            </div>

            <AppButton
              onClick={handleEditSave}
              fullWidth
              disabled={isSavingEdit || (editRole === editingUser.role && editStatus === editingUser.status)}
              isLoading={isSavingEdit}
              loadingLabel="Saving..."
              startIcon={<FiSave />}
            >
              Save Changes
            </AppButton>
          </div>
        )}
      </Modal>
    </section>
  );
}
