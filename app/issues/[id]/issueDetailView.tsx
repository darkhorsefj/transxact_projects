"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiEdit2, FiTrash2, FiHeart, FiEye, FiPaperclip, FiDownload } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import { formatDateTime } from "@/lib/utils";
import {
  addIssueComment,
  deleteIssueComment,
  editIssueComment,
  advanceIssueStatus,
  setIssueFollow,
  updateIssue,
  type IssueDetailItem,
} from "@/services/workflow.service";

interface IssueDetailViewProps {
  issue: IssueDetailItem;
}

function issueStatusLabel(status: IssueDetailItem["status"]): string {
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

export default function IssueDetailView({ issue }: IssueDetailViewProps): ReactElement {
  useSseRefresh();
  const router = useRouter();
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(issue.isFollowing);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [isDeletingCommentId, setIsDeletingCommentId] = useState<number | null>(null);
  const [isEditingCommentId, setIsEditingCommentId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(issue.title);
  const [editDescription, setEditDescription] = useState(issue.description ?? "");

  const handleStartEdit = (): void => {
    setEditTitle(issue.title);
    setEditDescription(issue.description ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = (): void => {
    setIsEditing(false);
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (!editTitle.trim()) {
      toast.error("Issue title is required.");
      return;
    }

    setIsEditing(false);

    try {
      router.refresh();
      await updateIssue(issue.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      toast.success("Issue updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update issue.";
      toast.error(message);
      router.refresh();
    }
  };

  const handleAdvanceIssue = async (): Promise<void> => {
    setIsAdvancing(true);
    try {
      await advanceIssueStatus(issue.id);
      toast.success("Issue updated");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update issue.";
      toast.error(message);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleToggleFollow = async (): Promise<void> => {
    setIsTogglingFollow(true);
    try {
      await setIssueFollow(issue.id, !isFollowing);
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
      await addIssueComment(issue.id, trimmedComment);
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
      await editIssueComment(commentId, editingCommentBody);
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
      await deleteIssueComment(commentId);
      toast.success("Comment deleted");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete comment.";
      toast.error(message);
    } finally {
      setIsDeletingCommentId(null);
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
      formData.append("issueId", String(issue.id));
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

  return (
    <section className="workflow-stack">
      {/* Back Navigation */}
      <Link href="/issues" className="text-link" style={{ marginBottom: 0 }}>
        <span className="icon-with-label"><FiArrowLeft /> Back</span>
      </Link>

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
                <h1>{issue.title}</h1>
                <p className="workflow-subtext">{issue.projectName}</p>
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
            <p style={{ fontWeight: "500" }}>{issueStatusLabel(issue.status)}</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Assignee</label>
            <p>{issue.assigneeName ?? "Unassigned"}</p>
          </div>

          {issue.taskId && (
            <div className="field-wrap">
              <label className="field-label">Related Task</label>
              <Link href={`/tasks/${issue.taskId}`} className="text-link">
                {issue.taskTitle}
              </Link>
            </div>
          )}

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
            ) : issue.description ? (
              <p>{issue.description}</p>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No description.</p>
            )}
          </div>

          <div className="field-wrap">
            <label className="field-label">Created</label>
            <p>
              {formatDateTime(issue.createdAt)} by <strong>{issue.createdByUserName}</strong>
            </p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Progress</label>
            <AppButton
              onClick={() => void handleAdvanceIssue()}
              disabled={issue.status === "closed" || isAdvancing}
              isLoading={isAdvancing}
              loadingLabel="Updating..."
              variant="ghost"
              style={{ alignSelf: "start" }}
            >
              Next Step
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
            <h2>Comments ({issue.comments.length})</h2>
          </div>
        </div>

        <div className="workflow-stack">
          {/* Comment Thread */}
          <div className="messages-thread">
            {issue.comments.length === 0 ? (
              <p className="empty-row">No comments yet.</p>
            ) : (
              issue.comments.map((comment) => (
                <article
                  key={comment.id}
                  className={`message-bubble ${comment.isOwn ? "is-own" : ""}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div style={{ flex: 1 }}>
                      <p className="message-meta">
                        <strong>{comment.authorLabel}</strong> · {formatDateTime(comment.createdAt)}
                        {comment.isEdited ? " · edited" : ""}
                      </p>
                      {editingCommentId === comment.id ? (
                        <textarea
                          className="text-input"
                          style={{ marginTop: "0.5rem" }}
                          value={editingCommentBody}
                          onChange={(e) => setEditingCommentBody(e.target.value)}
                          disabled={isEditingCommentId === comment.id}
                        />
                      ) : (
                        <p>{comment.body}</p>
                      )}
                    </div>
                    {comment.isOwn && (
                      <div className="workflow-actions" style={{ marginLeft: "1rem" }}>
                        {editingCommentId === comment.id ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditComment(comment.id, comment.body)}
                              disabled={isDeletingCommentId === comment.id}
                              className="text-link-button"
                              title="Edit comment"
                            >
                              <FiEdit2 size={16} />
                            </button>
                            <button
                              onClick={() => void handleDeleteComment(comment.id)}
                              disabled={isDeletingCommentId === comment.id}
                              className="text-link-button"
                              style={{ color: "var(--error)" }}
                              title="Delete comment"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Add Comment Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label htmlFor="comment-input" className="field-label">
              Add Comment
            </label>
            <div style={{ display: "flex", alignItems: "end", gap: "0.35rem" }}>
              <textarea
                id="comment-input"
                className="text-input workflow-textarea"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                disabled={isAddingComment}
                placeholder="Share context or updates..."
              />
              <AppButton
                onClick={() => void handleAddComment()}
                disabled={isAddingComment || !commentDraft.trim()}
                isLoading={isAddingComment}
                loadingLabel="Adding..."
              >
                Post Comment
              </AppButton>
            </div>
          </div>
        </div>
      </section>

      {/* Attachments Section */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Attachments ({issue.attachments.length})</h2>
          </div>
        </div>

        <div className="workflow-stack">
          <div className="workflow-form">
            <input
              key={fileInputKey}
              type="file"
              id="issue-file-upload-input"
              onChange={(e) => void handleUpload(e)}
              disabled={isUploading}
              style={{ display: "none" }}
            />
            <AppButton
              onClick={() => document.getElementById("issue-file-upload-input")?.click()}
              disabled={isUploading}
              isLoading={isUploading}
              loadingLabel="Uploading..."
              startIcon={<FiPaperclip aria-hidden="true" />}
            >
              Attach File
            </AppButton>
            {isUploading && <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Uploading...</span>}
          </div>

          {issue.attachments.length === 0 ? (
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
                  {issue.attachments.map((att) => (
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
