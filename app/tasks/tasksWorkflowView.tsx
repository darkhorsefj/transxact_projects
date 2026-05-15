"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiCheckSquare, FiEye, FiEyeOff, FiMessageCircle, FiMessageSquare, FiPlus, FiSearch } from "react-icons/fi";
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
  type ProjectOption,
  type TaskWorkflowItem,
} from "@/services/workflow.service";

interface TasksWorkflowViewProps {
  currentUserId: number;
  projects: ProjectOption[];
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
  currentUserId,
  projects,
  tasks,
}: TasksWorkflowViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0] ? String(projects[0].id) : "");
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

  const hasProject = projects.length > 0;

  const filteredTasks = useMemo(() => {
    let result = tasks;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        t.projectName.toLowerCase().includes(q) ||
        t.phaseName.toLowerCase().includes(q) ||
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
    if (!projectId) {
      setStatus({ tone: "error", message: "Select a project before creating a task." });
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
      await createTask({
        projectId: Number(projectId),
        assigneeUserId: Number(assigneeUserId),
        title: normalizedTitle,
        description,
        dueOn,
      });
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
      <div key={item.id} className="kanban-card">
        <Link href={`/tasks/${item.id}`} className="kanban-card-title" style={{ textDecoration: "none" }}>
          {item.title}
        </Link>
        {item.description ? (
          <div className="kanban-card-desc">{item.description}</div>
        ) : null}
        <div className="kanban-card-meta">
          <span className="kanban-card-meta-item">{item.projectName}</span>
          <span className="kanban-card-meta-item">{item.phaseName}</span>
          <span className="kanban-card-meta-item">{item.assigneeName ?? "Unassigned"}</span>
          <span className={`kanban-card-meta-item${isOverdue(item.dueAt) ? " is-overdue" : ""}`}>Due {formatDueDate(item.dueAt)}</span>
        </div>
        <div className="kanban-card-footer">
          <div className="button-row">
            <button
              onClick={() => handleToggleFollow(item.id, !item.isFollowing)}
              disabled={isTogglingFollowId === item.id}
              className="slack-action-btn"
              title={item.isFollowing ? "Unfollow" : "Follow"}
            >
              {item.isFollowing ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            </button>
            <button
              onClick={() => {
                setCommentTaskId(item.id);
                setCommentTaskTitle(item.title);
              }}
              className="slack-action-btn"
              title="Comments"
            >
              {item.unreadCommentCount > 0 ? (
                <FiMessageCircle size={14} color="var(--brand)" />
              ) : (
                <FiMessageSquare size={14} />
              )}
            </button>
            <button
              onClick={() => {
                setActionTaskId(item.id);
                setActionTaskTitle(item.title);
              }}
              className="slack-action-btn"
              title="Actions"
            >
              <FiCheckSquare size={14} />
            </button>
          </div>
          <div className="button-row">
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
    <section className="workflow-stack">
      <section className="card">
        <div className="card-header">
          <h2>Task workflow board</h2>
          <div className="card-controls">
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
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiCheckSquare size={32} aria-hidden="true" />
            </div>
            <p className="empty-state-title">No tasks yet</p>
            <p>Create your first task to start tracking work.</p>
          </div>
        ) : (
          <>
            <div className="kanban-filter-bar">
              <div className="combobox-wrap" style={{ flex: 1, minWidth: "10rem", position: "relative" }}>
                <FiSearch
                  size={16}
                  style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }}
                />
                <input
                  className="text-input"
                  style={{ paddingLeft: "2rem" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                />
              </div>
              <select
                className="filter-input"
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
                className="filter-input"
                value={filterAssigneeId}
                onChange={(e) => setFilterAssigneeId(e.target.value)}
                aria-label="Filter by assignee"
              >
                <option value="">All assignees</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <button
                type="button"
                className={cx("sort-button", filterOverdue && "is-active")}
                onClick={() => setFilterOverdue((v) => !v)}
                title="Show only overdue tasks"
              >
                <span style={{ fontSize: "0.75rem" }}>
                  {filterOverdue ? "Overdue ✓" : "Overdue"}
                </span>
              </button>
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
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {filteredTasks.length} of {tasks.length}
              </span>
            </div>

            <div className="kanban-board">
              <div className="kanban-col is-new">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">Not Started</span>
                  <span className="kanban-col-count">{taskCounts.notStarted}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks.filter((t) => t.status === "not_started").map(kanbanCard)}
                  {taskCounts.notStarted === 0 && <p className="kanban-empty-col">No tasks</p>}
                </div>
              </div>

              <div className="kanban-col is-active">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">In Progress</span>
                  <span className="kanban-col-count">{taskCounts.inProgress}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks.filter((t) => t.status === "in_progress").map(kanbanCard)}
                  {taskCounts.inProgress === 0 && <p className="kanban-empty-col">No tasks</p>}
                </div>
              </div>

              <div className="kanban-col is-done">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">Completed</span>
                  <span className="kanban-col-count">{taskCounts.completed}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks.filter((t) => t.status === "completed").map(kanbanCard)}
                  {taskCounts.completed === 0 && <p className="kanban-empty-col">No tasks</p>}
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
          setStatus(null);
        }}
        title="Create task"
      >
        <div className="workflow-form-grid">
          <div className="field-wrap">
            <label htmlFor="task-project" className="field-label">Project</label>
            <select
              id="task-project"
              className="text-input"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={isSubmitting}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="field-wrap">
            <label htmlFor="task-assignee" className="field-label">Assignee</label>
            <select
              id="task-assignee"
              className="text-input"
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

          <div className="field-wrap">
            <label htmlFor="task-due-on" className="field-label">Due date</label>
            <input
              id="task-due-on"
              type="date"
              className="text-input"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="field-wrap workflow-span-all">
            <label htmlFor="task-description" className="field-label">Description</label>
            <textarea
              id="task-description"
              className="text-input workflow-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional implementation detail and acceptance notes."
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="workflow-actions">
          <AppButton
            onClick={handleCreateTask}
            disabled={!hasProject}
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

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
