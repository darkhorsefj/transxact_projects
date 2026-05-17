"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiPaperclip, FiTrash2 } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Modal from "@/app/ui/modal";
import {
  getTaskActionData,
  createTaskAction,
  deleteTaskAction,
  updateActionStatus,
  type ActionItem,
} from "@/services/action.service";

interface TaskActionModalProps {
  taskId: number;
  taskTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskActionModal({
  taskId,
  taskTitle,
  isOpen,
  onClose,
}: TaskActionModalProps): ReactElement {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionName, setActionName] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [isDeletingActionId, setIsDeletingActionId] = useState<number | null>(null);
  const [isTogglingStatusId, setIsTogglingStatusId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadActions = useCallback(async () => {
    startTransition(() => setIsLoading(true));
    try {
      const data = await getTaskActionData(taskId);
      startTransition(() => {
        setActions(data.actions);
        setProjectId(data.projectId);
      });
    } catch {
      toast.error("Unable to load actions.");
    } finally {
      startTransition(() => setIsLoading(false));
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        void loadActions();
      });
    }
  }, [isOpen, loadActions]);

  const handleAddAction = async (): Promise<void> => {
    const trimmedName = actionName.trim();
    if (!trimmedName) {
      toast.error("Action name is required.");
      return;
    }
    if (projectId === null) {
      toast.error("Unable to determine project.");
      return;
    }
    setIsAddingAction(true);
    try {
      const result = await createTaskAction(taskId, projectId, trimmedName, actionDescription.trim() || undefined);

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("actionId", String(result.id));
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error ?? "File upload failed. Action was created.");
        }
      }

      setFile(null);
      setActionName("");
      setActionDescription("");
      toast.success("Action added");
      void loadActions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add action.";
      toast.error(message);
    } finally {
      setIsAddingAction(false);
    }
  };

  const handleDeleteAction = async (actionId: number): Promise<void> => {
    setIsDeletingActionId(actionId);
    try {
      await deleteTaskAction(actionId);
      toast.success("Action deleted");
      void loadActions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete action.";
      toast.error(message);
    } finally {
      setIsDeletingActionId(null);
    }
  };

  const handleToggleStatus = async (act: ActionItem): Promise<void> => {
    const newStatus = act.status === "pending" ? "completed" : "pending";
    setIsTogglingStatusId(act.id);
    try {
      await updateActionStatus(act.id, newStatus);
      toast.success(newStatus === "completed" ? "Action completed" : "Action reopened");
      void loadActions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update action.";
      toast.error(message);
    } finally {
      setIsTogglingStatusId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Actions: ${taskTitle}`}>
      <div className="flex items-end gap-2 mb-3">
        <div className="flex flex-col gap-1 flex-1">
          <input
            className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
            value={actionName}
            onChange={(e) => setActionName(e.target.value)}
            disabled={isAddingAction || isLoading}
            placeholder="Action name"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <input
            className="w-full border rounded-md bg-accent text-foreground text-sm px-2.5 py-1.5 transition-colors focus:border-primary placeholder:text-muted-foreground"
            value={actionDescription}
            onChange={(e) => setActionDescription(e.target.value)}
            disabled={isAddingAction || isLoading}
            placeholder="Description (optional)"
          />
        </div>
        <AppButton
          onClick={() => void handleAddAction()}
          disabled={isAddingAction || !actionName.trim() || isLoading}
          isLoading={isAddingAction}
          loadingLabel="Adding..."
        >
          Add
        </AppButton>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <AppButton
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAddingAction || isLoading}
          startIcon={<FiPaperclip aria-hidden="true" />}
        >
          {file ? file.name : "Attach file"}
        </AppButton>
        {file && (
          <AppButton
            variant="ghost"
            onClick={() => setFile(null)}
            disabled={isAddingAction || isLoading}
          >
            Remove
          </AppButton>
        )}
        <input
          ref={fileInputRef}
          id="action-file-input"
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={isAddingAction || isLoading}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-2">Loading actions...</p>
      ) : actions.length === 0 ? (
        <p className="text-muted-foreground text-center py-2">No actions yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {actions.map((act) => {
            const isDone = act.status === "completed";
            return (
              <div
                key={act.id}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-accent border"
                style={{ opacity: isDone ? 0.65 : 1 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => void handleToggleStatus(act)}
                      disabled={isTogglingStatusId === act.id}
                      className={`w-5 h-5 shrink-0 flex items-center justify-center p-0 rounded ${isDone ? "bg-green-500 border-2 border-green-500" : "bg-transparent border-2 border-border"}`}
                    >
                      {isDone && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isDone ? "Mark pending" : "Mark completed"}</TooltipContent>
                </Tooltip>

                <div className="flex-1 min-w-0">
                  <div
                    className={`font-semibold text-base ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}
                  >
                    {act.name}
                  </div>
                  {act.description && (
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {act.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {act.authorLabel}
                  </div>
                </div>

                {act.isOwn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => void handleDeleteAction(act.id)}
                        disabled={isDeletingActionId === act.id}
                        className="inline-flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent text-destructive cursor-pointer transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete action</TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
