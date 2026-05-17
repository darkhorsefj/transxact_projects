"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiEdit2, FiTrash2, FiHeart, FiEye, FiPaperclip, FiDownload } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
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
      const result = await addIssueComment(issue.id, trimmedComment);

      if (commentFile) {
        const formData = new FormData();
        formData.append("file", commentFile);
        formData.append("commentId", String(result.id));
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error ?? "File upload failed. Comment was added.");
        }
      }

      setCommentFile(null);
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
    <section className="flex flex-col gap-2 min-h-0">
      <Link href="/issues" className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary/80">
        <span className="inline-flex items-center gap-1"><FiArrowLeft /> Back</span>
      </Link>

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
                <h1>{issue.title}</h1>
                <p className="mt-1 text-muted-foreground text-xs">{issue.projectName}</p>
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
            <p className="font-medium">{issueStatusLabel(issue.status)}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Assignee</label>
            <p>{issue.assigneeName ?? "Unassigned"}</p>
          </div>

          {issue.taskId && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-muted-foreground">Related Task</label>
              <Link href={`/tasks/${issue.taskId}`} className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary/80">
                {issue.taskTitle}
              </Link>
            </div>
          )}

          <div
            className="flex flex-col gap-1 col-span-3"
          >
            <label className="text-sm font-semibold text-muted-foreground">Description</label>
            {isEditing ? (
              <textarea
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            ) : issue.description ? (
              <p>{issue.description}</p>
            ) : (
              <p className="text-muted-foreground">No description.</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Created</label>
            <p>
              {formatDateTime(issue.createdAt)} by <strong>{issue.createdByUserName}</strong>
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-muted-foreground">Progress</label>
            <AppButton
              onClick={() => void handleAdvanceIssue()}
              disabled={issue.status === "closed" || isAdvancing}
              isLoading={isAdvancing}
              loadingLabel="Updating..."
              variant="ghost"
              className="self-start"
            >
              Next Step
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
            <h2>Comments ({issue.comments.length})</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex flex-col gap-1.5 mb-2 max-h-96 overflow-auto">
            {issue.comments.length === 0 ? (
              <p className="text-muted-foreground text-center">No comments yet.</p>
            ) : (
              issue.comments.map((comment) => (
                <article
                  key={comment.id}
                  className={`border rounded-md bg-accent p-2 ${comment.isOwn ? "border-border" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-muted-foreground text-xs mb-0.5">
                        <strong>{comment.authorLabel}</strong> · {formatDateTime(comment.createdAt)}
                        {comment.isEdited ? " · edited" : ""}
                      </p>
                      {editingCommentId === comment.id ? (
                        <textarea
                          className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground mt-2"
                          value={editingCommentBody}
                          onChange={(e) => setEditingCommentBody(e.target.value)}
                          disabled={isEditingCommentId === comment.id}
                        />
                      ) : (
                        <p>{comment.body}</p>
                      )}
                    </div>
                    {comment.isOwn && (
                      <div className="flex items-center gap-2 ml-4">
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleEditComment(comment.id, comment.body)}
                                  disabled={isDeletingCommentId === comment.id}
                                  className="inline-flex items-center gap-1 border-0 bg-transparent text-primary cursor-pointer text-sm font-semibold p-0 transition-colors hover:text-primary/80"
                                >
                                  <FiEdit2 size={16} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit comment</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => void handleDeleteComment(comment.id)}
                                  disabled={isDeletingCommentId === comment.id}
                                  className="inline-flex items-center gap-1 border-0 bg-transparent text-destructive cursor-pointer text-sm font-semibold p-0 transition-colors hover:text-destructive/80"
                                >
                                  <FiTrash2 size={16} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Delete comment</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="comment-input" className="text-sm font-semibold text-muted-foreground">
              Add Comment
            </label>
            <div className="flex flex-col gap-1.5">
              <textarea
                id="comment-input"
                className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground min-h-16 resize-y"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                disabled={isAddingComment}
                placeholder="Share context or updates..."
              />
              <div className="flex items-center gap-1.5">
                <AppButton
                  variant="secondary"
                  onClick={() => commentFileInputRef.current?.click()}
                  disabled={isAddingComment}
                  startIcon={<FiPaperclip aria-hidden="true" />}
                >
                  {commentFile ? commentFile.name : "Attach file"}
                </AppButton>
                {commentFile && (
                  <AppButton
                    variant="ghost"
                    onClick={() => setCommentFile(null)}
                    disabled={isAddingComment}
                  >
                    Remove
                  </AppButton>
                )}
                <input
                  ref={commentFileInputRef}
                  id="issue-comment-file-input"
                  type="file"
                  className="hidden"
                  onChange={(e) => setCommentFile(e.target.files?.[0] ?? null)}
                  disabled={isAddingComment}
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
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-card p-2.5">
        <div className="flex flex-wrap gap-2 justify-between mb-2">
          <div>
            <h2>Attachments ({issue.attachments.length})</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-end gap-2 mb-2">
            <input
              key={fileInputKey}
              type="file"
              id="issue-file-upload-input"
              onChange={(e) => void handleUpload(e)}
              disabled={isUploading}
              className="hidden"
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
            {isUploading && <span className="text-muted-foreground text-sm">Uploading...</span>}
          </div>

          {issue.attachments.length === 0 ? (
            <p className="text-muted-foreground text-center">No attachments.</p>
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
                  {issue.attachments.map((att) => (
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
