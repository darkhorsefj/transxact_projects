"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiArrowLeft, FiPlus, FiTrash2 } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { Badge } from "@/components/ui/badge";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { createItem, updateCase, deleteCase, deleteItem, type CaseDetail } from "@/services/workflow.service";

interface CaseDetailViewProps {
  detail: CaseDetail;
}

const IMPACT_OPTIONS = [
  { value: "many", label: "Many affected" },
  { value: "some", label: "Some affected" },
  { value: "one", label: "One affected" },
];

const SEVERITY_OPTIONS = [
  { value: "major", label: "Major disruption" },
  { value: "minor", label: "Minor disruption" },
  { value: "degraded", label: "Degraded service" },
  { value: "none", label: "No disruption" },
];

const CLASSIFICATION_OPTIONS = [
  "bug",
  "data quality",
  "training related",
  "enhancement",
  "configuration",
  "other",
];

const CASE_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

function priorityVariant(priority: string): "default" | "secondary" | "destructive" {
  if (priority === "P1") return "destructive";
  if (priority === "P2") return "default";
  return "secondary";
}

function caseStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "open") return "destructive";
  if (status === "in_progress") return "default";
  return "secondary";
}

function itemStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "rework") return "destructive";
  if (status === "feedback") return "default";
  return "secondary";
}

function taskStatusLabel(s: string): string {
  if (s === "not_started") return "Not Started";
  if (s === "in_progress") return "In Progress";
  return "Completed";
}

export default function CaseDetailView({ detail: initialDetail }: CaseDetailViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [detail, setDetail] = useState<CaseDetail>(initialDetail);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isEditCaseOpen, setIsEditCaseOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Item form state
  const [dateReported, setDateReported] = useState(new Date().toISOString().slice(0, 10));
  const [itemDesc, setItemDesc] = useState("");
  const [impact, setImpact] = useState("one");
  const [severity, setSeverity] = useState("minor");
  const [classification, setClassification] = useState("bug");

  // Edit case state
  const [editTitle, setEditTitle] = useState(detail.title);
  const [editDesc, setEditDesc] = useState(detail.description ?? "");
  const [editCustomer, setEditCustomer] = useState(detail.customerName ?? "");
  const [editStatus, setEditStatus] = useState<string>(detail.status);

  const refreshDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${detail.id}`, { cache: "no-store", credentials: "same-origin" });
      if (res.ok) {
        setDetail(await res.json());
      }
    } catch {
      // Best effort
    }
  }, [detail.id]);

  useEffect(() => {
    const interval = setInterval(refreshDetail, 30000);
    return () => clearInterval(interval);
  }, [refreshDetail]);

  const handleCreateItem = async () => {
    setError(null);
    if (!itemDesc.trim()) {
      setError("Description is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createItem({
        caseId: detail.id,
        dateReported: new Date(dateReported).toISOString(),
        description: itemDesc,
        impact,
        severity,
        classification,
      });
      toast.success("Item created.");
      setIsItemModalOpen(false);
      setItemDesc("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCase = async () => {
    setError(null);
    if (!editTitle.trim()) {
      setError("Title is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await updateCase(detail.id, {
        title: editTitle,
        description: editDesc || undefined,
        customerName: editCustomer || undefined,
        status: editStatus as "open" | "in_progress" | "closed",
      });
      toast.success("Case updated.");
      setIsEditCaseOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update case.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!confirm("Delete this case and all its items? This action is permanent.")) return;
    setIsSubmitting(true);
    try {
      await deleteCase(detail.id);
      toast.success("Case deleted.");
      router.push("/cases");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete case.");
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("Delete this item and its tasks?")) return;
    try {
      await deleteItem(itemId);
      toast.success("Item deleted.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item.");
    }
  };

  return (
    <section className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2">
        <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-underline">
          <FiArrowLeft size={14} />
          Back to cases
        </Link>
      </div>

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>{detail.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Project: {detail.projectName}</p>
            {detail.customerName && <p className="text-sm text-muted-foreground mt-0.5">Customer: {detail.customerName}</p>}
            {detail.description && <p className="text-sm text-muted-foreground mt-0.5">{detail.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={caseStatusVariant(detail.status)}>
              {detail.status === "open" ? "Open" : detail.status === "in_progress" ? "In Progress" : "Closed"}
            </Badge>
            <AppButton variant="ghost" onClick={() => {
              setEditTitle(detail.title);
              setEditDesc(detail.description ?? "");
              setEditCustomer(detail.customerName ?? "");
              setEditStatus(detail.status);
              setIsEditCaseOpen(true);
              setError(null);
            }}>
              Edit
            </AppButton>
            <AppButton variant="ghost" onClick={handleDeleteCase} disabled={isSubmitting}>
              <FiTrash2 size={14} />
            </AppButton>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Created by {detail.createdBy} on {new Date(detail.createdAt).toLocaleDateString()}
          {detail.updatedAt ? ` (updated ${new Date(detail.updatedAt).toLocaleDateString()})` : ""}
        </p>

        <div className="flex flex-wrap gap-2 justify-between items-center mb-2">
          <h3 className="text-sm font-semibold">
            Items ({detail.items.length})
          </h3>
          <AppButton
            onClick={() => {
              setIsItemModalOpen(true);
              setDateReported(new Date().toISOString().slice(0, 10));
              setItemDesc("");
              setImpact("one");
              setSeverity("minor");
              setClassification("bug");
              setError(null);
            }}
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Add item
          </AppButton>
        </div>

        {detail.items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No items yet. Add the first item to track work in this case.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.items.map((item) => (
              <div key={item.id} className="border rounded-md p-3 bg-accent/30">
                <div className="flex flex-wrap gap-2 justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge>
                    <span className="text-sm font-semibold">{item.classification}</span>
                    <Badge variant={itemStatusVariant(item.status)}>
                      {item.status === "rework" ? "Rework" : item.status === "feedback" ? "Feedback" : "Closed"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/cases/${detail.id}/items/${item.id}`}
                      className="text-sm text-primary hover:underline no-underline"
                    >
                      View details
                    </Link>
                    <AppButton variant="ghost" onClick={() => handleDeleteItem(item.id)}>
                      <FiTrash2 size={12} />
                    </AppButton>
                  </div>
                </div>
                <p className="text-sm mb-2">{item.description}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                  <span>Impact: {IMPACT_OPTIONS.find(o => o.value === item.impact)?.label ?? item.impact}</span>
                  <span>Severity: {SEVERITY_OPTIONS.find(o => o.value === item.severity)?.label ?? item.severity}</span>
                  <span>Reported: {new Date(item.dateReported).toLocaleDateString()}</span>
                  <span>Tasks: {item.tasks.length}</span>
                  {item.relatedItemIds && (
                    <span>Related: {JSON.parse(item.relatedItemIds).join(", ")}</span>
                  )}
                </div>
                {item.tasks.length > 0 && (
                  <div className="border-t pt-2 mt-1">
                    <div className="flex flex-col gap-1">
                      {item.tasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs py-0.5">
                          <Link href={`/tasks/${t.id}`} className="text-primary hover:underline no-underline">
                            {t.title}
                          </Link>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t.assigneeName ?? "Unassigned"}</span>
                            <span className="text-muted-foreground">{taskStatusLabel(t.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create Item Modal */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => {
          setIsItemModalOpen(false);
          setError(null);
        }}
        title="Add item to case"
      >
        {error && (
          <div className="mb-2">
            <InlineStatus tone="error" message={error} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <TextField
            id="item-date"
            label="Date reported"
            type="date"
            value={dateReported}
            onChange={(e) => setDateReported(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="item-desc" className="text-sm font-semibold text-muted-foreground">Description</label>
            <textarea
              id="item-desc"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-20 resize-y"
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              placeholder="Describe the issue"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="item-impact" className="text-sm font-semibold text-muted-foreground">Impact</label>
              <select
                id="item-impact"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
                value={impact}
                onChange={(e) => setImpact(e.target.value)}
              >
                {IMPACT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="item-severity" className="text-sm font-semibold text-muted-foreground">Severity</label>
              <select
                id="item-severity"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-classification" className="text-sm font-semibold text-muted-foreground">Classification</label>
            <select
              id="item-classification"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
            >
              {CLASSIFICATION_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <AppButton variant="ghost" onClick={() => setIsItemModalOpen(false)} disabled={isSubmitting}>
            Cancel
          </AppButton>
          <AppButton onClick={handleCreateItem} isLoading={isSubmitting} loadingLabel="Creating...">
            Add item
          </AppButton>
        </div>
      </Modal>

      {/* Edit Case Modal */}
      <Modal
        isOpen={isEditCaseOpen}
        onClose={() => {
          setIsEditCaseOpen(false);
          setError(null);
        }}
        title="Edit case"
      >
        {error && (
          <div className="mb-2">
            <InlineStatus tone="error" message={error} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <TextField
            id="edit-title"
            label="Case title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <TextField
            id="edit-customer"
            label="Customer name"
            value={editCustomer}
            onChange={(e) => setEditCustomer(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-desc" className="text-sm font-semibold text-muted-foreground">Description</label>
            <textarea
              id="edit-desc"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-16 resize-y"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-status" className="text-sm font-semibold text-muted-foreground">Status</label>
            <select
              id="edit-status"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            >
              {CASE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <AppButton variant="ghost" onClick={() => setIsEditCaseOpen(false)} disabled={isSubmitting}>
            Cancel
          </AppButton>
          <AppButton onClick={handleUpdateCase} isLoading={isSubmitting} loadingLabel="Saving...">
            Save changes
          </AppButton>
        </div>
      </Modal>
    </section>
  );
}