"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiArrowLeft, FiChevronsRight, FiColumns, FiEye, FiEyeOff, FiList, FiPlus, FiSearch } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { cx } from "@/app/ui/cx";
import {
  advanceIssueStatus,
  createIssue,
  reverseIssueStatus,
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

function issueStatusLabel(status: IssueWorkflowItem["status"]): string {
  if (status === "open") return "Open";
  if (status === "in_progress") return "In progress";
  if (status === "resolved") return "Resolved";
  return "Closed";
}

type ViewMode = "table" | "kanban";

export default function IssuesWorkflowView({
  assignees,
  issues,
  projects,
  tasks,
}: IssuesWorkflowViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0] ? String(projects[0].id) : "");
  const [taskId, setTaskId] = useState<string>("");
  const [assigneeUserId, setAssigneeUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancingId, setIsAdvancingId] = useState<number | null>(null);
  const [isReversingId, setIsReversingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const hasProject = projects.length > 0;

  const filteredIssues = useMemo(() => {
    let result = issues;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        (i.description?.toLowerCase().includes(q) ?? false) ||
        i.projectName.toLowerCase().includes(q) ||
        (i.assigneeName?.toLowerCase().includes(q) ?? false)
      );
    }

    if (filterStatus) {
      result = result.filter((i) => i.status === filterStatus);
    }

    if (filterProjectId) {
      const pid = Number(filterProjectId);
      const project = projects.find((p) => p.id === pid);
      if (project) {
        result = result.filter((i) => i.projectName === project.name);
      }
    }

    return result;
  }, [issues, searchQuery, filterStatus, filterProjectId, projects]);

  const kanbanGroups = useMemo(() => ({
    open: filteredIssues.filter((i) => i.status === "open"),
    inProgress: filteredIssues.filter((i) => i.status === "in_progress"),
    resolved: filteredIssues.filter((i) => i.status === "resolved"),
    closed: filteredIssues.filter((i) => i.status === "closed"),
  }), [filteredIssues]);

  const filteredTaskOptions = useMemo(() => {
    if (!projectId) return [];
    const normalizedProjectId = Number(projectId);
    return tasks.filter((item) => item.projectId === normalizedProjectId);
  }, [projectId, tasks]);

  const handleProjectChange = (nextProjectId: string): void => {
    setProjectId(nextProjectId);
    if (taskId && !tasks.some(
      (item) => item.id === Number(taskId) && item.projectId === Number(nextProjectId),
    )) {
      setTaskId("");
    }
  };

  const handleCreateIssue = async (): Promise<void> => {
    if (!projectId) {
      setStatus({ tone: "error", message: "Select a project before creating an issue." });
      return;
    }
    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 3) {
      setStatus({ tone: "error", message: "Issue title must be at least 3 characters." });
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
      toast.success("Issue created");
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create issue.";
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
      const message = error instanceof Error ? error.message : "Unable to update issue status.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsAdvancingId(null);
    }
  };

  const handleReverseIssue = async (issueId: number): Promise<void> => {
    setIsReversingId(issueId);
    try {
      await reverseIssueStatus(issueId);
      toast.success("Issue moved back");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to move issue back.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsReversingId(null);
    }
  };

  const handleToggleFollow = async (issueId: number, follow: boolean): Promise<void> => {
    setIsTogglingFollowId(issueId);
    try {
      await setIssueFollow(issueId, follow);
      toast.success(follow ? "Issue followed" : "Issue unfollowed");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update follow state.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsTogglingFollowId(null);
    }
  };

  const clearFiltersActive = searchQuery || filterStatus || filterProjectId;

  const kanbanIssueCard = (item: IssueWorkflowItem) => {
    const canGoBack = item.status !== "open";
    const canAdvance = item.status !== "closed";
    const nextLabel =
      item.status === "open" ? "Start →"
      : item.status === "in_progress" ? "Resolve →"
      : item.status === "resolved" ? "Close →"
      : null;

    return (
      <div key={item.id} className="kanban-card">
        <Link href={`/issues/${item.id}`} className="kanban-card-title" style={{ textDecoration: "none" }}>
          {item.title}
        </Link>
        {item.description ? (
          <div className="kanban-card-desc">{item.description}</div>
        ) : null}
        <div className="kanban-card-meta">
          <span className="kanban-card-meta-item">{item.projectName}</span>
          {item.taskTitle && <span className="kanban-card-meta-item">{item.taskTitle}</span>}
          <span className="kanban-card-meta-item">{item.assigneeName ?? "Unassigned"}</span>
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
          </div>
          <div className="button-row">
            {canGoBack && (
              <AppButton
                onClick={() => handleReverseIssue(item.id)}
                disabled={isReversingId === item.id}
                isLoading={isReversingId === item.id}
                loadingLabel="Moving..."
                variant="ghost"
                startIcon={<FiArrowLeft aria-hidden="true" />}
              >
                Back
              </AppButton>
            )}
            {canAdvance && nextLabel && (
              <AppButton
                onClick={() => handleAdvanceIssue(item.id)}
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

  return (
    <section className="workflow-stack">
      <section className="card">
        <div className="card-header">
          <h2>Issues</h2>
          <div className="card-controls">
            <div className="view-toggle-group">
              <button
                className={cx("view-toggle-btn", viewMode === "table" && "is-active")}
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <FiList size={14} />
                <span>Table</span>
              </button>
              <button
                className={cx("view-toggle-btn", viewMode === "kanban" && "is-active")}
                onClick={() => setViewMode("kanban")}
                title="Kanban view"
              >
                <FiColumns size={14} />
                <span>Board</span>
              </button>
            </div>
            <AppButton
              onClick={() => setIsModalOpen(true)}
              disabled={!hasProject}
              startIcon={<FiPlus aria-hidden="true" />}
            >
              Create issue
            </AppButton>
          </div>
        </div>

        {!hasProject && (
          <InlineStatus
            tone="error"
            message="Create at least one project before logging issues."
          />
        )}

        {issues.length === 0 && hasProject ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiSearch size={32} aria-hidden="true" />
            </div>
            <p className="empty-state-title">No issues yet</p>
            <p>Create your first issue to track problems and bugs.</p>
          </div>
        ) : (
          <>
            <div className="kanban-filter-bar">
              <div style={{ flex: 1, minWidth: "10rem", position: "relative" }}>
                <FiSearch
                  size={16}
                  style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }}
                />
                <input
                  className="text-input"
                  style={{ paddingLeft: "2rem", width: "100%" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search issues..."
                />
              </div>
              <select
                className="filter-input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
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
              {clearFiltersActive && (
                <AppButton
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterStatus("");
                    setFilterProjectId("");
                  }}
                >
                  Clear
                </AppButton>
              )}
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {filteredIssues.length} of {issues.length}
              </span>
            </div>

            {viewMode === "kanban" ? (
              <div className="kanban-board">
                <div className="kanban-col is-new">
                  <div className="kanban-col-header">
                    <span className="kanban-col-title">Open</span>
                    <span className="kanban-col-count">{kanbanGroups.open.length}</span>
                  </div>
                  <div className="kanban-card-list">
                    {kanbanGroups.open.map(kanbanIssueCard)}
                    {kanbanGroups.open.length === 0 && <p className="kanban-empty-col">No issues</p>}
                  </div>
                </div>
                <div className="kanban-col is-active">
                  <div className="kanban-col-header">
                    <span className="kanban-col-title">In Progress</span>
                    <span className="kanban-col-count">{kanbanGroups.inProgress.length}</span>
                  </div>
                  <div className="kanban-card-list">
                    {kanbanGroups.inProgress.map(kanbanIssueCard)}
                    {kanbanGroups.inProgress.length === 0 && <p className="kanban-empty-col">No issues</p>}
                  </div>
                </div>
                <div className="kanban-col">
                  <div className="kanban-col-header">
                    <span className="kanban-col-title">Resolved</span>
                    <span className="kanban-col-count">{kanbanGroups.resolved.length}</span>
                  </div>
                  <div className="kanban-card-list">
                    {kanbanGroups.resolved.map(kanbanIssueCard)}
                    {kanbanGroups.resolved.length === 0 && <p className="kanban-empty-col">No issues</p>}
                  </div>
                </div>
                <div className="kanban-col is-done">
                  <div className="kanban-col-header">
                    <span className="kanban-col-title">Closed</span>
                    <span className="kanban-col-count">{kanbanGroups.closed.length}</span>
                  </div>
                  <div className="kanban-card-list">
                    {kanbanGroups.closed.map(kanbanIssueCard)}
                    {kanbanGroups.closed.length === 0 && <p className="kanban-empty-col">No issues</p>}
                  </div>
                </div>
              </div>
            ) : (
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
                    {filteredIssues.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-row">
                          No issues match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredIssues.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Link href={`/issues/${item.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
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
            )}
          </>
        )}
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setStatus(null);
        }}
        title="Create issue"
      >
        <div className="workflow-form-grid">
          <div className="field-wrap">
            <label htmlFor="issue-project" className="field-label">Project</label>
            <select
              id="issue-project"
              className="text-input"
              value={projectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              disabled={isSubmitting}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="field-wrap">
            <label htmlFor="issue-task" className="field-label">Linked task</label>
            <select
              id="issue-task"
              className="text-input"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">None</option>
              {filteredTaskOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>

          <div className="field-wrap">
            <label htmlFor="issue-assignee" className="field-label">Assignee</label>
            <select
              id="issue-assignee"
              className="text-input"
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Unassigned</option>
              {assignees.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <TextField
            id="issue-title"
            label="Issue title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (status?.tone === "error") setStatus(null);
            }}
            placeholder="Email delivery fails for invitations"
            disabled={isSubmitting}
            required
          />

          <div className="field-wrap workflow-span-all">
            <label htmlFor="issue-description" className="field-label">Description</label>
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
      </Modal>
    </section>
  );
}
