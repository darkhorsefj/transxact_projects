import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import CaseDetailView from "./caseDetailView";
import { getCaseDetail } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const caseId = Number(id);

  let detail: Awaited<ReturnType<typeof getCaseDetail>>;
  try {
    detail = await getCaseDetail(caseId);
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }
    throw error;
  }

  return <CaseDetailView detail={detail} />;
}
