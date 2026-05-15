"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ThemeToggle from "./themeToggle";
import InboxControls from "./inboxControls";
import LogoutButton from "./logoutButton";
import { cx } from "./cx";
import type { ReactElement, ReactNode } from "react";
import {
  FiAlertTriangle,
  FiBell,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiFolder,
  FiHome,
  FiMessageSquare,
  FiShield,
  FiUser,
} from "react-icons/fi";
import type { IconType } from "react-icons";

interface AppFrameProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

interface PageMeta {
  title: string;
  icon: IconType;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: FiHome },
  { href: "/projects", label: "Projects", icon: FiFolder },
  { href: "/tasks", label: "Tasks", icon: FiClipboard },
  { href: "/issues", label: "Issues", icon: FiAlertTriangle },
  { href: "/messages", label: "Messages", icon: FiMessageSquare },
  { href: "/notifications", label: "Notifications", icon: FiBell },
  { href: "/profile", label: "Profile", icon: FiUser },
];

function resolvePageMeta(pathname: string): PageMeta {
  if (pathname === "/") return { title: "Dashboard", icon: FiHome };
  if (pathname === "/auth") return { title: "Login", icon: FiShield };
  if (pathname.startsWith("/projects")) return { title: "Project workflow", icon: FiFolder };
  if (pathname.startsWith("/tasks")) return { title: "Task workflow", icon: FiClipboard };
  if (pathname.startsWith("/issues")) return { title: "Issue workflow", icon: FiAlertTriangle };
  if (pathname.startsWith("/messages")) return { title: "Direct messages", icon: FiMessageSquare };
  if (pathname.startsWith("/notifications")) return { title: "Notification center", icon: FiBell };
  if (pathname.startsWith("/admin/users")) return { title: "User Management", icon: FiShield };
  if (pathname.startsWith("/admin/reports")) return { title: "Abuse reports", icon: FiShield };
  if (pathname.startsWith("/auth/register")) return { title: "Complete account setup", icon: FiShield };
  if (pathname.startsWith("/profile")) return { title: "Profile", icon: FiUser };
  return { title: "Transxact Projects", icon: FiHome };
}

function resolveBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];

  if (pathname === "/") return crumbs;

  if (pathname.startsWith("/projects")) {
    crumbs.push({ label: "Projects", href: "/projects" });
    return crumbs;
  }

  if (pathname.startsWith("/tasks")) {
    crumbs.push({ label: "Tasks", href: "/tasks" });
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0] === "tasks") {
      crumbs.push({ label: `Task #${segments[1]}` });
    }
    return crumbs;
  }

  if (pathname.startsWith("/issues")) {
    crumbs.push({ label: "Issues", href: "/issues" });
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0] === "issues") {
      crumbs.push({ label: `Issue #${segments[1]}` });
    }
    return crumbs;
  }

  if (pathname.startsWith("/messages")) {
    crumbs.push({ label: "Messages", href: "/messages" });
    return crumbs;
  }

  if (pathname.startsWith("/notifications")) {
    crumbs.push({ label: "Notifications", href: "/notifications" });
    return crumbs;
  }

  if (pathname.startsWith("/profile")) {
    crumbs.push({ label: "Profile", href: "/profile" });
    return crumbs;
  }

  if (pathname.startsWith("/admin/users")) {
    crumbs.push({ label: "Admin", href: "/admin/users" });
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 3 && segments[2] === "invite") {
      crumbs.push({ label: "Invite user" });
    } else if (segments.length >= 3) {
      crumbs.push({ label: `User #${segments[2]}` });
    } else {
      crumbs[crumbs.length - 1] = { label: "User Management", href: "/admin/users" };
    }
    return crumbs;
  }

  if (pathname.startsWith("/admin/reports")) {
    crumbs.push({ label: "Abuse reports", href: "/admin/reports" });
    return crumbs;
  }

  return crumbs;
}

export default function AppFrame({ children }: AppFrameProps): ReactElement {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const pageMeta = resolvePageMeta(pathname);
  const PageIcon = pageMeta.icon;
  const breadcrumbs = resolveBreadcrumbs(pathname);

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const fetchUnreadMsgCount = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/inbox/unread-counts", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok) {
        const payload = await response.json();
        setUnreadMsgCount(payload.unreadMessageCount ?? 0);
      }
    } catch {
      // Best effort
    }
  }, []);

  useEffect(() => {
    if (!isAuthRoute) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + polling is intentional
      void fetchUnreadMsgCount();
      const interval = setInterval(() => void fetchUnreadMsgCount(), 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthRoute, fetchUnreadMsgCount]);

  if (isAuthRoute) {
    return (
      <div className="auth-shell">
        <header className="auth-topbar">
          <Link href="/" className="brand-link">
            Transxact Projects
          </Link>
          <ThemeToggle />
        </header>
        <main className="auth-content">{children}</main>
      </div>
    );
  }

  return (
    <div className={cx("app-shell", sidebarExpanded && "has-expanded-sidebar")}>
      <aside className={cx("sidebar", sidebarExpanded && "is-expanded")}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarExpanded((v) => !v)}
          aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          title={sidebarExpanded ? "Collapse" : "Expand"}
        >
          {sidebarExpanded ? <FiChevronLeft size={14} /> : <FiChevronRight size={14} />}
        </button>
        <nav className="side-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);
            const NavIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx("side-link", isActive && "is-active")}
                title={item.label}
              >
                <NavIcon className="side-link-icon" size={18} aria-hidden="true" />
                <span className="side-link-label">{item.label}</span>
                {item.href === "/messages" && unreadMsgCount > 0 ? (
                  <span className="side-link-badge">
                    {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              {breadcrumbs.length > 1 && (
                <nav className="breadcrumbs" aria-label="Breadcrumb">
                  {breadcrumbs.map((crumb, index) => (
                    <span key={crumb.label}>
                      {index > 0 && (
                        <span className="breadcrumb-separator" aria-hidden="true">
                          /
                        </span>
                      )}
                      {crumb.href && index < breadcrumbs.length - 1 ? (
                        <Link href={crumb.href} className="breadcrumb-link">
                          {crumb.label}
                        </Link>
                      ) : index === breadcrumbs.length - 1 ? (
                        <span className="breadcrumb-current">{crumb.label}</span>
                      ) : (
                        <span className="breadcrumb-link">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <h1 className="page-title">
              <PageIcon className="page-title-icon" size={16} aria-hidden="true" />
              <span>{pageMeta.title}</span>
            </h1>
          </div>
          <div className="topbar-actions">
            <InboxControls />
            <Link href="/profile" className="topbar-icon-btn" aria-label="Profile" title="Profile">
              <FiUser size={15} aria-hidden="true" />
            </Link>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </header>
        <main className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
