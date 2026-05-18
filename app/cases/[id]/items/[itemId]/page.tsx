import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import ItemDetailView from "./itemDetailView";
import { getItemDetail, listAssigneeOptions } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}): Promise<ReactElement> {
  const { id, itemId: itemIdStr } = await params;
  const itemId = Number(itemIdStr);

  let detail: Awaited<ReturnType<typeof getItemDetail>>;
  let assignees: Awaited<ReturnType<typeof listAssigneeOptions>>;
  try {
    [detail, assignees] = await Promise.all([
      getItemDetail(itemId),
      listAssigneeOptions(),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }
    throw error;
  }

  return <ItemDetailView detail={detail} assignees={assignees} caseId={Number(id)} />;
}
