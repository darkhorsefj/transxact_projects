"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useSseRefresh(): void {
  const router = useRouter();

  useEffect(() => {
    const eventSource = new EventSource("/api/realtime/stream", { withCredentials: true });
    const handleRefresh = (): void => {
      router.refresh();
    };
    eventSource.addEventListener("refresh", handleRefresh);
    return () => {
      eventSource.removeEventListener("refresh", handleRefresh);
      eventSource.close();
    };
  }, [router]);
}
