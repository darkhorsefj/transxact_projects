"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { useSseRefresh } from "@/app/ui/useSseRefresh";
import {
  FiArchive,
  FiCheck,
  FiEdit2,
  FiFlag,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUserCheck,
  FiUserX,
  FiX,
} from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { getInitials, getAvatarColorByUserId } from "@/lib/utils";
import { MESSAGE_AVATAR_COLORS } from "@/lib/constants";
import {
  blockUserForMessaging,
  createOrOpenConversation,
  deleteDirectMessage,
  editDirectMessage,
  markConversationRead,
  searchUsers,
  sendDirectMessage,
  setConversationArchived,
  type ConversationDetail,
  type ConversationSummary,
  type UserOption,
  unblockUserForMessaging,
} from "@/services/message.service";
import { reportConversation, reportMessage } from "@/services/report.service";

interface MessagesViewProps {
  currentUserId: number;
  currentUserRole: "admin" | "member";
  userOptions: UserOption[];
  conversations: ConversationSummary[];
  activeConversation: ConversationDetail | null;
}

interface StatusState {
  tone: "success" | "error" | "info";
  message: string;
}

function formatTime(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return parsed.toLocaleDateString([], { weekday: "short" });
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFullDateTime(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

export default function MessagesView({
  currentUserRole,
  userOptions,
  conversations,
  activeConversation,
}: MessagesViewProps): ReactElement {
  const router = useRouter();
  const [recipientId, setRecipientId] = useState<string>(
    userOptions[0] ? String(userOptions[0].id) : "",
  );
  const [messageBody, setMessageBody] = useState("");
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [status, setStatus] = useState<StatusState | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserOption[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const userSearchRef = useRef<HTMLDivElement>(null);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversationId = activeConversation?.conversationId ?? null;
  const hasConversation = Boolean(activeConversation);

  const filteredConversations = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.participantLabel.toLowerCase().includes(q) ||
      (c.lastMessagePreview?.toLowerCase().includes(q) ?? false)
    );
  }, [conversations, convSearch]);

  useEffect(() => {
    if (!activeConversationId) return;
    void markConversationRead(activeConversationId).catch(() => {});
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  useEffect(() => {
    if (hasConversation) textareaRef.current?.focus();
  }, [hasConversation]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (userSearchRef.current && !userSearchRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useSseRefresh();

  const canSendInConversation = useMemo(() => {
    if (!activeConversation) return false;
    return !activeConversation.isBlockedByCurrentUser && !activeConversation.isBlockedByOtherUser;
  }, [activeConversation]);

  const openConversation = (conversationId: number): void => {
    router.push(`/messages?conversationId=${conversationId}`);
  };

  const clearStatus = (): void => {
    setStatus(null);
  };

  const handleUserSearchInput = (value: string): void => {
    setUserSearchQuery(value);
    setShowUserDropdown(true);
    setHighlightedIndex(0);

    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);

    if (!value.trim()) {
      setUserSearchResults([]);
      return;
    }

    userSearchTimeout.current = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const results = await searchUsers(value);
        setUserSearchResults(results);
      } catch {
        setUserSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 200);
  };

  const selectUser = (user: UserOption): void => {
    setRecipientId(String(user.id));
    setUserSearchQuery(user.label);
    setShowUserDropdown(false);
    setUserSearchResults([]);
  };

  const handleStartConversation = async (): Promise<void> => {
    const nextRecipientId = Number(recipientId);
    if (!Number.isInteger(nextRecipientId) || nextRecipientId <= 0) {
      setStatus({ tone: "error", message: "Select a user to start a conversation." });
      return;
    }

    setIsCreatingConversation(true);
    try {
      const conversationId = await createOrOpenConversation(nextRecipientId);
      setStatus({ tone: "success", message: "Conversation ready." });
      router.push(`/messages?conversationId=${conversationId}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open conversation.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!activeConversation || !messageBody.trim()) return;
    if (!canSendInConversation) {
      setStatus({ tone: "error", message: "Messaging is unavailable because this conversation is blocked." });
      return;
    }

    setIsSending(true);
    try {
      await sendDirectMessage(activeConversation.conversationId, messageBody);
      setMessageBody("");
      clearStatus();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send message.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const autoResizeTextarea = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const beginEditingMessage = (messageId: number, currentBody: string): void => {
    setEditingMessageId(messageId);
    setEditingBody(currentBody);
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingMessageId) return;
    try {
      await editDirectMessage(editingMessageId, editingBody);
      setEditingMessageId(null);
      setEditingBody("");
      clearStatus();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to edit message.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  const handleDeleteMessage = async (messageId: number): Promise<void> => {
    try {
      await deleteDirectMessage(messageId);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete message.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  const handleArchiveConversation = async (): Promise<void> => {
    if (!activeConversation) return;
    try {
      await setConversationArchived(activeConversation.conversationId, true);
      setStatus({ tone: "success", message: "Conversation archived." });
      clearStatus();
      router.push("/messages");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to archive conversation.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  const handleBlockToggle = async (): Promise<void> => {
    if (!activeConversation) return;
    try {
      if (activeConversation.isBlockedByCurrentUser) {
        await unblockUserForMessaging(activeConversation.participantUserId);
        setStatus({ tone: "success", message: "User unblocked." });
      } else {
        await blockUserForMessaging(activeConversation.participantUserId);
        setStatus({ tone: "success", message: "User blocked and conversation hidden." });
        router.push("/messages");
      }
      clearStatus();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update block state.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  const handleReportConversation = async (): Promise<void> => {
    if (!activeConversation) return;
    const reason = window.prompt("Describe the issue with this conversation:");
    if (!reason) return;
    try {
      await reportConversation(activeConversation.conversationId, reason);
      setStatus({ tone: "success", message: "Report submitted to admin review queue." });
      toast.success("Report submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit report.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  const handleReportMessage = async (messageId: number): Promise<void> => {
    const reason = window.prompt("Describe the issue with this message:");
    if (!reason) return;
    try {
      await reportMessage(messageId, reason);
      setStatus({ tone: "success", message: "Message report submitted." });
      toast.success("Report submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit message report.";
      setStatus({ tone: "error", message });
      toast.error(message);
    }
  };

  return (
    <section className="discord-layout">
      <aside className="discord-sidebar">
        <div className="discord-sidebar-header">
          <div className="discord-new-conv">
            <div className="combobox-wrap" style={{ flex: 1, minWidth: 0 }} ref={userSearchRef}>
              <input
                className="text-input"
                style={{ width: "100%" }}
                value={userSearchQuery}
                onChange={(e) => handleUserSearchInput(e.target.value)}
                onFocus={() => {
                  if (userSearchQuery.trim()) setShowUserDropdown(true);
                }}
                placeholder="Search users..."
                disabled={isCreatingConversation}
              />
              {showUserDropdown && (
                <div className="combobox-list">
                  {isSearchingUsers ? (
                    <div className="combobox-empty">Searching...</div>
                  ) : userSearchResults.length === 0 ? (
                    <div className="combobox-empty">
                      {userSearchQuery.trim() ? "No users found" : "Type to search users"}
                    </div>
                  ) : (
                    userSearchResults.map((user, index) => (
                      <div
                        key={user.id}
                        className={`combobox-option ${index === highlightedIndex ? "is-highlighted" : ""}`}
                        onClick={() => selectUser(user)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <div
                          className="discord-conv-avatar"
                          style={{ backgroundColor: getAvatarColorByUserId(user.id, MESSAGE_AVATAR_COLORS) }}
                        >
                          {getInitials(user.label)}
                        </div>
                        <span>{user.label}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <AppButton
              variant="ghost"
              onClick={() => void handleStartConversation()}
              isLoading={isCreatingConversation}
              loadingLabel="..."
              startIcon={<FiPlus aria-hidden="true" />}
            >
              New
            </AppButton>
          </div>
          {currentUserRole === "admin" ? (
            <Link
              href="/admin/reports"
              className="text-link"
              style={{ marginTop: "0.35rem", display: "inline-flex", fontSize: "0.8rem" }}
            >
              <span className="icon-with-label">
                <FiFlag aria-hidden="true" />
                <span>Review reports</span>
              </span>
            </Link>
          ) : null}
        </div>

        <div style={{ padding: "0.2rem 0.45rem 0" }}>
          <div style={{ position: "relative" }}>
            <FiSearch
              size={14}
              style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
            />
            <input
              className="text-input"
              style={{ paddingLeft: "1.8rem", width: "100%", fontSize: "0.72rem" }}
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              placeholder="Search conversations..."
            />
          </div>
        </div>

        <div className="discord-conv-list">
          {filteredConversations.length === 0 ? (
            <div className="discord-conv-empty">
              <FiMessageSquare size={28} aria-hidden="true" />
              <span>No conversations yet.</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Search for a user above to start one.
              </span>
            </div>
          ) : (
            filteredConversations.map((item) => (
              <div
                key={item.conversationId}
                className={`discord-conv-item ${item.conversationId === activeConversationId ? "is-active" : ""}`}
                onClick={() => openConversation(item.conversationId)}
              >
                <div
                  className="discord-conv-avatar"
                  style={{ backgroundColor: getAvatarColorByUserId(item.participantUserId, MESSAGE_AVATAR_COLORS) }}
                >
                  {getInitials(item.participantLabel)}
                </div>
                <div className="discord-conv-info">
                  <div className="discord-conv-name">{item.participantLabel}</div>
                  <div className="discord-conv-preview">{item.lastMessagePreview}</div>
                </div>
                {item.unreadCount > 0 ? (
                  <div className="discord-conv-unread">
                    {item.unreadCount > 99 ? "99+" : item.unreadCount}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="discord-main">
        {!activeConversation ? (
          <div className="discord-no-channel">
            <span style={{ textAlign: "center", maxWidth: "20rem" }}>
              <FiMessageSquare size={32} style={{ display: "block", margin: "0 auto 0.5rem", opacity: 0.4 }} aria-hidden="true" />
              Select a conversation or start a new one
            </span>
          </div>
        ) : (
          <>
            <header className="discord-channel-header">
              <h2>
                <FiMessageSquare size={16} style={{ marginRight: "0.35rem", verticalAlign: "middle", opacity: 0.6 }} aria-hidden="true" />
                {activeConversation.participantLabel}
              </h2>
              <div className="discord-channel-actions">
                <button
                  className="discord-channel-btn"
                  onClick={() => void handleArchiveConversation()}
                  title="Archive conversation"
                >
                  <FiArchive aria-hidden="true" />
                </button>
                <button
                  className="discord-channel-btn"
                  onClick={() => void handleBlockToggle()}
                  title={activeConversation.isBlockedByCurrentUser ? "Unblock user" : "Block user"}
                >
                  {activeConversation.isBlockedByCurrentUser ? (
                    <FiUserCheck aria-hidden="true" />
                  ) : (
                    <FiUserX aria-hidden="true" />
                  )}
                </button>
                <button
                  className="discord-channel-btn is-danger"
                  onClick={() => void handleReportConversation()}
                  title="Report conversation"
                >
                  <FiFlag aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="discord-status">
              <InlineStatus
                tone={status?.tone ?? "info"}
                message={status?.message ?? null}
              />
            </div>

            <div className="discord-messages-wrap">
              {activeConversation.messages.length === 0 ? (
                <div className="discord-no-messages">
                  No messages yet. Say hello!
                </div>
              ) : (
                <div className="discord-messages">
                  {activeConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`discord-msg${message.isOwn ? " is-own" : ""}`}
                    >
                      {editingMessageId === message.id ? (
                        <div className="discord-msg-edit">
                          <textarea
                            className="text-input"
                            value={editingBody}
                            onChange={(event) => setEditingBody(event.target.value)}
                            style={{ minHeight: "3rem", resize: "vertical" }}
                          />
                          <div className="button-row">
                            <AppButton
                              variant="secondary"
                              onClick={() => void handleSaveEdit()}
                              startIcon={<FiCheck aria-hidden="true" />}
                            >
                              Save
                            </AppButton>
                            <AppButton
                              variant="ghost"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditingBody("");
                              }}
                              startIcon={<FiX aria-hidden="true" />}
                            >
                              Cancel
                            </AppButton>
                          </div>
                        </div>
                      ) : (
                        <div className="discord-msg-body">
                          <p>{message.body}</p>
                        </div>
                      )}

                      {editingMessageId !== message.id ? (
                        <div className="discord-msg-footer">
                          <span className="discord-msg-time" title={formatFullDateTime(message.createdAt)}>
                            {formatTime(message.createdAt)}
                          </span>
                          {message.isEdited && !message.isDeleted ? (
                            <span className="discord-msg-tag">edited</span>
                          ) : null}
                          {message.isOwn && message.readByOtherUser ? (
                            <span className="discord-msg-tag is-read">· read</span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="discord-msg-actions">
                        {message.isOwn && !message.isDeleted ? (
                          <>
                            <button
                              type="button"
                              className="slack-action-btn"
                              onClick={() => beginEditingMessage(message.id, message.body)}
                              title="Edit"
                            >
                              <FiEdit2 size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="slack-action-btn is-danger"
                              onClick={() => void handleDeleteMessage(message.id)}
                              title="Delete"
                            >
                              <FiTrash2 size={14} aria-hidden="true" />
                            </button>
                          </>
                        ) : null}
                        {!message.isDeleted ? (
                          <button
                            type="button"
                            className="slack-action-btn is-danger"
                            onClick={() => void handleReportMessage(message.id)}
                            title="Report"
                          >
                            <FiFlag size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="discord-input-wrap">
              <div className="slack-input-bar">
                <textarea
                  ref={textareaRef}
                  value={messageBody}
                  onChange={(event) => {
                    setMessageBody(event.target.value);
                  }}
                  onInput={autoResizeTextarea}
                  onKeyDown={handleKeyDown}
                  disabled={!canSendInConversation || isSending}
                  placeholder={
                    canSendInConversation
                      ? `Message @${activeConversation.participantLabel}`
                      : "Messaging is blocked"
                  }
                  rows={1}
                />
                <AppButton
                  variant="primary"
                  onClick={() => void handleSendMessage()}
                  isLoading={isSending}
                  loadingLabel="..."
                  disabled={!canSendInConversation || !messageBody.trim()}
                  startIcon={<FiSend aria-hidden="true" />}
                >
                  Send
                </AppButton>
              </div>
            </div>
          </>
        )}
      </main>
    </section>
  );
}
