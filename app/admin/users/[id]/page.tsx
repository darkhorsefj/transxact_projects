"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiSave } from "react-icons/fi";
import { toast } from "sonner";

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

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const userId = parseInt(params.id);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading user details...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">User not found</p>
        </div>
      </div>
    );
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-8 font-medium transition"
        >
          <FiArrowLeft size={18} /> Back to Users
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">User Information</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                <p className="text-base text-gray-900 py-2.5 px-3 bg-gray-50 rounded-lg">{user.name || "—"}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                <p className="text-base text-gray-900 py-2.5 px-3 bg-gray-50 rounded-lg">{user.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Created</label>
                  <p className="text-base text-gray-900 py-2.5 px-3 bg-gray-50 rounded-lg">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Last Login</label>
                  <p className="text-base text-gray-900 py-2.5 px-3 bg-gray-50 rounded-lg">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Manage User</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Role</label>
                <div className="flex gap-2">
                  <select
                    value={newRole || ""}
                    onChange={(e) => setNewRole(e.target.value as "admin" | "member")}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white text-sm font-medium"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  {newRole !== user.role && (
                    <button
                      onClick={handleUpdateRole}
                      className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
                      title="Save role"
                    >
                      <FiSave size={18} />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">Current: <span className="font-semibold text-gray-700">{user.role}</span></p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Status</label>
                <div className="flex gap-2">
                  <select
                    value={newStatus || ""}
                    onChange={(e) => setNewStatus(e.target.value as "active" | "inactive" | "pending")}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white text-sm font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                  {newStatus !== user.status && (
                    <button
                      onClick={handleUpdateStatus}
                      className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
                      title="Save status"
                    >
                      <FiSave size={18} />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">Current: <span className="font-semibold text-gray-700">{user.status}</span></p>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                    {user.role}
                  </span>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(user.status)}`}>
                    {user.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h2>

          {auditLogs.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No audit logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Previous Value</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">New Value</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-900 font-medium capitalize">
                        {log.action.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{log.previousValue || "—"}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{log.newValue || "—"}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-medium">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
