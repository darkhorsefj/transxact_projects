import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import IssueDetailView from "./issueDetailView";
import { getIssueDetailById } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

interface IssueDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function IssueDetailPage({
  params,
}: IssueDetailPageProps): Promise<ReactElement> {
  const { id } = await params;
  const issueId = Number(id);

  if (!Number.isInteger(issueId) || issueId <= 0) {
    redirect("/issues");
  }

  let data;
  try {
    data = await getIssueDetailById(issueId);
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }

    if (error instanceof Error && error.message.includes("not found")) {
      redirect("/issues");
    }

    throw error;
  }

  return <IssueDetailView issue={data} />;
}
