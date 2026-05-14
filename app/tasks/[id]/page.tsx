import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import TaskDetailView from "./taskDetailView";
import { getTaskDetailById } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({
  params,
}: TaskDetailPageProps): Promise<ReactElement> {
  const { id } = await params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    redirect("/tasks");
  }

  let data;
  try {
    data = await getTaskDetailById(taskId);
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }

    if (error instanceof Error && error.message.includes("not found")) {
      redirect("/tasks");
    }

    throw error;
  }

  return <TaskDetailView task={data} />;
}
