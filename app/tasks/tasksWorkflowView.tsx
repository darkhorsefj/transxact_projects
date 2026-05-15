"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiCheckSquare, FiEye, FiEyeOff, FiMessageCircle, FiMessageSquare, FiPlus, FiSearch } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import TaskActionModal from "./taskActionModal";
import TaskCommentModal from "./taskCommentModal";
import TaskDetailModal from "./taskDetailModal";
import {
  advanceTaskStatus,
  createTask,
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

interface FormStatus {
  tone: "success" | "error" | "info";
  message: string;
}

function defaultDueOn(): string {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return dueDate.toISOString().slice(0, 10);
}

function formatDueDate(isoDate: string): string {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return parsedDate.toLocaleDateString();
}

function isOverdue(isoDate: string): boolean {
  const dueDate = new Date(isoDate);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

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
  const [projectId, setProjectId] = useState<string>(
    projects[0] ? String(projects[0].id) : "",
  );
  const [assigneeUserId, setAssigneeUserId] = useState<string>(
    String(currentUserId),
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState(defaultDueOn);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancingId, setIsAdvancingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [commentTaskId, setCommentTaskId] = useState<number | null>(null);
  const [commentTaskTitle, setCommentTaskTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [actionTaskId, setActionTaskId] = useState<number | null>(null);
  const [actionTaskTitle, setActionTaskTitle] = useState("");

  const hasProject = projects.length > 0;

  const filteredTasks = searchQuery.trim()
    ? tasks.filter((t) => {
        const q = searchQuery.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false) ||
          t.projectName.toLowerCase().includes(q) ||
          t.phaseName.toLowerCase().includes(q) ||
          (t.assigneeName?.toLowerCase().includes(q) ?? false)
        );
      })
    : tasks;

  const handleCreateTask = async (): Promise<void> => {
    const normalizedTitle = title.trim();
    if (!projectId) {
      const message = "Select a project before creating a task.";
      setStatus({ tone: "error", message });
      toast.error(message);
      return;
    }

    if (normalizedTitle.length < 3) {
      const message = "Task title must be at least 3 characters.";
      setStatus({ tone: "error", message });
      toast.error(message);
      return;
    }

    if (!dueOn) {
      const message = "Task due date is required.";
      setStatus({ tone: "error", message });
      toast.error(message);
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
      const message =
        error instanceof Error ? error.message : "Unable to create task.";
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
      const message =
        error instanceof Error ? error.message : "Unable to update task status.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsAdvancingId(null);
    }
  };

  const handleToggleFollow = async (
    taskId: number,
    follow: boolean,
  ): Promise<void> => {
    setIsTogglingFollowId(taskId);
    try {
      await setTaskFollow(taskId, follow);
      toast.success(follow ? "Task followed" : "Task unfollowed");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update follow state.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsTogglingFollowId(null);
    }
  };

  return (
    <section className="workflow-stack">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Task workflow board</h2>
            <p>Advance tasks from not started to completed.</p>
          </div>
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
        {tasks.length === 0 ? (
          <p className="empty-row">No tasks yet.</p>
        ) : (
          <>
            {/* Search / filter bar */}
            {tasks.length > 10 && (
              <div className="workflow-form" style={{ marginBottom: 0 }}>
                <div className="field-wrap" style={{ flex: 1, position: "relative" }}>
                  <FiSearch
                    size={16}
                    style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
                  />
                  <input
                    className="text-input"
                    style={{ paddingLeft: "2rem" }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks by title, project, assignee..."
                  />
                </div>
                {searchQuery.trim() && (
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {filteredTasks.length} of {tasks.length}
                  </span>
                )}
              </div>
            )}
            <div className="kanban-board">
              {/* Not Started column */}
              <div className="kanban-col is-new">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">Not Started</span>
                  <span className="kanban-col-count">{filteredTasks.filter((t) => t.status === "not_started").length}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks
                    .filter((item) => item.status === "not_started")
                    .map((item) => (
                  <div key={item.id} className="kanban-card">
                    <button
                      onClick={() => setDetailTaskId(item.id)}
                      className="kanban-card-title"
                      style={{ textAlign: "left", cursor: "pointer", border: "none", background: "none", padding: 0, fontFamily: "inherit" }}
                    >
                      {item.title}
                    </button>
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
                      <AppButton
                        onClick={() => handleAdvanceTask(item.id)}
                        disabled={isAdvancingId === item.id}
                        isLoading={isAdvancingId === item.id}
                        loadingLabel="Moving..."
                        variant="ghost"
                      >
                        Start →
                      </AppButton>
                    </div>
                  </div>
                ))}
                  {filteredTasks.filter((t) => t.status === "not_started").length === 0 && (
                    <p className="kanban-empty-col">No tasks</p>
                  )}
                </div>
              </div>

              {/* In Progress column */}
              <div className="kanban-col is-active">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">In Progress</span>
                  <span className="kanban-col-count">{filteredTasks.filter((t) => t.status === "in_progress").length}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks
                    .filter((item) => item.status === "in_progress")
                    .map((item) => (
                  <div key={item.id} className="kanban-card">
                    <button
                      onClick={() => setDetailTaskId(item.id)}
                      className="kanban-card-title"
                      style={{ textAlign: "left", cursor: "pointer", border: "none", background: "none", padding: 0, fontFamily: "inherit" }}
                    >
                      {item.title}
                    </button>
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
                      <AppButton
                        onClick={() => handleAdvanceTask(item.id)}
                        disabled={isAdvancingId === item.id}
                        isLoading={isAdvancingId === item.id}
                        loadingLabel="Moving..."
                        variant="ghost"
                      >
                        Complete →
                      </AppButton>
                    </div>
                  </div>
                ))}
                  {filteredTasks.filter((t) => t.status === "in_progress").length === 0 && (
                    <p className="kanban-empty-col">No tasks</p>
                  )}
                </div>
              </div>

              {/* Completed column */}
              <div className="kanban-col is-done">
                <div className="kanban-col-header">
                  <span className="kanban-col-title">Completed</span>
                  <span className="kanban-col-count">{filteredTasks.filter((t) => t.status === "completed").length}</span>
                </div>
                <div className="kanban-card-list">
                  {filteredTasks
                    .filter((item) => item.status === "completed")
                    .map((item) => (
                  <div key={item.id} className="kanban-card">
                    <button
                      onClick={() => setDetailTaskId(item.id)}
                      className="kanban-card-title"
                      style={{ textAlign: "left", cursor: "pointer", border: "none", background: "none", padding: 0, fontFamily: "inherit" }}
                    >
                      {item.title}
                    </button>
                    {item.description ? (
                      <div className="kanban-card-desc">{item.description}</div>
                    ) : null}
                    <div className="kanban-card-meta">
                      <span className="kanban-card-meta-item">{item.projectName}</span>
                      <span className="kanban-card-meta-item">{item.phaseName}</span>
                      <span className="kanban-card-meta-item">{item.assigneeName ?? "Unassigned"}</span>
                      <span className="kanban-card-meta-item">Due {formatDueDate(item.dueAt)}</span>
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
                      <span className="workflow-status-pill" style={{ color: "var(--success)", borderColor: "var(--success)" }}>
                        ✓ Done
                      </span>
                    </div>
                  </div>
                ))}
                  {filteredTasks.filter((t) => t.status === "completed").length === 0 && (
                    <p className="kanban-empty-col">No tasks</p>
                  )}
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

      {detailTaskId !== null && (
        <TaskDetailModal
          taskId={detailTaskId}
          isOpen={detailTaskId !== null}
          onClose={() => setDetailTaskId(null)}
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
