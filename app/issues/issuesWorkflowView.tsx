"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiArrowLeft, FiChevronsRight, FiColumns, FiEye, FiEyeOff, FiList, FiPaperclip, FiPlus, FiSearch } from "react-icons/fi";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
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

const viewToggleBtnClass = "inline-flex items-center gap-1 border-0 bg-accent text-muted-foreground cursor-pointer text-sm font-semibold px-2 py-1.5 transition-colors hover:bg-muted hover:text-foreground";
const viewToggleBtnActiveClass = "bg-primary/10 text-primary";

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
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const result = await createIssue({
        projectId: Number(projectId),
        taskId: taskId ? Number(taskId) : undefined,
        assigneeUserId: assigneeUserId ? Number(assigneeUserId) : undefined,
        title: normalizedTitle,
        description,
      });

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("issueId", String(result.id));
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error ?? "File upload failed. Issue was created.");
        }
      }

      setFile(null);
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
      <div key={item.id} className="border rounded-md bg-card p-1.5 flex flex-col gap-0.5 transition-shadow hover:shadow-sm">
        <Link href={`/issues/${item.id}`} className="font-semibold text-sm text-foreground hover:text-primary leading-tight no-underline">
          {item.title}
        </Link>
        {item.description ? (
          <div className="text-xs text-muted-foreground line-clamp-1 leading-tight">{item.description}</div>
        ) : null}
        <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.projectName}</span>
          {item.taskTitle && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.taskTitle}</span>}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{item.assigneeName ?? "Unassigned"}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5 pt-0.5 border-t">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleToggleFollow(item.id, !item.isFollowing)}
                  disabled={isTogglingFollowId === item.id}
                  className="inline-flex items-center justify-center w-6 h-6 rounded border-0 bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.isFollowing ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{item.isFollowing ? "Unfollow" : "Follow"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5">
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
    <section className="flex flex-col gap-2 min-h-0">
      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <h2>Issues</h2>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex border rounded-md overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`${viewToggleBtnClass} ${viewMode === "table" ? viewToggleBtnActiveClass : ""}`}
                    onClick={() => setViewMode("table")}
                  >
                    <FiList size={14} />
                    <span>Table</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Table view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`${viewToggleBtnClass} ${viewMode === "kanban" ? viewToggleBtnActiveClass : ""}`}
                    onClick={() => setViewMode("kanban")}
                  >
                    <FiColumns size={14} />
                    <span>Board</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Kanban view</TooltipContent>
              </Tooltip>
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
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="text-muted-foreground opacity-40">
              <FiSearch size={32} aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold">No issues yet</p>
            <p>Create your first issue to track problems and bugs.</p>
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
                  placeholder="Search issues..."
                />
              </div>
              <select
                className="min-w-40 border rounded-md bg-accent text-foreground text-sm px-2 py-1.5 transition-colors focus:border-primary"
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
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredIssues.length} of {issues.length}
              </span>
            </div>

            {viewMode === "kanban" ? (
              <div className="flex gap-2 overflow-x-auto pb-0.5 flex-1 min-h-0 w-full">
                <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-blue-50 dark:bg-blue-950/30">
                  <div className="flex items-center gap-1 px-0.5">
                    <span className="font-semibold text-sm">Open</span>
                    <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{kanbanGroups.open.length}</span>
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                    {kanbanGroups.open.map(kanbanIssueCard)}
                    {kanbanGroups.open.length === 0 && <p className="px-0.5 text-sm text-muted-foreground">No issues</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1 px-0.5">
                    <span className="font-semibold text-sm">In Progress</span>
                    <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{kanbanGroups.inProgress.length}</span>
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                    {kanbanGroups.inProgress.map(kanbanIssueCard)}
                    {kanbanGroups.inProgress.length === 0 && <p className="px-0.5 text-sm text-muted-foreground">No issues</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0">
                  <div className="flex items-center gap-1 px-0.5">
                    <span className="font-semibold text-sm">Resolved</span>
                    <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{kanbanGroups.resolved.length}</span>
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                    {kanbanGroups.resolved.map(kanbanIssueCard)}
                    {kanbanGroups.resolved.length === 0 && <p className="px-0.5 text-sm text-muted-foreground">No issues</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-56 flex-1 rounded-md p-1.5 min-h-0 bg-emerald-50 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-1 px-0.5">
                    <span className="font-semibold text-sm">Closed</span>
                    <span className="text-xs font-semibold rounded-full px-1.5 leading-snug">{kanbanGroups.closed.length}</span>
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                    {kanbanGroups.closed.map(kanbanIssueCard)}
                    {kanbanGroups.closed.length === 0 && <p className="px-0.5 text-sm text-muted-foreground">No issues</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-64 overflow-auto border rounded-md">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Issue</th>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Project</th>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Task</th>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Assignee</th>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Status</th>
                      <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted-foreground text-center border-b px-2 py-1.5 text-left">
                          No issues match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredIssues.map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-accent">
                          <td className="border-b px-2 py-1.5 text-left">
                            <Link href={`/issues/${item.id}`} className="no-underline text-inherit block">
                              <div className="font-semibold">{item.title}</div>
                              {item.description ? (
                                <p className="mt-1 text-muted-foreground text-xs">{item.description}</p>
                              ) : null}
                            </Link>
                          </td>
                          <td className="border-b px-2 py-1.5 text-left">{item.projectName}</td>
                          <td className="border-b px-2 py-1.5 text-left">{item.taskTitle ?? "-"}</td>
                          <td className="border-b px-2 py-1.5 text-left">{item.assigneeName ?? "Unassigned"}</td>
                          <td className="border-b px-2 py-1.5 text-left">
                            <span className="inline-flex items-center border rounded-full bg-accent text-muted-foreground text-xs font-semibold px-1.5 py-0.5">
                              {issueStatusLabel(item.status)}
                            </span>
                          </td>
                          <td className="border-b px-2 py-1.5 text-left">
                            <div className="flex items-center gap-1.5">
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
          setFile(null);
          setStatus(null);
        }}
        title="Create issue"
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="issue-project" className="text-sm font-semibold text-muted-foreground">Project</label>
            <select
              id="issue-project"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
              value={projectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              disabled={isSubmitting}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="issue-task" className="text-sm font-semibold text-muted-foreground">Linked task</label>
            <select
              id="issue-task"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
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

          <div className="flex flex-col gap-1">
            <label htmlFor="issue-assignee" className="text-sm font-semibold text-muted-foreground">Assignee</label>
            <select
              id="issue-assignee"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
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

          <div className="flex flex-col gap-1 col-span-2">
            <label htmlFor="issue-description" className="text-sm font-semibold text-muted-foreground">Description</label>
            <textarea
              id="issue-description"
              className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-16 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional troubleshooting context and expected behavior."
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
              id="issue-file-input"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
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
