"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ThemeToggle from "./themeToggle";
import InboxControls from "./inboxControls";
import LogoutButton from "./logoutButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import {
  FiAlertTriangle,
  FiBell,
  FiBriefcase,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiFolder,
  FiHome,
  FiList,
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
  { href: "/cases", label: "Cases", icon: FiBriefcase },
  { href: "/items", label: "Items", icon: FiList },
  { href: "/tasks", label: "Tasks", icon: FiClipboard },
  { href: "/issues", label: "Issues", icon: FiAlertTriangle },
  { href: "/messages", label: "Messages", icon: FiMessageSquare },
  { href: "/notifications", label: "Notifications", icon: FiBell },
  { href: "/profile", label: "Profile", icon: FiUser },
];

function resolvePageMeta(pathname: string): PageMeta {
  if (pathname === "/") return { title: "Dashboard", icon: FiHome };
  if (pathname === "/auth") return { title: "Login", icon: FiShield };
  if (pathname.startsWith("/projects"))
    return { title: "Project workflow", icon: FiFolder };
  if (pathname.startsWith("/tasks"))
    return { title: "Task workflow", icon: FiClipboard };
  if (pathname.startsWith("/issues"))
    return { title: "Issue workflow", icon: FiAlertTriangle };
  if (pathname.startsWith("/cases"))
    return { title: "Cases", icon: FiBriefcase };
  if (pathname.startsWith("/items"))
    return { title: "Items", icon: FiList };
  if (pathname.startsWith("/messages"))
    return { title: "Direct messages", icon: FiMessageSquare };
  if (pathname.startsWith("/notifications"))
    return { title: "Notification center", icon: FiBell };
  if (pathname.startsWith("/admin/users"))
    return { title: "User Management", icon: FiShield };
  if (pathname.startsWith("/admin/reports"))
    return { title: "Abuse reports", icon: FiShield };
  if (pathname.startsWith("/auth/register"))
    return { title: "Complete account setup", icon: FiShield };
  if (pathname.startsWith("/profile"))
    return { title: "Profile", icon: FiUser };
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

  if (pathname.startsWith("/cases")) {
    crumbs.push({ label: "Cases", href: "/cases" });
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0] === "cases") {
      crumbs.push({ label: `Case #${segments[1]}` });
    }
    if (segments.length >= 4 && segments[2] === "items") {
      crumbs.push({ label: `Item #${segments[3]}` });
    }
    return crumbs;
  }

  if (pathname.startsWith("/items")) {
    crumbs.push({ label: "Items", href: "/items" });
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
      crumbs[crumbs.length - 1] = {
        label: "User Management",
        href: "/admin/users",
      };
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
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/30 bg-card px-3 py-2 min-h-11">
          <Link
            href="/"
            className="text-base font-bold tracking-tight"
          >
            Transxact Projects
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex justify-center p-6">{children}</main>
      </div>
    );
  }

  const sidebarClasses = `sticky top-0 flex flex-col items-center gap-2.5 border-r border-border/30 bg-card h-dvh px-1.5 py-2 overflow-x-hidden group${sidebarExpanded ? " is-expanded w-48" : ""}`;

  return (
    <div
      className="grid min-h-dvh"
      style={{
        gridTemplateColumns: sidebarExpanded ? "12rem 1fr" : "3rem 1fr",
      }}
    >
      <aside className={sidebarClasses}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mb-2 self-end"
              onClick={() => setSidebarExpanded((v) => !v)}
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarExpanded ? (
                <FiChevronLeft size={14} />
              ) : (
                <FiChevronRight size={14} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {sidebarExpanded ? "Collapse" : "Expand"}
          </TooltipContent>
        </Tooltip>
        <nav
          className="flex flex-col items-center gap-0.5"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const NavIcon = item.icon;
            const linkClasses = `inline-flex gap-2 items-center justify-center rounded-md p-2 text-muted-foreground text-sm relative transition-colors hover:bg-accent hover:text-foreground group-[.is-expanded]:w-full group-[.is-expanded]:justify-start group-[.is-expanded]:px-2.5 group-[.is-expanded]:gap-2${isActive ? " bg-primary/10 text-primary" : ""}`;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={linkClasses}
                  >
                    <NavIcon
                      className="shrink-0"
                      size={18}
                      aria-hidden="true"
                    />
                    <span className="hidden text-sm font-semibold whitespace-nowrap group-[.is-expanded]:inline">
                      {item.label}
                    </span>
                    {item.href === "/messages" && unreadMsgCount > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-4 rounded-full bg-primary text-primary-foreground text-xs font-bold px-1 py-0.5 leading-none">
                        {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                      </span>
                    ) : null}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/30 bg-card px-3 py-2 min-h-11">
          <div>
            <div className="min-h-4">
              {breadcrumbs.length > 1 && (
                <nav
                  className="flex items-center gap-1 text-xs"
                  aria-label="Breadcrumb"
                >
                  {breadcrumbs.map((crumb, index) => (
                    <span key={crumb.label}>
                      {index > 0 && (
                        <span
                          className="text-muted-foreground"
                          aria-hidden="true"
                        >
                          /
                        </span>
                      )}
                      {crumb.href && index < breadcrumbs.length - 1 ? (
                        <Link
                          href={crumb.href}
                          className="text-muted-foreground font-medium hover:text-primary transition-colors"
                        >
                          {crumb.label}
                        </Link>
                      ) : index === breadcrumbs.length - 1 ? (
                        <span className="text-foreground/70 font-semibold">
                          {crumb.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">
                          {crumb.label}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <h1 className="inline-flex items-center gap-1.5 text-base font-semibold">
              <PageIcon
                className="shrink-0"
                size={16}
                aria-hidden="true"
              />
              <span>{pageMeta.title}</span>
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <InboxControls />
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center gap-1 border rounded-md bg-accent text-muted-foreground cursor-pointer text-sm font-semibold min-h-7 px-2 py-1 transition-colors hover:border-border hover:text-foreground"
                  aria-label="Profile"
                >
                  <FiUser
                    size={15}
                    aria-hidden="true"
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Profile</TooltipContent>
            </Tooltip>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 p-2.5 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
