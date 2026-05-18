"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiFolder, FiPlus } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { Badge } from "@/components/ui/badge";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { createCase, type CaseListItem, type ProjectOption } from "@/services/workflow.service";

interface CaseListViewProps {
  cases: CaseListItem[];
  projects: ProjectOption[];
}

export default function CaseListView({ cases: initialCases, projects }: CaseListViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [cases, setCases] = useState<CaseListItem[]>(initialCases);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases", { cache: "no-store", credentials: "same-origin" });
      if (res.ok) {
        setCases(await res.json());
      }
    } catch {
      // Best effort
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshCases, 30000);
    return () => clearInterval(interval);
  }, [refreshCases]);

  const handleCreate = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!projectId) {
      setError("Project is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createCase({
        projectId,
        title,
        description: description || undefined,
        customerName: customerName || undefined,
      });
      toast.success("Case created.");
      setIsModalOpen(false);
      setTitle("");
      setDescription("");
      setCustomerName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create case.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 min-h-0">
      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <h2>Cases</h2>
          <AppButton
            onClick={() => {
              setIsModalOpen(true);
              setProjectId(projects[0]?.id ?? 0);
            }}
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Create case
          </AppButton>
        </div>

        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="text-muted-foreground opacity-40">
              <FiFolder size={32} aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold">No cases yet</p>
            <p>Create your first case to track project work.</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-auto border rounded-md">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Case</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Project</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Customer</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Tasks</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Status</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Created</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-accent">
                    <td className="border-b px-2 py-1.5 text-left">
                      <Link href={`/cases/${c.id}`} className="no-underline text-inherit block">
                        <div className="font-semibold">{c.title}</div>
                        <span className="text-xs text-muted-foreground">by {c.createdBy}</span>
                      </Link>
                    </td>
                    <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{c.projectName}</td>
                    <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{c.customerName ?? "—"}</td>
                    <td className="border-b px-2 py-1.5 text-left">{c.taskCount}</td>
                    <td className="border-b px-2 py-1.5 text-left">
                      <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                    </td>
                    <td className="border-b px-2 py-1.5 text-left text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        title="Create case"
      >
        {error && (
          <div className="mb-2">
            <InlineStatus tone="error" message={error} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <TextField
            id="case-title"
            label="Case title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of the case"
            required
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="case-project" className="text-sm font-semibold text-muted-foreground">Project</label>
            <select
              id="case-project"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
              value={projectId}
              onChange={(e) => setProjectId(Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <TextField
            id="case-customer"
            label="Customer name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Optional"
          />
          <TextField
            id="case-desc"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details"
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <AppButton variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
            Cancel
          </AppButton>
          <AppButton onClick={handleCreate} isLoading={isSubmitting} loadingLabel="Creating...">
            Create case
          </AppButton>
        </div>
      </Modal>
    </section>
  );
}

function statusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "in_progress") return "In Progress";
  return "Closed";
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "open") return "destructive";
  if (status === "in_progress") return "default";
  return "secondary";
}