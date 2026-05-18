import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import TasksWorkflowView from "./tasksWorkflowView";
import { listTaskWorkflowData } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

export default async function TasksPage(): Promise<ReactElement> {
  let data: Awaited<ReturnType<typeof listTaskWorkflowData>>;
  try {
    data = await listTaskWorkflowData();
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }

    throw error;
  }

  return (
    <TasksWorkflowView
      currentUserId={data.currentUserId}
      projects={data.projects}
      cases={data.cases}
      items={data.items}
      assignees={data.assignees}
      tasks={data.tasks}
    />
  );
}
