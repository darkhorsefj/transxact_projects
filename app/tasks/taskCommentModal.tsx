"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiEdit2, FiPaperclip, FiTrash2 } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Modal from "@/app/ui/modal";
import { formatDateTime, getInitials, getAvatarColorByLabel } from "@/lib/utils";
import { AVATAR_COLORS } from "@/lib/constants";
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
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const result = await addTaskComment(taskId, trimmed);

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("commentId", String(result.id));
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error ?? "File upload failed. Comment was added.");
        }
      }

      setFile(null);
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
      <div className="flex flex-col max-h-[22rem] overflow-auto mb-3">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-2">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-muted-foreground text-center py-2">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-2 px-1.5 py-1 rounded-md transition-colors hover:bg-accent relative group">
              <div
                className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1 leading-none"
                style={{ background: getAvatarColorByLabel(comment.authorLabel, AVATAR_COLORS) }}
              >
                {getInitials(comment.authorLabel)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-bold text-sm">{comment.authorLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(comment.createdAt)}
                    {comment.isEdited ? " (edited)" : ""}
                  </span>
                </div>
                {editingCommentId === comment.id ? (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <textarea
                      className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                      value={editingCommentBody}
                      onChange={(e) => setEditingCommentBody(e.target.value)}
                      disabled={isEditingCommentId === comment.id}
                    />
                    <div className="flex items-center gap-1.5">
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
                  <div className="text-sm leading-relaxed mt-0.5 break-words whitespace-pre-wrap">{comment.body}</div>
                )}
              </div>
              {comment.isOwn && editingCommentId !== comment.id && (
                <div className="flex gap-0.5 opacity-0 transition-opacity absolute right-1.5 -top-2 bg-card border rounded-md p-0.5 shadow-card group-hover:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleEditComment(comment.id, comment.body)}
                        className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <FiEdit2 size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => void handleDeleteComment(comment.id)}
                        disabled={isDeletingCommentId === comment.id}
                        className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-destructive cursor-pointer transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-1.5 border rounded-md px-2 py-1 bg-card transition-colors focus-within:border-primary">
        <div className="flex flex-col flex-1 gap-1.5">
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
          <div className="flex items-center gap-1.5">
            <AppButton
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAddingComment || isLoading}
              startIcon={<FiPaperclip aria-hidden="true" />}
            >
              {file ? file.name : "Attach file"}
            </AppButton>
            {file && (
              <AppButton
                variant="ghost"
                onClick={() => setFile(null)}
                disabled={isAddingComment || isLoading}
              >
                Remove
              </AppButton>
            )}
            <input
              ref={fileInputRef}
              id="comment-file-input"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isAddingComment || isLoading}
            />
          </div>
        </div>
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
