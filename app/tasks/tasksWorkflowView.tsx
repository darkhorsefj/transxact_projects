"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiChevronsRight, FiEye, FiEyeOff, FiPlus } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import TextField from "@/app/ui/textField";
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

function taskStatusLabel(status: TaskWorkflowItem["status"]): string {
  if (status === "not_started") {
    return "Not started";
  }

  if (status === "in_progress") {
    return "In progress";
  }

  return "Completed";
}

export default function TasksWorkflowView({
  assignees,
  currentUserId,
  projects,
  tasks,
}: TasksWorkflowViewProps): ReactElement {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancingId, setIsAdvancingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const hasProject = projects.length > 0;

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
      setStatus({
        tone: "success",
        message: "Task created.",
      });
      toast.success("Task created");
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
            <h2>Create task</h2>
            <p>
              New tasks are placed in the project backlog, then moved through the
              task workflow.
            </p>
          </div>
        </div>

        {!hasProject ? (
          <InlineStatus
            tone="error"
            message="Create at least one project before adding tasks."
          />
        ) : (
          <div className="workflow-form-grid">
            <div className="field-wrap">
              <label
                htmlFor="task-project"
                className="field-label"
              >
                Project
              </label>
              <select
                id="task-project"
                className="text-input"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={isSubmitting}
              >
                {projects.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-wrap">
              <label
                htmlFor="task-assignee"
                className="field-label"
              >
                Assignee
              </label>
              <select
                id="task-assignee"
                className="text-input"
                value={assigneeUserId}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                disabled={isSubmitting}
              >
                {assignees.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <TextField
              id="task-title"
              label="Task title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (status?.tone === "error") {
                  setStatus(null);
                }
              }}
              placeholder="Implement invite expiration reminders"
              disabled={isSubmitting}
              required
            />

            <div className="field-wrap">
              <label
                htmlFor="task-due-on"
                className="field-label"
              >
                Due date
              </label>
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
              <label
                htmlFor="task-description"
                className="field-label"
              >
                Description
              </label>
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
        )}

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
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Task workflow board</h2>
            <p>Advance tasks from not started to completed.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Project</th>
                <th scope="col">Phase</th>
                <th scope="col">Assignee</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="empty-row"
                  >
                    No tasks yet.
                  </td>
                </tr>
              ) : (
                tasks.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/tasks/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <div className="workflow-title">{item.title}</div>
                        {item.description ? (
                          <p className="workflow-subtext">{item.description}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td>{item.projectName}</td>
                    <td>{item.phaseName}</td>
                    <td>{item.assigneeName ?? "Unassigned"}</td>
                    <td>{formatDueDate(item.dueAt)}</td>
                    <td>
                      <span className="workflow-status-pill">
                        {taskStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="button-row">
                        <Link href={`/tasks/${item.id}`}>
                          <AppButton
                            variant="secondary"
                            startIcon={<FiPlus aria-hidden="true" />}
                          >
                            View
                          </AppButton>
                        </Link>
                        <AppButton
                          variant="secondary"
                          onClick={() => handleToggleFollow(item.id, !item.isFollowing)}
                          isLoading={isTogglingFollowId === item.id}
                          loadingLabel="Updating..."
                          startIcon={
                            item.isFollowing ? (
                              <FiEyeOff aria-hidden="true" />
                            ) : (
                              <FiEye aria-hidden="true" />
                            )
                          }
                        >
                          {item.isFollowing ? "Unfollow" : "Follow"}
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          onClick={() => handleAdvanceTask(item.id)}
                          disabled={item.status === "completed"}
                          isLoading={isAdvancingId === item.id}
                          loadingLabel="Updating..."
                          startIcon={<FiChevronsRight aria-hidden="true" />}
                        >
                          Advance
                        </AppButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
