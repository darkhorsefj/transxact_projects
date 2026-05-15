"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import Modal from "@/app/ui/modal";
import {
  getTaskComments,
  addTaskComment,
  deleteTaskComment,
  editTaskComment,
  markTaskCommentsRead,
  type WorkItemCommentThreadItem,
} from "@/services/workflow.service";

interface TaskCommentModalProps {
  taskId: number;
  taskTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_COLORS = [
  "var(--brand)",
  "#e07c3c",
  "#4c9a5e",
  "#8b5cf6",
  "#e74c3c",
  "#3498db",
  "#1abc9c",
  "#9b59b6",
];

function getInitials(label: string): string {
  const parts = label.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function getAvatarColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDateTime(isoDate: string): string {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }
  return parsedDate.toLocaleString();
}

export default function TaskCommentModal({
  taskId,
  taskTitle,
  isOpen,
  onClose,
}: TaskCommentModalProps): ReactElement {
  const [comments, setComments] = useState<WorkItemCommentThreadItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [isEditingCommentId, setIsEditingCommentId] = useState<number | null>(null);
  const [isDeletingCommentId, setIsDeletingCommentId] = useState<number | null>(null);

  const loadComments = useCallback(async () => {
    startTransition(() => setIsLoading(true));
    try {
      const data = await getTaskComments(taskId);
      startTransition(() => setComments(data));
    } catch {
      toast.error("Unable to load comments.");
    } finally {
      startTransition(() => setIsLoading(false));
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        void loadComments();
      });
      void markTaskCommentsRead(taskId);
    }
  }, [isOpen, loadComments, taskId]);

  const handleAddComment = async (): Promise<void> => {
    const trimmed = commentDraft.trim();
    if (!trimmed) {
      toast.error("Comment cannot be empty.");
      return;
    }
    setIsAddingComment(true);
    try {
      await addTaskComment(taskId, trimmed);
      setCommentDraft("");
      toast.success("Comment added");
      void loadComments();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add comment.";
      toast.error(message);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleEditComment = (commentId: number, body: string): void => {
    setEditingCommentId(commentId);
    setEditingCommentBody(body);
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
      void loadComments();
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
      void loadComments();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete comment.";
      toast.error(message);
    } finally {
      setIsDeletingCommentId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Comments: ${taskTitle}`}>
      {/* Comment thread */}
      <div className="slack-thread" style={{ maxHeight: "22rem", overflow: "auto", marginBottom: "0.75rem" }}>
        {isLoading ? (
          <p className="empty-row">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="empty-row">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="slack-message">
              <div
                className="slack-avatar"
                style={{ background: getAvatarColor(comment.authorLabel) }}
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
            </div>
          ))
        )}
      </div>

      {/* Input bar */}
      <div className="slack-input-bar">
        <textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          disabled={isAddingComment || isLoading}
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
          disabled={isAddingComment || !commentDraft.trim() || isLoading}
          isLoading={isAddingComment}
          loadingLabel="Sending..."
        >
          Send
        </AppButton>
      </div>
    </Modal>
  );
}
