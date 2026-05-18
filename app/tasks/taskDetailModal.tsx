"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiExternalLink, FiHeart, FiEye, FiCheckCircle } from "react-icons/fi";
import Modal from "@/app/ui/modal";
import AppButton from "@/app/ui/appButton";
import { formatDateTime, formatDueDate } from "@/lib/utils";
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
        <p className="text-muted-foreground text-center py-2">Loading task details...</p>
      ) : task ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <FiCheckCircle size={20} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h2 className="m-0 text-lg font-semibold">{task.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {task.projectName} · {task.caseName} · {task.itemName}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <p>{formatDueDate(task.dueAt)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-muted-foreground">Created</label>
              <p>{formatDateTime(task.createdAt)}</p>
            </div>
          </div>

          {task.description && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-muted-foreground">Description</label>
              <p>{task.description}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
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

          <div className="text-right pt-2 border-t">
            <Link href={`/tasks/${task.id}`} className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary/80" onClick={onClose}>
              <span className="inline-flex items-center gap-1">
                Open full page <FiExternalLink />
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
