"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiEdit2, FiTrash2, FiHeart, FiEye, FiPaperclip, FiDownload } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { formatDateTime, formatDueDate, getInitials, getAvatarColorByLabel } from "@/lib/utils";
import { AVATAR_COLORS } from "@/lib/constants";
import {
  createTaskAction,
  deleteTaskAction,
} from "@/services/action.service";
import {
  addTaskComment,
  deleteTaskComment,
  editTaskComment,
  advanceTaskStatus,
  setTaskFollow,
  updateTask,
  type TaskDetailItem,
} from "@/services/workflow.service";

interface TaskDetailViewProps {
  task: TaskDetailItem;
  hideBackLink?: boolean;
}

function taskStatusLabel(status: TaskDetailItem["status"]): string {
  if (status === "not_started") {
    return "Not started";
  }

  if (status === "in_progress") {
    return "In progress";
  }

  return "Completed";
}

export default function TaskDetailView({ task, hideBackLink = false }: TaskDetailViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(task.isFollowing);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [isDeletingCommentId, setIsDeletingCommentId] = useState<number | null>(null);
  const [isEditingCommentId, setIsEditingCommentId] = useState<number | null>(null);
  const [actionName, setActionName] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [isDeletingActionId, setIsDeletingActionId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? "");
  const [editDueOn, setEditDueOn] = useState(task.dueAt?.slice(0, 10) ?? "");

  const handleStartEdit = (): void => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditDueOn(task.dueAt?.slice(0, 10) ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = (): void => {
    setIsEditing(false);
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (!editTitle.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setIsEditing(false);

    try {
      router.refresh(); // optimistic
      await updateTask(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        dueOn: editDueOn,
      });
      toast.success("Task updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update task.";
      toast.error(message);
      router.refresh();
    }
  };

  const handleAdvanceTask = async (): Promise<void> => {
    setIsAdvancing(true);
    try {
      await advanceTaskStatus(task.id);
      toast.success("Task updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update task.";
      toast.error(message);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleToggleFollow = async (): Promise<void> => {
    setIsTogglingFollow(true);
    try {
      await setTaskFollow(task.id, !isFollowing);
      setIsFollowing(!isFollowing);
      toast.success(isFollowing ? "Unfollowed" : "Following");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to toggle follow.";
      toast.error(message);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleAddComment = async (): Promise<void> => {
    const trimmedComment = commentDraft.trim();
    if (!trimmedComment) {
      toast.error("Comment cannot be empty.");
      return;
    }

    setIsAddingComment(true);
    try {
      await addTaskComment(task.id, trimmedComment);
      setCommentDraft("");
      toast.success("Comment added");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add comment.";
      toast.error(message);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleEditComment = (commentId: number, currentBody: string): void => {
    setEditingCommentId(commentId);
    setEditingCommentBody(currentBody);
  };

  const handleSaveEditComment = async (commentId: number): Promise<void> => {
    if (!editingCommentBody.trim()) {
      toast.error("Comment cannot be empty.");
      return;
    }

    setIsEditingCommentId(commentId);
    try {
      await editTaskComment(commentId, editingCommentBody);
      setEditingCommentId(null);
      setEditingCommentBody("");
      toast.success("Comment updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to edit comment.";
      toast.error(message);
    } finally {
      setIsEditingCommentId(null);
    }
  };

  const handleDeleteComment = async (commentId: number): Promise<void> => {
    setIsDeletingCommentId(commentId);
    try {
      await deleteTaskComment(commentId);
      toast.success("Comment deleted");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete comment.";
      toast.error(message);
    } finally {
      setIsDeletingCommentId(null);
    }
  };

  const handleAddAction = async (): Promise<void> => {
    const trimmedName = actionName.trim();
    if (!trimmedName) {
      toast.error("Action name is required.");
      return;
    }

    setIsAddingAction(true);
    try {
      await createTaskAction(task.id, task.projectId, trimmedName, actionDescription.trim() || undefined);
      setActionName("");
      setActionDescription("");
      toast.success("Action added");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add action.";
      toast.error(message);
    } finally {
      setIsAddingAction(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10 MB limit.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("taskId", String(task.id));
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed.");
      }
      toast.success("File uploaded");
      setFileInputKey((k) => k + 1);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload file.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const handleDeleteAction = async (actionId: number): Promise<void> => {
    setIsDeletingActionId(actionId);
    try {
      await deleteTaskAction(actionId);
      toast.success("Action deleted");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete action.";
      toast.error(message);
    } finally {
      setIsDeletingActionId(null);
    }
  };

  return (
    <section className="workflow-stack">
      {/* Back Navigation */}
      {!hideBackLink && (
        <Link href="/tasks" className="text-link" style={{ marginBottom: 0 }}>
          <span className="icon-with-label"><FiArrowLeft /> Back</span>
        </Link>
      )}

      {/* Main Content */}
      <section className="card">
        <div className="card-header">
          <div>
            {isEditing ? (
              <input
                className="text-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ fontSize: "1.2rem", fontWeight: 650, width: "100%" }}
              />
            ) : (
              <>
                <h1>{task.title}</h1>
                <p className="workflow-subtext">{task.projectName}</p>
              </>
            )}
          </div>
          <div className="card-controls">
            {isEditing ? (
              <div className="button-row">
                <AppButton variant="ghost" onClick={handleCancelEdit}>Cancel</AppButton>
                <AppButton onClick={() => void handleSaveEdit()}>Save</AppButton>
              </div>
            ) : (
              <AppButton variant="ghost" onClick={handleStartEdit} startIcon={<FiEdit2 aria-hidden="true" />}>
                Edit
              </AppButton>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <div className="field-wrap">
            <label className="field-label">Status</label>
            <p style={{ fontWeight: "500" }}>{taskStatusLabel(task.status)}</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Assignee</label>
            <p>{task.assigneeName ?? "Unassigned"}</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Due Date</label>
            {isEditing ? (
              <input
                type="date"
                className="text-input"
                value={editDueOn}
                onChange={(e) => setEditDueOn(e.target.value)}
              />
            ) : (
              <p>{formatDueDate(task.dueAt)}</p>
            )}
          </div>

          <div
            className="field-wrap"
            style={{ gridColumn: "1 / -1" }}
          >
            <label className="field-label">Description</label>
            {isEditing ? (
              <textarea
                className="text-input"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            ) : task.description ? (
              <p>{task.description}</p>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No description.</p>
            )}
          </div>

          <div className="field-wrap">
            <label className="field-label">Created</label>
            <p>
              {formatDateTime(task.createdAt)} by <strong>{task.createdByUserName}</strong>
            </p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Progress</label>
            <AppButton
              onClick={() => void handleAdvanceTask()}
              disabled={task.status === "completed" || isAdvancing}
              isLoading={isAdvancing}
              loadingLabel="Updating..."
              variant="ghost"
              style={{ alignSelf: "start" }}
            >
              {task.status === "not_started" ? "Start" : task.status === "in_progress" ? "Mark Complete" : "Completed"}
            </AppButton>
          </div>

          <div className="field-wrap">
            <label className="field-label">Follow</label>
            <AppButton
              onClick={() => void handleToggleFollow()}
              disabled={isTogglingFollow}
              isLoading={isTogglingFollow}
              loadingLabel={isFollowing ? "Unfollowing..." : "Following..."}
              startIcon={isFollowing ? <FiHeart aria-hidden="true" /> : <FiEye aria-hidden="true" />}
              variant="ghost"
              style={{ alignSelf: "start" }}
            >
              {isFollowing ? "Following" : "Follow"}
            </AppButton>
          </div>
        </div>
      </section>

      {/* Comments Section */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Comments ({task.comments.length})</h2>
          </div>
        </div>

        <div className="workflow-stack">
          {/* Comment Thread */}
          <div className="slack-thread">
            {task.comments.length === 0 ? (
              <p className="empty-row">No comments yet.</p>
            ) : (
              task.comments.map((comment) => (
                <div key={comment.id} className="slack-message">
                  <div
                    className="slack-avatar"
                    style={{ background: getAvatarColorByLabel(comment.authorLabel, AVATAR_COLORS) }}
                  >
                    {getInitials(comment.authorLabel)}
                  </div>
                  <div className="slack-body">
                    <div className="slack-header">
                      <span className="slack-author">{comment.authorLabel}</span>
                      <span className="slack-timestamp">
                        {formatDateTime(comment.createdAt)}
                        {comment.isEdited ? " (edited)" : ""}
                      </span>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.3rem" }}>
                        <textarea
                          className="text-input"
                          value={editingCommentBody}
                          onChange={(e) => setEditingCommentBody(e.target.value)}
                          disabled={isEditingCommentId === comment.id}
                        />
                        <div className="button-row">
                          <AppButton
                            variant="ghost"
                            onClick={() => void handleSaveEditComment(comment.id)}
                            disabled={isEditingCommentId === comment.id}
                            isLoading={isEditingCommentId === comment.id}
                            loadingLabel="Saving..."
                          >
                            Save
                          </AppButton>
                          <AppButton
                            variant="ghost"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentBody("");
                            }}
                            disabled={isEditingCommentId === comment.id}
                          >
                            Cancel
                          </AppButton>
                        </div>
                      </div>
                    ) : (
                      <div className="slack-text">{comment.body}</div>
                    )}
                  </div>
                  {comment.isOwn && editingCommentId !== comment.id && (
                    <div className="slack-actions">
                      <button
                        onClick={() => handleEditComment(comment.id, comment.body)}
                        className="slack-action-btn"
                        title="Edit"
                      >
                        <FiEdit2 size={13} />
                      </button>
                      <button
                        onClick={() => void handleDeleteComment(comment.id)}
                        disabled={isDeletingCommentId === comment.id}
                        className="slack-action-btn is-danger"
                        title="Delete"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  )}
                  {comment.isOwn && editingCommentId === comment.id && null}
                </div>
              ))
            )}
          </div>

          {/* Add Comment Form - like Slack input bar */}
          <div className="slack-input-bar">
            <textarea
              id="comment-input"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              disabled={isAddingComment}
              placeholder="Write a message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (commentDraft.trim()) {
                    void handleAddComment();
                  }
                }
              }}
            />
            <AppButton
              onClick={() => void handleAddComment()}
              disabled={isAddingComment || !commentDraft.trim()}
              isLoading={isAddingComment}
              loadingLabel="Sending..."
            >
              Send
            </AppButton>
          </div>
        </div>
      </section>

      {/* Actions Section */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Actions ({task.actions.length})</h2>
          </div>
        </div>

        <div className="workflow-stack">
          {/* Add Action Form - at the top */}
          <div className="workflow-form">
            <div className="field-wrap" style={{ flex: 1 }}>
              <input
                id="action-name-input"
                className="text-input"
                value={actionName}
                onChange={(e) => setActionName(e.target.value)}
                disabled={isAddingAction}
                placeholder="Action name"
              />
            </div>
            <div className="field-wrap" style={{ flex: 1 }}>
              <input
                id="action-desc-input"
                className="text-input"
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
                disabled={isAddingAction}
                placeholder="Description (optional)"
              />
            </div>
            <AppButton
              onClick={() => void handleAddAction()}
              disabled={isAddingAction || !actionName.trim()}
              isLoading={isAddingAction}
              loadingLabel="Adding..."
            >
              Add
            </AppButton>
          </div>

          {task.actions.length === 0 ? (
            <p className="empty-row">No actions yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Description</th>
                    <th scope="col">Created By</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {task.actions.map((act) => (
                    <tr key={act.id}>
                      <td style={{ fontWeight: "500" }}>{act.name}</td>
                      <td>{act.description ?? "—"}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{act.authorLabel}</td>
                      <td>
                        {act.isOwn && (
                          <AppButton
                            onClick={() => void handleDeleteAction(act.id)}
                            disabled={isDeletingActionId === act.id}
                            isLoading={isDeletingActionId === act.id}
                            loadingLabel="Deleting..."
                            variant="ghost"
                          >
                            Delete
                          </AppButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Attachments Section */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Attachments ({task.attachments.length})</h2>
          </div>
        </div>

        <div className="workflow-stack">
          {/* Upload Form */}
          <div className="workflow-form">
            <input
              key={fileInputKey}
              type="file"
              id="file-upload-input"
              onChange={(e) => void handleUpload(e)}
              disabled={isUploading}
              style={{ display: "none" }}
            />
            <AppButton
              onClick={() => document.getElementById("file-upload-input")?.click()}
              disabled={isUploading}
              isLoading={isUploading}
              loadingLabel="Uploading..."
              startIcon={<FiPaperclip aria-hidden="true" />}
            >
              Attach File
            </AppButton>
            {isUploading && <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Uploading...</span>}
          </div>

          {task.attachments.length === 0 ? (
            <p className="empty-row">No attachments.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Size</th>
                    <th scope="col">Uploaded</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {task.attachments.map((att) => (
                    <tr key={att.id}>
                      <td style={{ fontWeight: "500" }}>{att.fileName}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{formatFileSize(att.sizeBytes)}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{formatDateTime(att.createdAt)}</td>
                      <td>
                        <a
                          href={`/api/uploads/${att.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link"
                        >
                          <span className="icon-with-label"><FiDownload /> Download</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
