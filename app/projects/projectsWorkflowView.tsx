"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiArchive, FiEdit2, FiEye, FiEyeOff, FiPlus, FiRotateCcw, FiX } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";
import Modal from "@/app/ui/modal";
import TextField from "@/app/ui/textField";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import {
  archiveProject,
  createProject,
  restoreProject,
  setProjectFollow,
  updateProject,
  listArchivedProjects,
  type ProjectWorkflowItem,
} from "@/services/workflow.service";

interface ProjectsWorkflowViewProps {
  projects: ProjectWorkflowItem[];
}

function formatDate(isoDate: string): string {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) return "Unknown";
  return parsedDate.toLocaleDateString();
}

function validateProjectName(rawProjectName: string): string | undefined {
  const normalizedName = rawProjectName.trim().replace(/\s+/g, " ");
  if (!normalizedName) return "Project name is required.";
  if (normalizedName.length < 3) return "Project name must be at least 3 characters.";
  return undefined;
}

export default function ProjectsWorkflowView({
  projects,
}: ProjectsWorkflowViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isArchivingId, setIsArchivingId] = useState<number | null>(null);
  const [isTogglingFollowId, setIsTogglingFollowId] = useState<number | null>(null);
  const [isEditingId, setIsEditingId] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [isSavingEditId, setIsSavingEditId] = useState<number | null>(null);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<number | null>(null);
  const [archivedProjects, setArchivedProjects] = useState<ProjectWorkflowItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const summary = useMemo(() => {
    return projects.reduce(
      (result, item) => {
        result.totalTasks += item.taskCount;
        result.totalOpenIssues += item.openIssueCount;
        return result;
      },
      { totalTasks: 0, totalOpenIssues: 0 },
    );
  }, [projects]);

  const handleCreateProject = async (): Promise<void> => {
    const validationError = validateProjectName(projectName);
    if (validationError) {
      setStatus({ tone: "error", message: validationError });
      toast.error(validationError);
      return;
    }

    setIsCreating(true);
    try {
      await createProject(projectName);
      setProjectName("");
      toast.success("Project created");
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create project.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleFollow = async (projectId: number, follow: boolean): Promise<void> => {
    setIsTogglingFollowId(projectId);
    try {
      await setProjectFollow(projectId, follow);
      setStatus({ tone: "success", message: follow ? "Project followed." : "Project unfollowed." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update follow state.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsTogglingFollowId(null);
    }
  };

  const handleArchiveRequest = (projectId: number): void => {
    setConfirmArchiveId(projectId);
  };

  const handleArchiveConfirm = async (): Promise<void> => {
    if (confirmArchiveId === null) return;
    const projectId = confirmArchiveId;
    setConfirmArchiveId(null);
    setIsArchivingId(projectId);
    try {
      await archiveProject(projectId);
      setStatus({ tone: "success", message: "Project archived." });
      toast.success("Project archived");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to archive project.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsArchivingId(null);
    }
  };

  const handleShowArchived = async (): Promise<void> => {
    setShowArchived(true);
    setLoadingArchived(true);
    try {
      const archived = await listArchivedProjects();
      setArchivedProjects(archived);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load archived projects.";
      toast.error(message);
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleRestoreProject = async (projectId: number): Promise<void> => {
    setRestoringId(projectId);
    try {
      await restoreProject(projectId);
      toast.success("Project restored");
      setArchivedProjects((prev) => prev.filter((p) => p.id !== projectId));
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore project.";
      toast.error(message);
    } finally {
      setRestoringId(null);
    }
  };

  const handleStartEditProject = (item: ProjectWorkflowItem): void => {
    setEditProjectName(item.name);
    setIsEditingId(item.id);
  };

  const handleCancelEditProject = (): void => {
    setIsEditingId(null);
    setEditProjectName("");
  };

  const handleSaveEditProject = async (projectId: number): Promise<void> => {
    if (!editProjectName.trim()) {
      toast.error("Project name is required.");
      return;
    }

    setIsSavingEditId(projectId);
    try {
      await updateProject(projectId, editProjectName.trim());
      setIsEditingId(null);
      setEditProjectName("");
      toast.success("Project renamed");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to rename project.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSavingEditId(null);
    }
  };

  return (
    <section className="workflow-stack">
      <div className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Active projects</p>
          <p className="kpi-value">{projects.length}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Tracked tasks</p>
          <p className="kpi-value">{summary.totalTasks}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Open issues</p>
          <p className="kpi-value">{summary.totalOpenIssues}</p>
        </article>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Project workflow board</h2>
          <div className="card-controls">
            <AppButton
              onClick={handleShowArchived}
              variant="ghost"
              startIcon={<FiArchive aria-hidden="true" />}
            >
              Archived
            </AppButton>
            <AppButton
              onClick={() => setIsModalOpen(true)}
              startIcon={<FiPlus aria-hidden="true" />}
            >
              Create project
            </AppButton>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Tasks</th>
                <th scope="col">Open issues</th>
                <th scope="col">Created</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No projects yet.
                  </td>
                </tr>
              ) : (
                projects.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {isEditingId === item.id ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            className="text-input"
                            value={editProjectName}
                            onChange={(e) => setEditProjectName(e.target.value)}
                            disabled={isSavingEditId === item.id}
                            style={{ width: "200px" }}
                          />
                          <AppButton
                            variant="ghost"
                            onClick={() => void handleSaveEditProject(item.id)}
                            disabled={isSavingEditId === item.id}
                            isLoading={isSavingEditId === item.id}
                            loadingLabel="Saving..."
                          >
                            Save
                          </AppButton>
                          <AppButton
                            variant="ghost"
                            onClick={handleCancelEditProject}
                            disabled={isSavingEditId === item.id}
                          >
                            Cancel
                          </AppButton>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <Link href="/tasks" className="text-link" style={{ fontSize: "0.82rem" }}>
                            {item.name}
                          </Link>
                          <button
                            onClick={() => handleStartEditProject(item)}
                            className="text-link-button"
                            title="Rename"
                          >
                            <FiEdit2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{item.taskCount}</td>
                    <td>{item.openIssueCount}</td>
                    <td>{formatDate(item.createdAt)}</td>
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
                          onClick={() => handleArchiveRequest(item.id)}
                          isLoading={isArchivingId === item.id}
                          loadingLabel="Archiving..."
                          startIcon={<FiArchive aria-hidden="true" />}
                        >
                          Archive
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

      {showArchived && (
        <section className="card">
          <div className="card-header">
            <h2>Archived projects</h2>
            <AppButton
              variant="ghost"
              onClick={() => setShowArchived(false)}
              startIcon={<FiX aria-hidden="true" />}
            >
              Close
            </AppButton>
          </div>

          {loadingArchived ? (
            <p className="empty-row" style={{ padding: "1rem" }}>Loading...</p>
          ) : archivedProjects.length === 0 ? (
            <p className="empty-row" style={{ padding: "1rem" }}>No archived projects.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Created</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedProjects.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <AppButton
                          variant="secondary"
                          onClick={() => handleRestoreProject(item.id)}
                          isLoading={restoringId === item.id}
                          loadingLabel="Restoring..."
                          startIcon={<FiRotateCcw aria-hidden="true" />}
                        >
                          Restore
                        </AppButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setProjectName("");
          setStatus(null);
        }}
        title="Create project"
      >
        <div className="workflow-form">
          <TextField
            id="projectName"
            label="Project name"
            placeholder="Customer portal refresh"
            value={projectName}
            onChange={(event) => {
              setProjectName(event.target.value);
              if (status?.tone === "error") setStatus(null);
            }}
            disabled={isCreating}
            required
          />
          <AppButton
            onClick={handleCreateProject}
            isLoading={isCreating}
            loadingLabel="Creating..."
            startIcon={<FiPlus aria-hidden="true" />}
          >
            Create project
          </AppButton>
        </div>
        <InlineStatus
          tone={status?.tone ?? "info"}
          message={status?.message ?? null}
        />
      </Modal>

      {/* Archive confirmation dialog */}
      {confirmArchiveId !== null && (
        <div className="confirm-overlay" onClick={() => setConfirmArchiveId(null)}>
          <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Archive project</h3>
            <p>
              This will hide the project and its tasks/issues from the active workflow.
              You can restore it from the archived list later.
            </p>
            <div className="confirm-actions">
              <AppButton variant="ghost" onClick={() => setConfirmArchiveId(null)}>
                Cancel
              </AppButton>
              <AppButton variant="primary" onClick={() => void handleArchiveConfirm()}>
                Archive
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
