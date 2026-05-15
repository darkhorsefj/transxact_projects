"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "transxact-theme";
const DEFAULT_THEME: ThemeMode = "light";
const themeSubscribers = new Set<() => void>();

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" ? "dark" : DEFAULT_THEME;
}

function getThemeServerSnapshot(): ThemeMode {
  return DEFAULT_THEME;
}

function subscribeToTheme(listener: () => void): () => void {
  themeSubscribers.add(listener);

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === THEME_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    themeSubscribers.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function setStoredTheme(theme: ThemeMode): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  for (const listener of themeSubscribers) {
    listener();
  }
}

export default function ThemeToggle(): ReactElement {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredTheme,
    getThemeServerSnapshot,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggle = (): void => {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setStoredTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleToggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? <FiMoon size={15} aria-hidden="true" /> : <FiSun size={15} aria-hidden="true" />}
    </button>
  );
}
