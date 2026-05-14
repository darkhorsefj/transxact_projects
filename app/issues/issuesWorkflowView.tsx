"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiChevronsRight, FiEye, FiEyeOff, FiPlus } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import TextField from "@/app/ui/textField";
import {
  advanceIssueStatus,
  createIssue,
  setIssueFollow,
  type AssigneeOption,
  type IssueWorkflowItem,
  type ProjectOption,
  type TaskOption,
} from "@/services/workflow.service";

interface IssuesWorkflowViewProps {
  projects: ProjectOption[];
  tasks: TaskOption[];
  assignees: AssigneeOption[];
  issues: IssueWorkflowItem[];
}

interface FormStatus {
  tone: "success" | "error" | "info";
  message: string;
}

function issueStatusLabel(status: IssueWorkflowItem["status"]): string {
  if (status === "open") {
    return "Open";
  }

  if (status === "in_progress") {
    return "In progress";
  }

  if (status === "resolved") {
    return "Resolved";
  }

  return "Closed";
}

export default function IssuesWorkflowView({
  assignees,
  issues,
  projects,
  tasks,
}: IssuesWorkflowViewProps): ReactElement {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(
    projects[0] ? String(projects[0].id) : "",
  );
  const [taskId, setTaskId] = useState<string>("");
  const [assigneeUserId, setAssigneeUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancingId, setIsAdvancingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const hasProject = projects.length > 0;

  const filteredTaskOptions = useMemo(() => {
    if (!projectId) {
      return [];
    }

    const normalizedProjectId = Number(projectId);
    return tasks.filter((item) => item.projectId === normalizedProjectId);
  }, [projectId, tasks]);

  const handleProjectChange = (nextProjectId: string): void => {
    setProjectId(nextProjectId);
    if (
      taskId &&
      !tasks.some(
        (item) => item.id === Number(taskId) && item.projectId === Number(nextProjectId),
      )
    ) {
      setTaskId("");
    }
  };

  const handleCreateIssue = async (): Promise<void> => {
    if (!projectId) {
      const message = "Select a project before creating an issue.";
      setStatus({ tone: "error", message });
      toast.error(message);
      return;
    }

    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 3) {
      const message = "Issue title must be at least 3 characters.";
      setStatus({ tone: "error", message });
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    try {
      await createIssue({
        projectId: Number(projectId),
        taskId: taskId ? Number(taskId) : undefined,
        assigneeUserId: assigneeUserId ? Number(assigneeUserId) : undefined,
        title: normalizedTitle,
        description,
      });
      setTaskId("");
      setAssigneeUserId("");
      setTitle("");
      setDescription("");
      setStatus({ tone: "success", message: "Issue created." });
      toast.success("Issue created");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create issue.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceIssue = async (issueId: number): Promise<void> => {
    setIsAdvancingId(issueId);
    try {
      await advanceIssueStatus(issueId);
      toast.success("Issue status updated");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update issue status.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsAdvancingId(null);
    }
  };

  const handleToggleFollow = async (
    issueId: number,
    follow: boolean,
  ): Promise<void> => {
    setIsTogglingFollowId(issueId);
    try {
      await setIssueFollow(issueId, follow);
      toast.success(follow ? "Issue followed" : "Issue unfollowed");
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
            <h2>Create issue</h2>
            <p>Capture and move blockers from open through to closed.</p>
          </div>
        </div>

        {!hasProject ? (
          <InlineStatus
            tone="error"
            message="Create at least one project before logging issues."
          />
        ) : (
          <div className="workflow-form-grid">
            <div className="field-wrap">
              <label
                htmlFor="issue-project"
                className="field-label"
              >
                Project
              </label>
              <select
                id="issue-project"
                className="text-input"
                value={projectId}
                onChange={(event) => handleProjectChange(event.target.value)}
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
                htmlFor="issue-task"
                className="field-label"
              >
                Linked task
              </label>
              <select
                id="issue-task"
                className="text-input"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {filteredTaskOptions.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-wrap">
              <label
                htmlFor="issue-assignee"
                className="field-label"
              >
                Assignee
              </label>
              <select
                id="issue-assignee"
                className="text-input"
                value={assigneeUserId}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Unassigned</option>
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
              id="issue-title"
              label="Issue title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (status?.tone === "error") {
                  setStatus(null);
                }
              }}
              placeholder="Email delivery fails for invitations"
              disabled={isSubmitting}
              required
            />

            <div className="field-wrap workflow-span-all">
              <label
                htmlFor="issue-description"
                className="field-label"
              >
                Description
              </label>
              <textarea
                id="issue-description"
                className="text-input workflow-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional troubleshooting context and expected behavior."
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        <div className="workflow-actions">
          <AppButton
            onClick={handleCreateIssue}
            disabled={!hasProject}
            isLoading={isSubmitting}
            loadingLabel="Creating..."
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Create issue
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
            <h2>Issues</h2>
            <p>Manage blockers from open through to closed.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col">Project</th>
                <th scope="col">Task</th>
                <th scope="col">Assignee</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {issues.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-row"
                  >
                    No issues yet.
                  </td>
                </tr>
              ) : (
                issues.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/issues/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <div className="workflow-title">{item.title}</div>
                        {item.description ? (
                          <p className="workflow-subtext">{item.description}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td>{item.projectName}</td>
                    <td>{item.taskTitle ?? "-"}</td>
                    <td>{item.assigneeName ?? "Unassigned"}</td>
                    <td>
                      <span className="workflow-status-pill">
                        {issueStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="button-row">
                        <Link href={`/issues/${item.id}`}>
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
                          onClick={() => handleAdvanceIssue(item.id)}
                          disabled={item.status === "closed"}
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
