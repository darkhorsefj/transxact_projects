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
import { createTask, updateItem, deleteItem, advanceTaskStatus, reverseTaskStatus } from "@/services/workflow.service";

interface ItemDetailViewProps {
  detail: {
    id: number;
    caseId: number;
    caseTitle: string;
    projectName: string;
    dateReported: string;
    description: string;
    impact: string;
    severity: string;
    priority: string;
    classification: string;
    status: string;
    relatedItemIds: string | null;
    createdBy: string;
    createdByUserId: number;
    createdAt: string;
    updatedAt: string | null;
    tasks: {
      id: number;
      title: string;
      description: string | null;
      status: string;
      dueAt: string;
      assigneeName: string | null;
    }[];
  };
  assignees: { id: number; label: string }[];
  caseId: number;
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

const ITEM_STATUS_OPTIONS = [
  { value: "rework", label: "Rework" },
  { value: "feedback", label: "Feedback" },
  { value: "closed", label: "Closed" },
];

function priorityVariant(priority: string): "default" | "secondary" | "destructive" {
  if (priority === "P1") return "destructive";
  if (priority === "P2") return "default";
  return "secondary";
}

function itemStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "rework") return "destructive";
  if (status === "feedback") return "default";
  return "secondary";
}

export default function ItemDetailView({ detail: initialDetail, assignees, caseId }: ItemDetailViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDueOn, setTaskDueOn] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState(0);

  const [editDesc, setEditDesc] = useState(detail.description);
  const [editImpact, setEditImpact] = useState(detail.impact);
  const [editSeverity, setEditSeverity] = useState(detail.severity);
  const [editStatus, setEditStatus] = useState(detail.status);
  const [editClassification, setEditClassification] = useState(detail.classification);

  const refreshDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/items/${detail.id}`, { cache: "no-store", credentials: "same-origin" });
      if (res.ok) {
        setDetail(await res.json());
      }
    } catch {
      // Best effort
    }
  }, [caseId, detail.id]);

  useEffect(() => {
    const interval = setInterval(refreshDetail, 30000);
    return () => clearInterval(interval);
  }, [refreshDetail]);

  const handleCreateTask = async () => {
    setError(null);
    if (!taskTitle.trim()) {
      setError("Title is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createTask({
        itemId: detail.id,
        title: taskTitle,
        description: taskDesc || undefined,
        dueOn: taskDueOn || new Date().toISOString().slice(0, 10),
        assigneeUserId: taskAssigneeId || undefined,
      });
      toast.success("Task created.");
      setIsTaskModalOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskDueOn("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateItem = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await updateItem(detail.id, {
        description: editDesc,
        impact: editImpact,
        severity: editSeverity,
        status: editStatus,
        classification: editClassification,
      });
      toast.success("Item updated.");
      setIsEditItemOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!confirm("Delete this item and its tasks?")) return;
    setIsSubmitting(true);
    try {
      await deleteItem(detail.id);
      toast.success("Item deleted.");
      router.push(`/cases/${caseId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item.");
      setIsSubmitting(false);
    }
  };

  const handleAdvanceTask = async (taskId: number) => {
    try {
      await advanceTaskStatus(taskId);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  const handleReverseTask = async (taskId: number) => {
    try {
      await reverseTaskStatus(taskId);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  return (
    <section className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2">
        <Link href={`/cases/${caseId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-underline">
          <FiArrowLeft size={14} />
          Back to case
        </Link>
      </div>

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>{detail.description}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {detail.projectName} / {detail.caseTitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={priorityVariant(detail.priority)}>{detail.priority}</Badge>
            <Badge variant={itemStatusVariant(detail.status)}>
              {detail.status === "rework" ? "Rework" : detail.status === "feedback" ? "Feedback" : "Closed"}
            </Badge>
            <AppButton variant="ghost" onClick={() => {
              setEditDesc(detail.description);
              setEditImpact(detail.impact);
              setEditSeverity(detail.severity);
              setEditStatus(detail.status);
              setEditClassification(detail.classification);
              setIsEditItemOpen(true);
              setError(null);
            }}>
              Edit
            </AppButton>
            <AppButton variant="ghost" onClick={handleDeleteItem} disabled={isSubmitting}>
              <FiTrash2 size={14} />
            </AppButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
          <span>Impact: {IMPACT_OPTIONS.find(o => o.value === detail.impact)?.label ?? detail.impact}</span>
          <span>Severity: {SEVERITY_OPTIONS.find(o => o.value === detail.severity)?.label ?? detail.severity}</span>
          <span>Classification: {detail.classification}</span>
          <span>Reported: {new Date(detail.dateReported).toLocaleDateString()}</span>
          {detail.relatedItemIds && (
            <span>Related: {JSON.parse(detail.relatedItemIds).join(", ")}</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Created by {detail.createdBy} on {new Date(detail.createdAt).toLocaleDateString()}
          {detail.updatedAt ? ` (updated ${new Date(detail.updatedAt).toLocaleDateString()})` : ""}
        </p>

        <div className="flex flex-wrap gap-2 justify-between items-center mb-2">
          <h3 className="text-sm font-semibold">Tasks ({detail.tasks.length})</h3>
          <AppButton
            onClick={() => {
              setIsTaskModalOpen(true);
              setTaskTitle("");
              setTaskDesc("");
              setTaskDueOn("");
              setTaskAssigneeId(assignees[0]?.id ?? 0);
              setError(null);
            }}
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Add task
          </AppButton>
        </div>

        {detail.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet. Add the first task for this item.</p>
        ) : (
          <div className="max-h-96 overflow-auto border rounded-md">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Task</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Assignee</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Due</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Status</th>
                  <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.tasks.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-accent">
                    <td className="border-b px-2 py-1.5 text-left">
                      <Link href={`/tasks/${t.id}`} className="no-underline text-inherit block">
                        <div className="font-semibold">{t.title}</div>
                        {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
                      </Link>
                    </td>
                    <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{t.assigneeName ?? "—"}</td>
                    <td className="border-b px-2 py-1.5 text-left text-xs text-muted-foreground">
                      {new Date(t.dueAt).toLocaleDateString()}
                    </td>
                    <td className="border-b px-2 py-1.5 text-left">
                      <Badge variant={t.status === "completed" ? "default" : t.status === "in_progress" ? "destructive" : "secondary"}>
                        {t.status === "not_started" ? "Not Started" : t.status === "in_progress" ? "In Progress" : "Completed"}
                      </Badge>
                    </td>
                    <td className="border-b px-2 py-1.5 text-left">
                      <div className="flex items-center gap-1">
                        {t.status === "not_started" && (
                          <AppButton variant="ghost" onClick={() => handleAdvanceTask(t.id)}>Start</AppButton>
                        )}
                        {t.status === "in_progress" && (
                          <>
                            <AppButton variant="ghost" onClick={() => handleReverseTask(t.id)}>Unstart</AppButton>
                            <AppButton variant="ghost" onClick={() => handleAdvanceTask(t.id)}>Complete</AppButton>
                          </>
                        )}
                        {t.status === "completed" && (
                          <AppButton variant="ghost" onClick={() => handleReverseTask(t.id)}>Reopen</AppButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Task Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setError(null);
        }}
        title="Add task to item"
      >
        {error && (
          <div className="mb-2">
            <InlineStatus tone="error" message={error} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <TextField
            id="task-title"
            label="Task title"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Brief description of the task"
            required
          />
          <TextField
            id="task-desc"
            label="Description"
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            placeholder="Optional details"
          />
          <TextField
            id="task-due"
            label="Due date"
            type="date"
            value={taskDueOn}
            onChange={(e) => setTaskDueOn(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="task-assignee" className="text-sm font-semibold text-muted-foreground">Assignee</label>
            <select
              id="task-assignee"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(Number(e.target.value))}
            >
              <option value={0}>Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <AppButton variant="ghost" onClick={() => setIsTaskModalOpen(false)} disabled={isSubmitting}>
            Cancel
          </AppButton>
          <AppButton onClick={handleCreateTask} isLoading={isSubmitting} loadingLabel="Creating...">
            Add task
          </AppButton>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        isOpen={isEditItemOpen}
        onClose={() => {
          setIsEditItemOpen(false);
          setError(null);
        }}
        title="Edit item"
      >
        {error && (
          <div className="mb-2">
            <InlineStatus tone="error" message={error} />
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-desc" className="text-sm font-semibold text-muted-foreground">Description</label>
            <textarea
              id="edit-desc"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-16 resize-y"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-impact" className="text-sm font-semibold text-muted-foreground">Impact</label>
              <select
                id="edit-impact"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
                value={editImpact}
                onChange={(e) => setEditImpact(e.target.value)}
              >
                {IMPACT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-severity" className="text-sm font-semibold text-muted-foreground">Severity</label>
              <select
                id="edit-severity"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
                value={editSeverity}
                onChange={(e) => setEditSeverity(e.target.value)}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-status" className="text-sm font-semibold text-muted-foreground">Status</label>
            <select
              id="edit-status"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            >
              {ITEM_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <AppButton variant="ghost" onClick={() => setIsEditItemOpen(false)} disabled={isSubmitting}>
            Cancel
          </AppButton>
          <AppButton onClick={handleUpdateItem} isLoading={isSubmitting} loadingLabel="Saving...">
            Save changes
          </AppButton>
        </div>
      </Modal>
    </section>
  );
}
