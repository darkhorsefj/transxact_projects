"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiExternalLink, FiHeart, FiEye, FiCheckCircle } from "react-icons/fi";
import Modal from "@/app/ui/modal";
import AppButton from "@/app/ui/appButton";
import {
  getTaskDetailById,
  advanceTaskStatus,
  setTaskFollow,
  type TaskDetailItem,
} from "@/services/workflow.service";

interface TaskDetailModalProps {
  taskId: number;
  isOpen: boolean;
  onClose: () => void;
}

function taskStatusLabel(status: TaskDetailItem["status"]): string {
  if (status === "not_started") return "Not started";
  if (status === "in_progress") return "In progress";
  return "Completed";
}

function formatDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
}

function formatDueDate(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString();
}

export default function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
}: TaskDetailModalProps): ReactElement {
  const [task, setTask] = useState<TaskDetailItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const loadTask = useCallback(async () => {
    startTransition(() => setIsLoading(true));
    try {
      const data = await getTaskDetailById(taskId);
      startTransition(() => {
        setTask(data);
        setIsFollowing(data.isFollowing);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load task.";
      toast.error(message);
    } finally {
      startTransition(() => setIsLoading(false));
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen && taskId) {
      startTransition(() => {
        void loadTask();
      });
    }
  }, [isOpen, taskId, loadTask]);

  const handleAdvance = async (): Promise<void> => {
    if (!task) return;
    setIsAdvancing(true);
    try {
      await advanceTaskStatus(task.id);
      toast.success("Task updated");
      void loadTask();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update task.";
      toast.error(message);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleToggleFollow = async (): Promise<void> => {
    if (!task) return;
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Task details">
      {isLoading ? (
        <p className="empty-row">Loading task details...</p>
      ) : task ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Title with icon */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <FiCheckCircle size={20} style={{ marginTop: "0.15rem", flexShrink: 0, color: "var(--brand)" }} />
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 650 }}>{task.title}</h2>
              <p style={{ margin: "0.1rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                {task.projectName} · {task.phaseName}
              </p>
            </div>
          </div>

          {/* Detail fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="field-wrap">
              <label className="field-label">Status</label>
              <p style={{ fontWeight: 500 }}>{taskStatusLabel(task.status)}</p>
            </div>
            <div className="field-wrap">
              <label className="field-label">Assignee</label>
              <p>{task.assigneeName ?? "Unassigned"}</p>
            </div>
            <div className="field-wrap">
              <label className="field-label">Due Date</label>
              <p>{formatDueDate(task.dueAt)}</p>
            </div>
            <div className="field-wrap">
              <label className="field-label">Created</label>
              <p>{formatDateTime(task.createdAt)}</p>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="field-wrap">
              <label className="field-label">Description</label>
              <p>{task.description}</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <AppButton
              onClick={() => void handleToggleFollow()}
              disabled={isTogglingFollow}
              isLoading={isTogglingFollow}
              loadingLabel={isFollowing ? "Unfollowing..." : "Following..."}
              startIcon={isFollowing ? <FiHeart /> : <FiEye />}
              variant="ghost"
            >
              {isFollowing ? "Following" : "Follow"}
            </AppButton>
            <AppButton
              onClick={() => void handleAdvance()}
              disabled={task.status === "completed" || isAdvancing}
              isLoading={isAdvancing}
              loadingLabel="Updating..."
              variant="ghost"
            >
              {task.status === "not_started" ? "Start" : task.status === "in_progress" ? "Mark Complete" : "Completed"}
            </AppButton>
          </div>

          {/* Full page link */}
          <div style={{ textAlign: "right", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <Link href={`/tasks/${task.id}`} className="text-link" onClick={onClose}>
              <span className="icon-with-label">
                Open full page <FiExternalLink />
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
