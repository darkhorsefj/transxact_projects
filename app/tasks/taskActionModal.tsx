"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiTrash2 } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
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
      await createTaskAction(taskId, projectId, trimmedName, actionDescription.trim() || undefined);
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
      {/* Add action form */}
      <div className="workflow-form" style={{ marginBottom: "0.75rem" }}>
        <div className="field-wrap" style={{ flex: 1 }}>
          <input
            className="text-input"
            value={actionName}
            onChange={(e) => setActionName(e.target.value)}
            disabled={isAddingAction || isLoading}
            placeholder="Action name"
          />
        </div>
        <div className="field-wrap" style={{ flex: 1 }}>
          <input
            className="text-input"
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

      {/* Actions list */}
      {isLoading ? (
        <p className="empty-row">Loading actions...</p>
      ) : actions.length === 0 ? (
        <p className="empty-row">No actions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {actions.map((act) => {
            const isDone = act.status === "completed";
            return (
              <div
                key={act.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.55rem 0.7rem",
                  border: "1px solid var(--border)",
                  borderRadius: "0.6rem",
                  background: "var(--surface)",
                  opacity: isDone ? 0.65 : 1,
                }}
              >
                <button
                  onClick={() => void handleToggleStatus(act)}
                  disabled={isTogglingStatusId === act.id}
                  style={{
                    width: "1.2rem",
                    height: "1.2rem",
                    border: `2px solid ${isDone ? "var(--success)" : "var(--border-strong)"}`,
                    borderRadius: "0.25rem",
                    background: isDone ? "var(--success)" : "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                  title={isDone ? "Mark pending" : "Mark completed"}
                >
                  {isDone && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      textDecoration: isDone ? "line-through" : "none",
                      color: isDone ? "var(--text-muted)" : "var(--text-primary)",
                    }}
                  >
                    {act.name}
                  </div>
                  {act.description && (
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                      {act.description}
                    </div>
                  )}
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {act.authorLabel}
                  </div>
                </div>

                {act.isOwn && (
                  <button
                    onClick={() => void handleDeleteAction(act.id)}
                    disabled={isDeletingActionId === act.id}
                    className="slack-action-btn is-danger"
                    title="Delete action"
                  >
                    <FiTrash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
