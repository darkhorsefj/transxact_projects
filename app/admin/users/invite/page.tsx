"use client";

import { useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiMail, FiUserPlus } from "react-icons/fi";
import { toast } from "sonner";

export default function InviteUserPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [invitedUsers, setInvitedUsers] = useState<
    Array<{ email: string; role: string; createdAt: string }>
  >([]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to invite user");
      }

      const newUser = await response.json();
      setInvitedUsers([
        ...invitedUsers,
        { email: newUser.email, role: newUser.role, createdAt: newUser.createdAt },
      ]);

      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-8 font-medium transition"
        >
          <FiArrowLeft size={18} /> Back to Users
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Invite New User</h1>
            <p className="text-gray-600 mt-2">
              Send an invitation link to a new user to join the platform
            </p>
          </div>

          <form onSubmit={handleInvite} className="space-y-6 mb-8">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <FiMail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "member")}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white text-sm font-medium"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <p className="mt-2 text-sm text-gray-600">
                {role === "admin"
                  ? "👤 Admins can manage users and system settings"
                  : "👥 Members have basic access to projects and tasks"}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md"
            >
              <FiUserPlus size={20} /> {loading ? "Sending..." : "Send Invitation"}
            </button>
          </form>

          {invitedUsers.length > 0 && (
            <div className="border-t border-gray-200 pt-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recently Invited Users</h2>
              <div className="space-y-3">
                {invitedUsers.map((user, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{user.email}</p>
                      <p className="text-sm text-gray-600 capitalize">Role: <span className="font-medium text-gray-900">{user.role}</span></p>
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-green-700 bg-green-200">✓ Invited</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 p-5 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              ℹ️ How it works
            </h3>
            <ul className="text-sm text-gray-700 space-y-2">
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">1.</span>
                <span>Enter the user&apos;s email address and select their role</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">2.</span>
                <span>An invitation email will be sent to them</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">3.</span>
                <span>They will receive a link to join and set up their account</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">4.</span>
                <span>Admin users can manage other users and system settings</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
