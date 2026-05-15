"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiCheckCircle, FiExternalLink } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { formatDateTime } from "@/lib/utils";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationListItem,
  type NotificationPreferenceItem,
  updateNotificationPreference,
} from "@/services/notification.service";

interface NotificationsViewProps {
  notifications: NotificationListItem[];
  preferences: NotificationPreferenceItem[];
}

interface StatusState {
  tone: "success" | "error" | "info";
  message: string;
}

export default function NotificationsView({
  notifications,
  preferences,
}: NotificationsViewProps): ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [updatingPreferenceCategory, setUpdatingPreferenceCategory] = useState<
    string | null
  >(null);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const handleMarkAllRead = async (): Promise<void> => {
    setIsMarkingAll(true);
    try {
      const markedCount = await markAllNotificationsAsRead();
      setStatus({
        tone: "success",
        message:
          markedCount > 0
            ? `${markedCount} notification(s) marked as read.`
            : "No unread notifications.",
      });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to mark all notifications as read.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleMarkRead = async (notificationId: number): Promise<void> => {
    setMarkingId(notificationId);
    try {
      await markNotificationAsRead(notificationId);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to mark notification as read.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setMarkingId(null);
    }
  };

  const handlePreferenceChange = async (
    category: NotificationPreferenceItem["category"],
    nextInAppEnabled: boolean,
    nextEmailEnabled: boolean,
  ): Promise<void> => {
    setUpdatingPreferenceCategory(category);
    try {
      await updateNotificationPreference({
        category,
        inAppEnabled: nextInAppEnabled,
        emailEnabled: nextEmailEnabled,
      });
      setStatus({ tone: "success", message: "Notification preferences updated." });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update preferences.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setUpdatingPreferenceCategory(null);
    }
  };

  return (
    <section className="workflow-stack">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Notification settings</h2>
            <p>Control in-app and email channels by category.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">In-app</th>
                <th scope="col">Email</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((item) => (
                <tr key={item.category}>
                  <td>{item.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.inAppEnabled}
                      onChange={(event) =>
                        void handlePreferenceChange(
                          item.category,
                          event.target.checked,
                          item.emailEnabled,
                        )
                      }
                      disabled={updatingPreferenceCategory === item.category}
                      aria-label={`${item.label} in-app setting`}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.emailEnabled}
                      onChange={(event) =>
                        void handlePreferenceChange(
                          item.category,
                          item.inAppEnabled,
                          event.target.checked,
                        )
                      }
                      disabled={updatingPreferenceCategory === item.category}
                      aria-label={`${item.label} email setting`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>All notifications</h2>
            <p>Review activity and open the linked destination.</p>
          </div>
          <AppButton
            variant="secondary"
            onClick={() => void handleMarkAllRead()}
            isLoading={isMarkingAll}
            loadingLabel="Updating..."
            startIcon={<FiCheckCircle aria-hidden="true" />}
          >
            Mark all as read
          </AppButton>
        </div>

        <InlineStatus
          tone={status?.tone ?? "info"}
          message={status?.message ?? null}
        />

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Title</th>
                <th scope="col">When</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="empty-row"
                  >
                    No notifications yet.
                  </td>
                </tr>
              ) : (
                notifications.map((item) => (
                  <tr key={item.id}>
                    <td>{item.isRead ? "Read" : "Unread"}</td>
                    <td>
                      <div className="workflow-title">{item.title}</div>
                      {item.body ? (
                        <p className="workflow-subtext">{item.body}</p>
                      ) : null}
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <div className="button-row">
                        <Link
                          href={item.href}
                          className="text-link"
                        >
                          <span className="icon-with-label">
                            <FiExternalLink aria-hidden="true" />
                            <span>Open</span>
                          </span>
                        </Link>
                        {!item.isRead ? (
                          <AppButton
                            variant="secondary"
                            onClick={() => void handleMarkRead(item.id)}
                            isLoading={markingId === item.id}
                            loadingLabel="Updating..."
                            startIcon={<FiCheckCircle aria-hidden="true" />}
                          >
                            Mark read
                          </AppButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
