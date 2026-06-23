import { useState, useRef, useEffect, useMemo } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { sendMessage, Room, RoomMessage, MessageReply, toMillis } from "../firebase/rooms";

function formatTime(at: any): string {
  const ms = toMillis(at);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const getDateString = (ms: number) => {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
};

const emojiOnlyRegex =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|\uFE0F\u20E3)*)+$/u;

const isEmojiOnly = (text: string) => {
  const t = (text || "").trim();
  if (!t) return false;
  return emojiOnlyRegex.test(t.replace(/\s+/g, ""));
};

// FIX 4: True grapheme counting using Intl.Segmenter
const getEmojiFontSize = (text: string) => {
  const cleaned = (text || "").trim();
  let count = 0;
  
  // Cast to any to avoid TS errors if lib target is below ES2022
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter !== 'undefined') {
    const seg = new Segmenter(undefined, { granularity: "grapheme" });
    count = [...seg.segment(cleaned)].length;
  } else {
    count = [...cleaned].length; // Fallback for older browsers
  }
  
  if (count <= 1) return 56;
  if (count <= 3) return 46;
  if (count <= 6) return 36;
  return 28;
};

interface ChatProps {
  messages: RoomMessage[];
  playerId: string;
  playerName: string;
  activeRoomId: string;
  roomData: Room | null;
}

export default function Chat({ messages, playerId, playerName, activeRoomId, roomData }: ChatProps) {
  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<RoomMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  
  // FIX 5: Optimistic UI state
  const [optimisticMessages, setOptimisticMessages] = useState<RoomMessage[]>([]);
  // FIX 7: Toast state
  const [toast, setToast] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottom = useRef(true);
  const hasMountedRef = useRef(false); // FIX 6: Initial scroll instant
  const sendAttemptRef = useRef(0);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  // Merge optimistic messages with server messages
  const processedMessages = useMemo(() => {
    // Remove optimistic messages that have been confirmed by the server
    const serverClientAts = new Set(messages.map(m => m.clientAt));
    const activeOptimistic = optimisticMessages.filter(om => !serverClientAts.has(om.clientAt));
    
    const allMessages = [...activeOptimistic, ...messages];
    
    allMessages.sort((a, b) => {
      const da = toMillis(a.at) || a.clientAt;
      const db = toMillis(b.at) || b.clientAt;
      return da - db;
    });

    let lastSenderId: string | null = null;
    let lastMessageTime = 0;
    let lastMessageDate = new Date(0);

    return allMessages.map((m) => {
      const messageTime = toMillis(m.at) || m.clientAt;
      const messageDate = new Date(messageTime);
      
      const isTimeGap = messageTime - lastMessageTime > 300000; // 5 mins
      const isFirstInGroup = lastSenderId !== m.playerId || isTimeGap;
      const showDateSeparator = !isSameDay(lastMessageDate, messageDate);
      
      lastSenderId = m.playerId;
      if (messageTime > 0) lastMessageTime = messageTime;
      lastMessageDate = messageDate;

      return { ...m, isFirstInGroup, showDateSeparator };
    });
  }, [messages, optimisticMessages]);

  useEffect(() => {
    const currentIds = new Set(processedMessages.map((m) => m.id).filter(Boolean) as string[]);
    Object.keys(messageRefs.current).forEach((id) => {
      if (!currentIds.has(id)) delete messageRefs.current[id];
    });
  }, [processedMessages]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottom.current = distanceFromBottom < 150;
  };

  useEffect(() => {
    if (isNearBottom.current && bottomRef.current) {
      // FIX 6: Instant scroll on first mount, smooth thereafter
      bottomRef.current.scrollIntoView({ behavior: hasMountedRef.current ? "smooth" : "auto" });
      hasMountedRef.current = true;
    }
  }, [processedMessages.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [chatInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const onSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId || isSending) return;

    const prevText = chatInput;
    const prevReply = replyingTo;
    const attemptId = ++sendAttemptRef.current;
    const clientAt = Date.now();

    setIsSending(true);
    setChatInput("");
    setReplyingTo(null);
    setShowEmojiPicker(false);
    isNearBottom.current = true;

    // FIX 5: Inject optimistic message immediately
    const replyPayload: MessageReply | null = prevReply?.id ? {
      id: prevReply.id,
      text: (prevReply.text || "").substring(0, 100),
      playerId: prevReply.playerId,
      playerName: prevReply.playerName,
    } : null;

    const tempMessage: RoomMessage = {
      id: `opt-${clientAt}`,
      playerId,
      playerName,
      text,
      at: null,
      clientAt,
      replyTo: replyPayload,
      isPending: true,
    };

    setOptimisticMessages(prev => [...prev, tempMessage]);

    try {
      await sendMessage(activeRoomId, playerId, playerName, text, replyPayload);
      // If successful, remove from optimistic array (it will be replaced by server snapshot)
      setOptimisticMessages(prev => prev.filter(m => m.clientAt !== clientAt));
    } catch (error) {
      console.error("Failed to send message:", error);
      // Remove the failed optimistic message
      setOptimisticMessages(prev => prev.filter(m => m.clientAt !== clientAt));

      if (sendAttemptRef.current === attemptId) {
        setChatInput((cur) => (cur.trim() ? cur : prevText));
        setReplyingTo((cur) => cur ?? prevReply);
      }

      showToast("Failed to send message. Please try again.");
    } finally {
      if (sendAttemptRef.current === attemptId) setIsSending(false);
    }
  };

  const scrollToMessage = (id: string) => {
    const tryScroll = () => {
      const target = messageRefs.current[id];
      if (!target) return false;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setHighlightedId(id);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
      return true;
    };

    if (tryScroll()) return;
    requestAnimationFrame(() => {
      if (!tryScroll()) showToast("Original message is too old to scroll to.");
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "12px 0 0 0",
          marginBottom: 8,
          backgroundColor: "var(--bg-primary)",
          borderRadius: 8,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {processedMessages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40, fontSize: 14, padding: "0 20px" }}>
            No messages yet. <br /> Start the conversation!
          </div>
        )}

        {processedMessages.map((m) => {
          const safeText = typeof m.text === "string" ? m.text : "";
          const safeName = typeof m.playerName === "string" && m.playerName ? m.playerName : m.playerId || "Player";
          // FIX 1: Stable React key (fallback to clientAt)
          const id = m.id || `opt-${m.clientAt}`;

          const isMe = m.playerId === playerId;
          const timeString = formatTime(m.at);
          const emojiOnly = isEmojiOnly(safeText);
          const emojiSize = emojiOnly ? getEmojiFontSize(safeText) : 14;
          const messageTime = toMillis(m.at) || m.clientAt;

          return (
            <div key={id}>
              {/* Date Separator */}
              {m.showDateSeparator && (
                <div style={{ display: "flex", alignItems: "center", margin: "16px 16px", color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ padding: "0 8px" }}>{getDateString(messageTime)}</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              )}

              <div
                ref={(el) => { if (m.id) messageRefs.current[m.id] = el; }}
                onClick={() => {
                  const selected = window.getSelection()?.toString();
                  if (selected) return;
                  setReplyingTo(m);
                  textareaRef.current?.focus();
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  marginTop: m.isFirstInGroup ? 12 : 2,
                  marginBottom: 2,
                  width: "100%",
                  cursor: "pointer",
                  transition: "background-color 0.3s ease",
                  backgroundColor: highlightedId === m.id ? "rgba(245, 158, 11, 0.1)" : "transparent",
                  animation: "msg-in 0.2s ease-out",
                  opacity: m.isPending ? 0.6 : 1, // Pending message visual cue
                }}
              >
                {m.replyTo && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToMessage(m.replyTo!.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      borderLeft: `2px solid ${roomData?.playerColors?.[m.replyTo.playerId] || "var(--text-muted)"}`,
                      padding: "4px 8px",
                      borderRadius: 4,
                      marginBottom: 4,
                      maxWidth: "78%",
                      overflow: "hidden",
                      margin: "0 16px 4px 16px",
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ color: roomData?.playerColors?.[m.replyTo.playerId] || "var(--text-secondary)", fontWeight: 700, fontSize: 11 }}>
                        {m.replyTo.playerName}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.replyTo.text}
                      </span>
                    </div>
                  </div>
                )}

                <div
                  className={m.isFirstInGroup ? "chat-row" : "chat-row chat-grouped"}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMe ? "flex-end" : "flex-start",
                    width: "100%",
                  }}
                >
                  {m.isFirstInGroup && (
                    <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "center", marginBottom: 4, padding: "0 16px" }}>
                      <div
                        className="avatar"
                        style={{
                          backgroundColor: roomData?.playerColors?.[m.playerId] || "#888",
                          marginRight: isMe ? 0 : 12,
                          marginLeft: isMe ? 12 : 0,
                          width: 28,
                          height: 28,
                          fontSize: 12,
                        }}
                      >
                        {/* FIX 3: Avatar emoji/non-BMP fix */}
                        {[...safeName][0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="chat-sender" style={{ color: roomData?.playerColors?.[m.playerId] || "var(--text-primary)" }}>
                        {safeName}
                      </span>
                      <span className="chat-timestamp">{timeString}</span>
                    </div>
                  )}

                  <div
                    className="chat-message"
                    style={{
                      // FIX: User messages are a shade darker than the background (var(--bg-base))
                      // Received messages are a shade lighter (var(--bg-tertiary))
                      background: emojiOnly
                        ? "transparent"
                        : isMe
                        ? "var(--bg-base)"
                        : "var(--bg-tertiary)",
                      color: emojiOnly ? "inherit" : isMe ? "var(--text-secondary)" : "var(--text-primary)",
                      fontSize: emojiSize,
                      padding: emojiOnly ? "0 8px" : "10px 14px",
                      borderRadius: emojiOnly ? 0 : 16,
                      borderBottomRightRadius: isMe && !emojiOnly ? 4 : 16,
                      borderBottomLeftRadius: !isMe && !emojiOnly ? 4 : 16,
                      maxWidth: "78%",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      fontFamily: emojiOnly
                        ? '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif'
                        : "'Inter', sans-serif",
                      lineHeight: emojiOnly ? 1.1 : 1.375,
                      margin: "0 16px",
                      border: emojiOnly ? "none" : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: emojiOnly ? "none" : "0 2px 8px rgba(0,0,0,0.18)",
                    }}
                  >
                    {safeText}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} style={{ height: 12 }} />
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "absolute",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--danger)",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 14,
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          animation: "toast-in 0.2s ease-out"
        }}>
          {toast}
        </div>
      )}

      {replyingTo && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "8px 8px 0 0",
          marginBottom: "-8px",
          borderLeft: `3px solid ${roomData?.playerColors?.[replyingTo.playerId] || "var(--accent)"}`,
          zIndex: 10,
        }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }}>
              Replying to {replyingTo.playerName}
            </span>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replyingTo.text}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setReplyingTo(null); }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {showEmojiPicker && (
          <div
            ref={pickerRef}
            style={{
              position: "absolute",
              bottom: "calc(100% + 12px)",
              right: 0,
              zIndex: 999,
              background: "var(--bg-secondary)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              overflow: "hidden",
            }}
          >
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(emojiData: any) => {
                const emoji = emojiData?.emoji || "";
                const el = textareaRef.current;
                if (!el) {
                  setChatInput((prev) => prev + emoji);
                  return;
                }

                const start = el.selectionStart ?? chatInput.length;
                const end = el.selectionEnd ?? chatInput.length;
                setChatInput((prev) => prev.slice(0, start) + emoji + prev.slice(end));

                requestAnimationFrame(() => {
                  const pos = start + emoji.length;
                  el.focus();
                  el.setSelectionRange(pos, pos);
                });
              }}
              style={{ width: "100%", maxWidth: "320px", border: "none" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            backgroundColor: "var(--bg-input)",
            borderRadius: replyingTo ? "0 0 16px 16px" : 16,
            padding: "8px 12px",
            gap: 8,
          }}
        >
          <button
            disabled
            style={{
              width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0,
              borderRadius: "50%", backgroundColor: "var(--text-secondary)",
              color: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", fontSize: 18, fontWeight: "bold", cursor: "not-allowed", flexShrink: 0, marginBottom: 2,
            }}
          >+</button>

          <textarea
            ref={textareaRef}
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(e) => {
              if (isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            onFocus={() => {
              isNearBottom.current = true;
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }}
            rows={1}
            placeholder="Message #game-room"
            style={{
              flex: 1, minWidth: 0, padding: "6px 0", lineHeight: "20px", maxHeight: "120px", overflowY: "auto",
              background: "transparent", resize: "none", border: "none", outline: "none", color: "inherit",
              fontFamily: "'Inter', sans-serif", fontSize: 15,
            }}
          />

          <button
            ref={buttonRef}
            onClick={() => setShowEmojiPicker((p) => !p)}
            style={{
              minHeight: 28, minWidth: 28, padding: 0, background: "transparent",
              color: "var(--text-secondary)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer", marginBottom: 2,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM8.5 9.5C9.328 9.5 10 10.172 10 11C10 11.828 9.328 12.5 8.5 12.5C7.672 12.5 7 11.828 7 11C7 10.172 7.672 9.5 8.5 9.5ZM12 17.5C9.669 17.5 7.697 16.037 6.88 14H17.12C16.303 16.037 14.331 17.5 12 17.5ZM15.5 12.5C14.672 12.5 14 11.828 14 11C14 10.172 14.672 9.5 15.5 9.5C16.328 9.5 17 10.172 17 11C17 11.828 16.328 12.5 15.5 12.5Z" />
            </svg>
          </button>

          <button
            onClick={onSendMessage}
            disabled={!chatInput.trim() || isSending}
            style={{
              minHeight: 28, minWidth: 28, padding: 0, background: "transparent", border: "none",
              color: chatInput.trim() && !isSending ? "var(--accent)" : "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: chatInput.trim() && !isSending ? "pointer" : "default", flexShrink: 0, marginBottom: 2,
              opacity: isSending ? 0.7 : 1,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.06-.87.49-.87.99l.01 4.61c0 .71.73 1.2 1.39.92z" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}