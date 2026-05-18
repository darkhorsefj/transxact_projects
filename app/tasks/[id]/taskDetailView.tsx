"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiEdit2, FiTrash2, FiHeart, FiEye, FiPaperclip, FiDownload } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
      router.refresh();
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
    <section className="flex flex-col gap-2 min-h-0">
      {!hideBackLink && (
        <Link href="/tasks" className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary/80">
          <span className="inline-flex items-center gap-1"><FiArrowLeft /> Back</span>
        </Link>
      )}

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            {isEditing ? (
              <input
                className="w-full border rounded-md bg-accent text-foreground px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground text-lg font-semibold"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            ) : (
              <>
                <h1>{task.title}</h1>
                <p className="mt-1 text-muted-foreground text-xs">{task.projectName} / {task.caseName} / {task.itemName}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
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

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Status</label>
            <p className="font-medium">{taskStatusLabel(task.status)}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Assignee</label>
            <p>{task.assigneeName ?? "Unassigned"}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Due Date</label>
            {isEditing ? (
              <input
                type="date"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                value={editDueOn}
                onChange={(e) => setEditDueOn(e.target.value)}
              />
            ) : (
              <p>{formatDueDate(task.dueAt)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1 col-span-3">
            <label className="text-sm font-semibold text-muted-foreground">Description</label>
            {isEditing ? (
              <textarea
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            ) : task.description ? (
              <p>{task.description}</p>
            ) : (
              <p className="text-muted-foreground">No description.</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Created</label>
            <p>
              {formatDateTime(task.createdAt)} by <strong>{task.createdByUserName}</strong>
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Progress</label>
            <AppButton
              onClick={() => void handleAdvanceTask()}
              disabled={task.status === "completed" || isAdvancing}
              isLoading={isAdvancing}
              loadingLabel="Updating..."
              variant="ghost"
              className="self-start"
            >
              {task.status === "not_started" ? "Start" : task.status === "in_progress" ? "Mark Complete" : "Completed"}
            </AppButton>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Follow</label>
            <AppButton
              onClick={() => void handleToggleFollow()}
              disabled={isTogglingFollow}
              isLoading={isTogglingFollow}
              loadingLabel={isFollowing ? "Unfollowing..." : "Following..."}
              startIcon={isFollowing ? <FiHeart aria-hidden="true" /> : <FiEye aria-hidden="true" />}
              variant="ghost"
              className="self-start"
            >
              {isFollowing ? "Following" : "Follow"}
            </AppButton>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>Comments ({task.comments.length})</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex flex-col">
            {task.comments.length === 0 ? (
              <p className="text-muted-foreground text-center py-2">No comments yet.</p>
            ) : (
              task.comments.map((comment) => (
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

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>Actions ({task.actions.length})</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-end gap-2 mb-2">
            <div className="flex flex-col gap-1 flex-1">
              <input
                id="action-name-input"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                value={actionName}
                onChange={(e) => setActionName(e.target.value)}
                disabled={isAddingAction}
                placeholder="Action name"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <input
                id="action-desc-input"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
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
            <p className="text-muted-foreground text-center py-2">No actions yet.</p>
          ) : (
            <div className="max-h-64 overflow-auto border rounded-md">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Name</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Description</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Created By</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b"></th>
                  </tr>
                </thead>
                <tbody>
                  {task.actions.map((act) => (
                    <tr key={act.id} className="transition-colors hover:bg-accent">
                      <td className="border-b px-2 py-1.5 text-left font-medium">{act.name}</td>
                      <td className="border-b px-2 py-1.5 text-left">{act.description ?? "—"}</td>
                      <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{act.authorLabel}</td>
                      <td className="border-b px-2 py-1.5 text-left">
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

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>Attachments ({task.attachments.length})</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-end gap-2 mb-2">
            <input
              key={fileInputKey}
              type="file"
              id="file-upload-input"
              onChange={(e) => void handleUpload(e)}
              disabled={isUploading}
              className="hidden"
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
            {isUploading && <span className="text-muted-foreground text-sm">Uploading...</span>}
          </div>

          {task.attachments.length === 0 ? (
            <p className="text-muted-foreground text-center py-2">No attachments.</p>
          ) : (
            <div className="max-h-64 overflow-auto border rounded-md">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">File</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Size</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b">Uploaded</th>
                    <th scope="col" className="sticky top-0 z-10 bg-accent text-muted-foreground text-xs font-bold uppercase tracking-wider px-2 py-1.5 text-left border-b"></th>
                  </tr>
                </thead>
                <tbody>
                  {task.attachments.map((att) => (
                    <tr key={att.id} className="transition-colors hover:bg-accent">
                      <td className="border-b px-2 py-1.5 text-left font-medium">{att.fileName}</td>
                      <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{formatFileSize(att.sizeBytes)}</td>
                      <td className="border-b px-2 py-1.5 text-left text-muted-foreground">{formatDateTime(att.createdAt)}</td>
                      <td className="border-b px-2 py-1.5 text-left">
                        <a
                          href={`/api/uploads/${att.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary/80"
                        >
                          <span className="inline-flex items-center gap-1"><FiDownload /> Download</span>
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
