import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import ReportsView from "./reportsView";
import { listAdminMessageReports } from "@/services/report.service";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage(): Promise<ReactElement> {
  let reports: Awaited<ReturnType<typeof listAdminMessageReports>>;
  try {
    reports = await listAdminMessageReports();
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }

    throw error;
  }

  return <ReportsView reports={reports} />;
}
