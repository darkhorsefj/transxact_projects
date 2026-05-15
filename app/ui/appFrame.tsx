"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./themeToggle";
import InboxControls from "./inboxControls";
import LogoutButton from "./logoutButton";
import { cx } from "./cx";
import type { ReactElement, ReactNode } from "react";
import {
  FiAlertTriangle,
  FiBell,
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
  if (pathname === "/") {
    return { title: "Dashboard", icon: FiHome };
  }

  if (pathname === "/auth") {
    return { title: "Login", icon: FiShield };
  }

  if (pathname.startsWith("/projects")) {
    return { title: "Project workflow", icon: FiFolder };
  }

  if (pathname.startsWith("/tasks")) {
    return { title: "Task workflow", icon: FiClipboard };
  }

  if (pathname.startsWith("/issues")) {
    return { title: "Issue workflow", icon: FiAlertTriangle };
  }

  if (pathname.startsWith("/messages")) {
    return { title: "Direct messages", icon: FiMessageSquare };
  }

  if (pathname.startsWith("/notifications")) {
    return { title: "Notification center", icon: FiBell };
  }

  if (pathname.startsWith("/admin/users")) {
    return { title: "User Management", icon: FiShield };
  }

  if (pathname.startsWith("/admin/reports")) {
    return { title: "Abuse reports", icon: FiShield };
  }

  if (pathname.startsWith("/auth/register")) {
    return { title: "Complete account setup", icon: FiShield };
  }

  if (pathname.startsWith("/profile")) {
    return { title: "Profile", icon: FiUser };
  }

  return { title: "Transxact Projects", icon: FiHome };
}

export default function AppFrame({ children }: AppFrameProps): ReactElement {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const pageMeta = resolvePageMeta(pathname);
  const PageIcon = pageMeta.icon;

  if (isAuthRoute) {
    return (
      <div className="auth-shell">
        <header className="auth-topbar">
          <Link
            href="/"
            className="brand-link"
          >
            Transxact Projects
          </Link>
          <ThemeToggle />
        </header>
        <main className="auth-content">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link
          href="/"
          className="brand-link"
        >
          Transxact Projects
        </Link>
        <nav
          className="side-nav"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);
            const NavIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx("side-link", isActive && "is-active")}
              >
                <NavIcon
                  className="side-link-icon"
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1 className="page-title">
              <PageIcon
                className="page-title-icon"
                aria-hidden="true"
              />
              <span>{pageMeta.title}</span>
            </h1>
          </div>
          <div className="topbar-actions">
            <InboxControls />
            <Link href="/profile" className="topbar-icon-btn" aria-label="Profile">
              <FiUser aria-hidden="true" />
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
