import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import ItemsListView from "./itemsListView";
import { listAllItemOptions, listAllCaseOptions } from "@/services/workflow.service";

export const dynamic = "force-dynamic";

export default async function ItemsPage(): Promise<ReactElement> {
  let items: Awaited<ReturnType<typeof listAllItemOptions>>;
  let cases: Awaited<ReturnType<typeof listAllCaseOptions>>;
  try {
    [items, cases] = await Promise.all([
      listAllItemOptions(),
      listAllCaseOptions(),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "You must be signed in to continue.") {
      redirect("/auth");
    }
    throw error;
  }

  return <ItemsListView items={items} cases={cases} />;
}
