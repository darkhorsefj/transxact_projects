"use client";

import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { FiList, FiSearch } from "react-icons/fi";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import type { CaseOption, ItemOption } from "@/services/workflow.service";

interface ItemsListViewProps {
  items: ItemOption[];
  cases: CaseOption[];
}

export default function ItemsListView({ items, cases }: ItemsListViewProps): ReactElement {
  useSseRefresh();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCaseId, setFilterCaseId] = useState("");

  const filteredItems = useMemo(() => {
    let result = items;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((i) =>
        i.description.toLowerCase().includes(q) ||
        i.caseTitle.toLowerCase().includes(q) ||
        i.projectName.toLowerCase().includes(q)
      );
    }

    if (filterCaseId) {
      const cid = Number(filterCaseId);
      result = result.filter((i) => i.caseId === cid);
    }

    return result;
  }, [items, searchQuery, filterCaseId]);

  const clearFiltersActive = searchQuery || filterCaseId;

  return (
    <section className="flex flex-col gap-2 min-h-0">
      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <h2>Items</h2>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="text-muted-foreground opacity-40">
              <FiList size={32} aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold">No items yet</p>
            <p>Create a case first, then add items from the case detail page.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <FiSearch
                  size={16}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
                />
                <input
                  className="w-full border rounded-md bg-accent text-foreground text-sm pl-8 pr-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                />
              </div>
              <select
                className="min-w-40 border rounded-md bg-accent text-foreground text-sm px-2 py-1.5 transition-colors focus:border-primary"
                value={filterCaseId}
                onChange={(e) => setFilterCaseId(e.target.value)}
                aria-label="Filter by case"
              >
                <option value="">All cases</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.projectName} / {c.title}</option>
                ))}
              </select>
              {clearFiltersActive && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 border rounded-md bg-accent text-muted-foreground cursor-pointer text-sm font-semibold px-2 py-1.5 transition-colors hover:border-border hover:text-foreground"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterCaseId("");
                  }}
                >
                  Clear
                </button>
              )}
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredItems.length} of {items.length}
              </span>
            </div>

            <div className="max-h-96 overflow-auto border rounded-md">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Item</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Project</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground text-center py-2">
                        No matching items.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-accent">
                        <td className="border-b px-2 py-1.5 text-left">
                          <Link href={`/cases/${item.caseId}/items/${item.id}`} className="no-underline text-inherit block">
                            <div className="font-semibold">{item.description}</div>
                          </Link>
                        </td>
                        <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{item.projectName}</td>
                        <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{item.caseTitle}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
