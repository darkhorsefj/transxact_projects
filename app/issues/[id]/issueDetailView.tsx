"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiEdit2, FiTrash2, FiHeart, FiEye } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import {
  addIssueComment,
  deleteIssueComment,
  editIssueComment,
  advanceIssueStatus,
  setIssueFollow,
  type IssueDetailItem,
} from "@/services/workflow.service";

interface IssueDetailViewProps {
  issue: IssueDetailItem;
}

function formatDateTime(isoDate: string): string {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return parsedDate.toLocaleString();
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
            <h1>{issue.title}</h1>
            <p className="workflow-subtext">{issue.projectName}</p>
          </div>
        </div>

        <div className="workflow-form">
          {/* Metadata Row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2rem" }}>
            <div className="field-wrap">
              <label className="field-label">Status</label>
              <p style={{ fontWeight: "500" }}>{issueStatusLabel(issue.status)}</p>
              <AppButton
                onClick={() => void handleAdvanceIssue()}
                disabled={issue.status === "closed" || isAdvancing}
                isLoading={isAdvancing}
                loadingLabel="Updating..."
                style={{ marginTop: "0.5rem", width: "100%" }}
              >
                Next Step
              </AppButton>
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
          </div>

          {/* Description */}
          {issue.description && (
            <div className="field-wrap workflow-span-all">
              <label className="field-label">Description</label>
              <p>{issue.description}</p>
            </div>
          )}

          {/* Meta Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            <div className="field-wrap">
              <label className="field-label">Created</label>
              <p>
                {formatDateTime(issue.createdAt)} by <strong>{issue.createdByUserName}</strong>
              </p>
            </div>

            <div className="field-wrap">
              <label className="field-label">Actions</label>
              <AppButton
                onClick={() => void handleToggleFollow()}
                disabled={isTogglingFollow}
                isLoading={isTogglingFollow}
                loadingLabel={isFollowing ? "Unfollowing..." : "Following..."}
                startIcon={isFollowing ? <FiHeart aria-hidden="true" /> : <FiEye aria-hidden="true" />}
                style={{ width: "100%" }}
              >
                {isFollowing ? "Following" : "Follow"}
              </AppButton>
            </div>
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
          <div className="workflow-form">
            <div className="field-wrap workflow-span-all">
              <label htmlFor="comment-input" className="field-label">
                Add Comment
              </label>
              <textarea
                id="comment-input"
                className="text-input workflow-textarea"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                disabled={isAddingComment}
                placeholder="Share context or updates..."
              />
            </div>

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
      </section>
    </section>
  );
}
