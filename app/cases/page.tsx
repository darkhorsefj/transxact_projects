import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import CaseListView from "./caseListView";
import { listCases } from "@/services/workflow.service";
import { listProjectWorkflowData } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

export default async function CasesPage(): Promise<ReactElement> {
  let cases: Awaited<ReturnType<typeof listCases>>;
  let projectList: Awaited<ReturnType<typeof listProjectWorkflowData>>["projects"];
  try {
    const [caseData, projectData] = await Promise.all([
      listCases(),
      listProjectWorkflowData(),
    ]);
    cases = caseData;
    projectList = projectData.projects;
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }
    throw error;
  }

  return <CaseListView cases={cases} projects={projectList} />;
}
