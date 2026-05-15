"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { FiBell, FiCheck, FiMail, FiNavigation } from "react-icons/fi";

interface UnreadCounts {
  unreadMessageCount: number;
  unreadNotificationCount: number;
}

interface NotificationListItem {
  id: number;
  title: string;
  body: string | null;
  href: string;
  isRead: boolean;
  createdAt: string;
}

const DEFAULT_COUNTS: UnreadCounts = {
  unreadMessageCount: 0,
  unreadNotificationCount: 0,
};

function formatTimestamp(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
}

export default function InboxControls(): ReactElement {
  const [counts, setCounts] = useState<UnreadCounts>(DEFAULT_COUNTS);
  const [notifications, setNotifications] = useState<NotificationListItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const refreshCounts = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/inbox/unread-counts", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as UnreadCounts;
    setCounts({
      unreadMessageCount: payload.unreadMessageCount ?? 0,
      unreadNotificationCount: payload.unreadNotificationCount ?? 0,
    });
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/notifications/recent?limit=8", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { notifications?: NotificationListItem[] };
    setNotifications(payload.notifications ?? []);
  }, []);

  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([refreshCounts(), refreshNotifications()]);
  }, [refreshCounts, refreshNotifications]);

  const markNotificationRead = useCallback(
    async (notificationId: number): Promise<void> => {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      await refreshAll();
    },
    [refreshAll],
  );

  const markAllRead = useCallback(async (): Promise<void> => {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
      credentials: "same-origin",
    });
    await refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    const refreshInterval = setInterval(() => {
      void refreshAll();
    }, 30000);

    const queueInterval = setInterval(() => {
      void fetch("/api/notifications/process-email", {
        method: "POST",
        credentials: "same-origin",
      });
    }, 60000);

    const eventSource = new EventSource("/api/realtime/stream", { withCredentials: true });
    const handleRefresh = (): void => {
      void refreshAll();
    };
    eventSource.addEventListener("refresh", handleRefresh);

    return () => {
      clearTimeout(initialLoadTimer);
      clearInterval(refreshInterval);
      clearInterval(queueInterval);
      eventSource.removeEventListener("refresh", handleRefresh);
      eventSource.close();
    };
  }, [refreshAll]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent): void => {
      const targetNode = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(targetNode)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div
      className="inbox-controls"
      ref={dropdownRef}
    >
      <Link
        href="/messages"
        className="inbox-link"
        title="Messages"
      >
        <FiMail size={15} aria-hidden="true" />
        {counts.unreadMessageCount > 0 ? (
          <span className="inbox-badge">{counts.unreadMessageCount}</span>
        ) : null}
      </Link>

      <button
        type="button"
        className="notification-bell-button"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) {
            void refreshNotifications();
          }
        }}
        aria-label="Open notifications"
        title="Notifications"
      >
        <FiBell size={15} aria-hidden="true" />
        {counts.unreadNotificationCount > 0 ? (
          <span className="inbox-badge">{counts.unreadNotificationCount}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="icon-with-label">
              <FiBell size={14} aria-hidden="true" />
              <span>Notifications</span>
            </span>
            <button
              type="button"
              className="text-link-button"
              onClick={() => void markAllRead()}
            >
              <FiCheck size={13} aria-hidden="true" />
              Mark all read
            </button>
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="notification-empty">No notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`notification-item ${item.isRead ? "is-read" : "is-unread"}`}
                >
                  <Link
                    href={item.href}
                    className="notification-item-link"
                    onClick={() => {
                      setIsOpen(false);
                      if (!item.isRead) {
                        void markNotificationRead(item.id);
                      }
                    }}
                  >
                    <p className="notification-title">{item.title}</p>
                    {item.body ? <p className="notification-body">{item.body}</p> : null}
                    <p className="notification-time">{formatTimestamp(item.createdAt)}</p>
                  </Link>
                  {!item.isRead ? (
                    <button
                      type="button"
                      className="text-link-button"
                      onClick={() => void markNotificationRead(item.id)}
                    >
                      <FiCheck size={13} aria-hidden="true" />
                      Mark read
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <Link
            href="/notifications"
            className="notification-footer-link"
            onClick={() => setIsOpen(false)}
          >
            <FiNavigation size={13} aria-hidden="true" />
            Open notification center
          </Link>
        </div>
      ) : null}
    </div>
  );
}
