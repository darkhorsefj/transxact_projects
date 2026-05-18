"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiCheckSquare, FiEye, FiEyeOff, FiMessageCircle, FiMessageSquare, FiPaperclip, FiPlus, FiSearch } from "react-icons/fi";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { formatDueDate } from "@/lib/utils";
import TaskActionModal from "./taskActionModal";
import TaskCommentModal from "./taskCommentModal";
import {
  advanceTaskStatus,
  createTask,
  reverseTaskStatus,
  setTaskFollow,
  type AssigneeOption,
  type CaseOption,
  type ItemOption,
  type ProjectOption,
  type TaskWorkflowItem,
} from "@/services/workflow.service";

interface TasksWorkflowViewProps {
  currentUserId: number;
  projects: ProjectOption[];
  cases: CaseOption[];
  items: ItemOption[];
  assignees: AssigneeOption[];
  tasks: TaskWorkflowItem[];
}

function defaultDueOn(): string {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return dueDate.toISOString().slice(0, 10);
}

function isOverdue(isoDate: string): boolean {
  const dueDate = new Date(isoDate);
  if (Number.isNaN(dueDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

export default function TasksWorkflowView({
  assignees,
  items,
  currentUserId,
  projects,
  tasks,
}: TasksWorkflowViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [itemId, setItemId] = useState<string>("");
  const [assigneeUserId, setAssigneeUserId] = useState<string>(String(currentUserId));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState(defaultDueOn);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancingId, setIsAdvancingId] = useState<number | null>(null);
  const [isReversingId, setIsReversingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [commentTaskId, setCommentTaskId] = useState<number | null>(null);
  const [commentTaskTitle, setCommentTaskTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [actionTaskId, setActionTaskId] = useState<number | null>(null);
  const [actionTaskTitle, setActionTaskTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasProject = projects.length > 0;

  const filteredTasks = useMemo(() => {
    let result = tasks;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        t.projectName.toLowerCase().includes(q) ||
        t.caseName.toLowerCase().includes(q) ||
        t.itemName.toLowerCase().includes(q) ||
        (t.assigneeName?.toLowerCase().includes(q) ?? false)
      );
    }

    if (filterProjectId) {
      const pid = Number(filterProjectId);
      result = result.filter((t) => {
        const project = projects.find((p) => p.id === pid);
        return project && t.projectName === project.name;
      });
    }

    if (filterAssigneeId) {
      const aid = Number(filterAssigneeId);
      result = result.filter((t) => {
        const assignee = assignees.find((a) => a.id === aid);
        return assignee && t.assigneeName === assignee.label;
      });
    }

    if (filterOverdue) {
      result = result.filter((t) => isOverdue(t.dueAt) && t.status !== "completed");
    }

    return result;
  }, [tasks, searchQuery, filterProjectId, filterAssigneeId, filterOverdue, projects, assignees]);

  const taskCounts = useMemo(() => ({
    notStarted: filteredTasks.filter((t) => t.status === "not_started").length,
    inProgress: filteredTasks.filter((t) => t.status === "in_progress").length,
    completed: filteredTasks.filter((t) => t.status === "completed").length,
  }), [filteredTasks]);

  const handleCreateTask = async (): Promise<void> => {
    const normalizedTitle = title.trim();
    if (!itemId) {
      setStatus({ tone: "error", message: "Select an item before creating a task." });
      return;
    }
    if (normalizedTitle.length < 3) {
      setStatus({ tone: "error", message: "Task title must be at least 3 characters." });
      return;
    }
    if (!dueOn) {
      setStatus({ tone: "error", message: "Task due date is required." });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTask({
        itemId: Number(itemId),
        assigneeUserId: Number(assigneeUserId),
        title: normalizedTitle,
        description,
        dueOn,
      });

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("taskId", String(result.id));
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error ?? "File upload failed. Task was created.");
        }
      }

      setFile(null);
      setTitle("");
      setDescription("");
      setDueOn(defaultDueOn());
      toast.success("Task created");
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create task.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceTask = async (taskId: number): Promise<void> => {
    setIsAdvancingId(taskId);
    try {
      await advanceTaskStatus(taskId);
      toast.success("Task status updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update task status.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsAdvancingId(null);
    }
  };

  const handleReverseTask = async (taskId: number): Promise<void> => {
    setIsReversingId(taskId);
    try {
      await reverseTaskStatus(taskId);
      toast.success("Task moved back");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to move task back.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsReversingId(null);
    }
  };

  const handleToggleFollow = async (taskId: number, follow: boolean): Promise<void> => {
    setIsTogglingFollowId(taskId);
    try {
      await setTaskFollow(taskId, follow);
      toast.success(follow ? "Task followed" : "Task unfollowed");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update follow state.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsTogglingFollowId(null);
    }
  };

  const kanbanCard = (item: TaskWorkflowItem) => {
    const canGoBack =
      (item.status === "in_progress" || item.status === "completed");
    const nextLabel =
      item.status === "not_started" ? "Start →"
      : item.status === "in_progress" ? "Complete →"
      : null;

    return (
      <div key={item.id} className="kanban-card border rounded-md bg-card p-1.5 flex flex-col gap-0.5 transition-shadow hover:shadow-sm">
        <Link href={`/tasks/${item.id}`} className="kanban-card-title font-semibold text-sm text-foreground hover:text-primary leading-tight no-underline">
          {item.title}
        </Link>
        {item.description ? (
          <div className="text-xs text-muted-foreground line-clamp-1 leading-tight">{item.description}</div>
        ) : null}
        <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.projectName}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.caseName}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.itemName}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.assigneeName ?? "Unassigned"}</span>
          <span className={`inline-flex items-center gap-1 text-xs ${isOverdue(item.dueAt) ? "text-destructive" : "text-muted-foreground"}`}>Due {formatDueDate(item.dueAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5 pt-0.5 border-t">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleToggleFollow(item.id, !item.isFollowing)}
                  disabled={isTogglingFollowId === item.id}
                  className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.isFollowing ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{item.isFollowing ? "Unfollow" : "Follow"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setCommentTaskId(item.id);
                    setCommentTaskTitle(item.title);
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.unreadCommentCount > 0 ? (
                    <FiMessageCircle size={14} className="text-primary" />
                  ) : (
                    <FiMessageSquare size={14} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>Comments</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setActionTaskId(item.id);
                    setActionTaskTitle(item.title);
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground"
                >
                  <FiCheckSquare size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5">
            {canGoBack && (
              <AppButton
                onClick={() => handleReverseTask(item.id)}
                disabled={isReversingId === item.id}
                isLoading={isReversingId === item.id}
                loadingLabel="Moving..."
                variant="ghost"
                startIcon={<FiArrowLeft aria-hidden="true" />}
              >
                Back
              </AppButton>
            )}
            {nextLabel && (
              <AppButton
                onClick={() => handleAdvanceTask(item.id)}
                disabled={isAdvancingId === item.id}
                isLoading={isAdvancingId === item.id}
                loadingLabel="Moving..."
                variant="ghost"
              >
                {nextLabel}
              </AppButton>
            )}
          </div>
        </div>
      </div>
    );
  };

  const clearFiltersActive = searchQuery || filterProjectId || filterAssigneeId || filterOverdue;

  return (
    <section className="flex flex-col gap-2 min-h-0">
      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <h2>Task workflow board</h2>
          <div className="flex items-center gap-1.5">
            <AppButton
              onClick={() => setIsModalOpen(true)}
              disabled={!hasProject}
              startIcon={<FiPlus aria-hidden="true" />}
            >
              Create task
            </AppButton>
          </div>
        </div>

        {!hasProject && (
          <InlineStatus
            tone="error"
            message="Create at least one project before adding tasks."
          />
        )}

        {tasks.length === 0 && hasProject ? (
          <div className="flex flex-col items-center gap-1.5 py-6 px-3 text-muted-foreground text-sm text-center">
            <div className="text-muted-foreground">
              <FiCheckSquare size={32} aria-hidden="true" />
            </div>
            <p className="font-semibold">No tasks yet</p>
            <p>Create your first task to start tracking work.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <div className="flex-1 min-w-40 relative">
                <FiSearch
                  size={16}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
                />
                <input
                  className="w-full border rounded-md bg-accent text-foreground text-sm pl-8 pr-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                />
              </div>
              <select
                className="min-w-40 border rounded-md bg-accent text-foreground text-sm px-2 py-1.5 transition-colors focus:border-primary"
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
                aria-label="Filter by project"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                className="min-w-40 border rounded-md bg-accent text-foreground text-sm px-2 py-1.5 transition-colors focus:border-primary"
                value={filterAssigneeId}
                onChange={(e) => setFilterAssigneeId(e.target.value)}
                aria-label="Filter by assignee"
              >
                <option value="">All assignees</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center gap-1 border rounded-md bg-accent text-muted-foreground cursor-pointer text-sm font-semibold min-h-7 px-2 py-1.5 transition-colors hover:border-border hover:text-foreground${filterOverdue ? " bg-primary/10 border-primary text-primary" : ""}`}
                    onClick={() => setFilterOverdue((v) => !v)}
                  >
                    <span className="text-xs">
                      {filterOverdue ? "Overdue ✓" : "Overdue"}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Show only overdue tasks</TooltipContent>
              </Tooltip>
              {clearFiltersActive && (
                <AppButton
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterProjectId("");
                    setFilterAssigneeId("");
                    setFilterOverdue(false);
                  }}
                >
                  Clear
                </AppButton>
              )}
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredTasks.length} of {tasks.length}
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-0.5 flex-1 min-h-0 w-full">
              <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-1 px-0.5">
                  <span className="font-semibold text-sm">Not Started</span>
                  <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{taskCounts.notStarted}</span>
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                  {filteredTasks.filter((t) => t.status === "not_started").map(kanbanCard)}
                  {taskCounts.notStarted === 0 && <p className="px-0.5 text-sm text-muted-foreground">No tasks</p>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-center gap-1 px-0.5">
                  <span className="font-semibold text-sm">In Progress</span>
                  <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{taskCounts.inProgress}</span>
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                  {filteredTasks.filter((t) => t.status === "in_progress").map(kanbanCard)}
                  {taskCounts.inProgress === 0 && <p className="px-0.5 text-sm text-muted-foreground">No tasks</p>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-emerald-50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-1 px-0.5">
                  <span className="font-semibold text-sm">Completed</span>
                  <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{taskCounts.completed}</span>
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                  {filteredTasks.filter((t) => t.status === "completed").map(kanbanCard)}
                  {taskCounts.completed === 0 && <p className="px-0.5 text-sm text-muted-foreground">No tasks</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFile(null);
          setStatus(null);
        }}
        title="Create task"
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-item" className="text-sm font-semibold text-muted-foreground">Item</label>
            <select
              id="task-item"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select an item...</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.projectName} / {item.caseTitle} / {item.description}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="task-assignee" className="text-sm font-semibold text-muted-foreground">Assignee</label>
            <select
              id="task-assignee"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
              disabled={isSubmitting}
            >
              {assignees.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <TextField
            id="task-title"
            label="Task title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (status?.tone === "error") setStatus(null);
            }}
            placeholder="Implement invite expiration reminders"
            disabled={isSubmitting}
            required
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="task-due-on" className="text-sm font-semibold text-muted-foreground">Due date</label>
            <input
              id="task-due-on"
              type="date"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2">
            <label htmlFor="task-description" className="text-sm font-semibold text-muted-foreground">Description</label>
            <textarea
              id="task-description"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-16 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional implementation detail and acceptance notes."
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2">
            <span className="text-sm font-semibold text-muted-foreground">Attachment</span>
            <div className="flex items-center gap-2">
              <AppButton
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                startIcon={<FiPaperclip aria-hidden="true" />}
              >
                {file ? file.name : "Attach file"}
              </AppButton>
              {file && (
                <AppButton
                  variant="ghost"
                  onClick={() => setFile(null)}
                  disabled={isSubmitting}
                >
                  Remove
                </AppButton>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="task-file-input"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
            <AppButton
            onClick={handleCreateTask}
            disabled={!itemId}
            isLoading={isSubmitting}
            loadingLabel="Creating..."
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Create task
          </AppButton>
        </div>
        <InlineStatus
          tone={status?.tone ?? "info"}
          message={status?.message ?? null}
        />
      </Modal>

      {commentTaskId !== null && (
        <TaskCommentModal
          taskId={commentTaskId}
          taskTitle={commentTaskTitle}
          isOpen={commentTaskId !== null}
          onClose={() => {
            setCommentTaskId(null);
            setCommentTaskTitle("");
          }}
        />
      )}

      {actionTaskId !== null && (
        <TaskActionModal
          taskId={actionTaskId}
          taskTitle={actionTaskTitle}
          isOpen={actionTaskId !== null}
          onClose={() => {
            setActionTaskId(null);
            setActionTaskTitle("");
          }}
        />
      )}
    </section>
  );
}
