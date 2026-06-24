import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import {
  sendMessage,
  Room,
  RoomMessage,
  MessageReply,
  toMillis,
} from "../firebase/rooms";

// 1. STRICT TYPE: Removed 'any'. Using a generic unknown or specific Firebase Timestamp type
function formatTime(at: Parameters<typeof toMillis>[0]): string {
  const ms = toMillis(at);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const getDateString = (ms: number) => {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const emojiOnlyRegex =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|\uFE0F\u20E3)*)+$/u;

const isEmojiOnly = (text: string) => {
  const t = (text || "").trim();
  return t ? emojiOnlyRegex.test(t.replace(/\s+/g, "")) : false;
};

const getEmojiFontSize = (text: string) => {
  const cleaned = (text || "").trim();
  let count = 0;
  // Intl.Segmenter is not fully typed in all TS DOM libs yet, so casting the constructor is acceptable here
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter !== "undefined") {
    count = [
      ...new Segmenter(undefined, { granularity: "grapheme" }).segment(cleaned),
    ].length;
  } else {
    count = [...cleaned].length;
  }
  if (count <= 1) return 56;
  if (count <= 3) return 46;
  if (count <= 6) return 36;
  return 28;
};

// ─── ★★★ MEMOIZED MESSAGE ITEM ★★★ ───

interface MessageItemProps {
  m: RoomMessage & { isFirstInGroup: boolean; showDateSeparator: boolean; isDiceRoll?: boolean }; // Added hypothetical isDiceRoll flag
  isMe: boolean;
  playerId: string;
  playerColor: string;
  timeString: string;
  emojiOnly: boolean;
  emojiSize: number;
  messageTime: number;
  highlightedId: string | null;
  onReply: (m: RoomMessage) => void; // 1. STRICT TYPE: Replaced 'any' with RoomMessage
  onScrollToReply: (id: string) => void;
  messageRef: (el: HTMLDivElement | null) => void;
  inDrawer: boolean;
}

const MessageItem = memo(function MessageItem({
  m,
  isMe,
  playerColor,
  timeString,
  emojiOnly,
  emojiSize,
  messageTime,
  highlightedId,
  onReply,
  onScrollToReply,
  messageRef,
}: MessageItemProps) {
  const safeText = typeof m.text === "string" ? m.text : "";
  const safeName =
    typeof m.playerName === "string" && m.playerName
      ? m.playerName
      : m.playerId || "Player";

  // 2. CSS FALLBACK: Local state to track if a dice inside this specific message is animating
  const [isRolling, setIsRolling] = useState(false);

  return (
    <>
      {m.showDateSeparator && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "16px 16px",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 8px" }}>
            {getDateString(messageTime)}
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      )}

      <div
        ref={messageRef}
        onClick={() => {
          const sel = window.getSelection()?.toString();
          if (!sel) onReply(m);
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
          backgroundColor:
            highlightedId === m.id ? "rgba(245, 158, 11, 0.1)" : "transparent",
          animation: "msg-in 0.2s ease-out",
          opacity: m.isPending ? 0.6 : 1,
        }}
      >
        {m.replyTo && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onScrollToReply(m.replyTo!.id);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderLeft: `2px solid ${playerColor}`,
              padding: "4px 8px",
              borderRadius: 4,
              marginBottom: 4,
              maxWidth: "78%",
              overflow: "hidden",
              margin: "0 16px 4px 16px",
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span style={{ color: playerColor, fontWeight: 700, fontSize: 11 }}>
                {m.replyTo.playerName}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.replyTo.text}
              </span>
            </div>
          </div>
        )}

        {/* 2. CSS FALLBACK: Dynamically append the fallback class if the dice is actively rolling */}
        <div
          className={`chat-row ${!m.isFirstInGroup ? 'chat-grouped' : ''} ${isRolling ? 'has-active-dice' : ''}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isMe ? "flex-end" : "flex-start",
            width: "100%",
          }}
        >
          {m.isFirstInGroup && (
            <div
              style={{
                display: "flex",
                flexDirection: isMe ? "row-reverse" : "row",
                alignItems: "center",
                marginBottom: 4,
                padding: "0 16px",
              }}
            >
              <div
                className="avatar"
                style={{
                  backgroundColor: playerColor,
                  marginRight: isMe ? 0 : 12,
                  marginLeft: isMe ? 12 : 0,
                  width: 28,
                  height: 28,
                  fontSize: 12,
                }}
              >
                {[...safeName][0]?.toUpperCase() ?? "?"}
              </div>
              <span className="chat-sender" style={{ color: playerColor }}>
                {safeName}
              </span>
              <span className="chat-timestamp">{timeString}</span>
            </div>
          )}

          <div
            className="chat-message"
            style={{
              background: emojiOnly
                ? "transparent"
                : isMe
                ? "var(--bg-base)"
                : "var(--bg-tertiary)",
              color: emojiOnly
                ? "inherit"
                : isMe
                ? "var(--text-secondary)"
                : "var(--text-primary)",
              fontSize: emojiSize,
              padding: emojiOnly ? "0 8px" : "10px 14px",
              borderRadius: emojiOnly ? 0 : 16,
              borderBottomRightRadius: isMe && !emojiOnly ? 4 : 16,
              borderBottomLeftRadius: !isMe && !emojiOnly ? 4 : 16,
              maxWidth: "78%",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              fontFamily: emojiOnly
                ? '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
                : "'Inter', sans-serif",
              lineHeight: emojiOnly ? 1.1 : 1.375,
              margin: "0 16px",
              border: emojiOnly ? "none" : "1px solid rgba(255,255,255,0.06)",
              boxShadow: emojiOnly ? "none" : "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            {safeText}
            
            {/* ─── INJECTION ZONE: Here is where you drop the DiceRow ─── */}
            {/* {m.isDiceRoll && (
                <DiceRow 
                  onRoll={async () => {
                    setIsRolling(true);
                    // trigger standard roll logic
                  }}
                  onRollComplete={() => setIsRolling(false)}
                  // ... rest of props
                />
              )}
            */}
            
          </div>
        </div>
      </div>
    </>
  );
});

// ─── Main Chat Component ───

interface ChatProps {
  messages: RoomMessage[];
  playerId: string;
  playerName: string;
  activeRoomId: string;
  roomData: Room | null;
  inDrawer?: boolean;
}

export default function Chat({
  messages,
  playerId,
  playerName,
  activeRoomId,
  roomData,
  inDrawer = false,
}: ChatProps) {
  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<RoomMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<RoomMessage[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottom = useRef(true);
  const hasMountedRef = useRef(false);
  const sendAttemptRef = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const processedMessages = useMemo(() => {
    const serverClientAts = new Set(messages.map((m) => m.clientAt));
    const activeOptimistic = optimisticMessages.filter(
      (om) => !serverClientAts.has(om.clientAt)
    );
    const all = [...activeOptimistic, ...messages];
    all.sort(
      (a, b) =>
        (toMillis(a.at) || a.clientAt) - (toMillis(b.at) || b.clientAt)
    );

    let lastSid: string | null = null,
      lastTime = 0,
      lastDate = new Date(0);
    return all.map((m) => {
      const mt = toMillis(m.at) || m.clientAt;
      const md = new Date(mt);
      const gap = mt - lastTime > 300000;
      const first = lastSid !== m.playerId || gap;
      const dateSep = !isSameDay(lastDate, md);
      lastSid = m.playerId;
      if (mt > 0) lastTime = mt;
      lastDate = md;
      return { ...m, isFirstInGroup: first, showDateSeparator: dateSep };
    });
  }, [messages, optimisticMessages]);

  useEffect(() => {
    const ids = new Set(
      processedMessages.map((m) => m.id).filter(Boolean) as string[]
    );
    Object.keys(messageRefs.current).forEach((id) => {
      if (!ids.has(id)) delete messageRefs.current[id];
    });
  }, [processedMessages]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // 1. STRICT TYPE: Corrected UIEvent type
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement, UIEvent>) => {
    const t = e.currentTarget;
    isNearBottom.current = t.scrollHeight - t.scrollTop - t.clientHeight < 150;
  }, []);

  useEffect(() => {
    if (isNearBottom.current) {
      scrollToBottom(hasMountedRef.current ? "smooth" : "auto");
      hasMountedRef.current = true;
    }
  }, [processedMessages.length, scrollToBottom]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [chatInput]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      )
        setShowEmojiPicker(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchend", handler);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!inDrawer) return;
    const c = scrollContainerRef.current;
    if (!c) return;
    let lastY = 0;
    const onStart = (e: TouchEvent) => {
      lastY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = c;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      if (
        (atTop && e.touches[0].clientY > lastY) ||
        (atBottom && e.touches[0].clientY < lastY)
      )
        e.preventDefault();
      lastY = e.touches[0].clientY;
    };
    c.addEventListener("touchstart", onStart, { passive: true });
    c.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      c.removeEventListener("touchstart", onStart);
      c.removeEventListener("touchmove", onMove);
    };
  }, [inDrawer]);

  const onSendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId || isSending) return;
    const prevText = chatInput,
      prevReply = replyingTo,
      attemptId = ++sendAttemptRef.current,
      clientAt = Date.now();

    setIsSending(true);
    setChatInput("");
    setReplyingTo(null);
    setShowEmojiPicker(false);
    isNearBottom.current = true;

    const replyPayload: MessageReply | null = prevReply?.id
      ? {
          id: prevReply.id,
          text: (prevReply.text || "").substring(0, 100),
          playerId: prevReply.playerId,
          playerName: prevReply.playerName,
        }
      : null;

    setOptimisticMessages((p) => [
      ...p,
      {
        id: `opt-${clientAt}`,
        playerId,
        playerName,
        text,
        at: null as any, // Null satisfies the optimistic state before server response
        clientAt,
        replyTo: replyPayload,
        isPending: true,
      },
    ]);

    try {
      await sendMessage(
        activeRoomId,
        playerId,
        playerName,
        text,
        replyPayload
      );
      setOptimisticMessages((p) => p.filter((m) => m.clientAt !== clientAt));
    } catch {
      setOptimisticMessages((p) => p.filter((m) => m.clientAt !== clientAt));
      if (sendAttemptRef.current === attemptId) {
        setChatInput((c) => (c.trim() ? c : prevText));
        setReplyingTo((c) => c ?? prevReply);
      }
      showToast("Failed to send message.");
    } finally {
      if (sendAttemptRef.current === attemptId) setIsSending(false);
    }
  }, [
    chatInput,
    activeRoomId,
    isSending,
    playerId,
    playerName,
    replyingTo,
    showToast,
  ]);

  const scrollToMessage = useCallback(
    (id: string) => {
      const target = messageRefs.current[id];
      const container = scrollContainerRef.current;
      if (!target || !container) {
        showToast("Original message not found.");
        return;
      }
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      container.scrollTo({
        top:
          tRect.top -
          cRect.top +
          container.scrollTop -
          container.clientHeight / 2 +
          tRect.height / 2,
        behavior: "smooth",
      });
      if (highlightTimeoutRef.current)
        clearTimeout(highlightTimeoutRef.current);
      setHighlightedId(id);
      highlightTimeoutRef.current = setTimeout(
        () => setHighlightedId(null),
        1500
      );
    },
    [showToast]
  );

  const handleReply = useCallback((m: RoomMessage) => {
    setReplyingTo(m);
    textareaRef.current?.focus();
  }, []);

  const handleMessageRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (id) messageRefs.current[id] = el;
    },
    []
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
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
          overscrollBehaviorY: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {processedMessages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              marginTop: 40,
              fontSize: 14,
              padding: "0 20px",
            }}
          >
            No messages yet.
            <br />
            Start the conversation!
          </div>
        )}

        {processedMessages.map((m) => (
          <MessageItem
            key={m.id || `opt-${m.clientAt}`}
            m={m}
            isMe={m.playerId === playerId}
            playerId={playerId}
            playerColor={
              roomData?.playerColors?.[m.playerId] || "var(--text-primary)"
            }
            timeString={formatTime(m.at)}
            emojiOnly={isEmojiOnly(typeof m.text === "string" ? m.text : "")}
            emojiSize={
              isEmojiOnly(typeof m.text === "string" ? m.text : "")
                ? getEmojiFontSize(m.text as string)
                : 14
            }
            messageTime={toMillis(m.at) || m.clientAt}
            highlightedId={highlightedId}
            onReply={handleReply}
            onScrollToReply={scrollToMessage}
            messageRef={handleMessageRef(m.id || "")}
            inDrawer={inDrawer}
          />
        ))}

        <div style={{ height: 12 }} />
      </div>

      {toast && (
        <div
          style={{
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
            animation: "toast-in 0.2s ease-out",
          }}
        >
          {toast}
        </div>
      )}

      {replyingTo && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            backgroundColor: "var(--bg-tertiary)",
            borderRadius: "8px 8px 0 0",
            marginBottom: "-8px",
            borderLeft: `3px solid ${
              roomData?.playerColors?.[replyingTo.playerId] || "var(--accent)"
            }`,
            zIndex: 10,
          }}
        >
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            <span
              style={{
                color: "var(--accent)",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Replying to {replyingTo.playerName}
            </span>
            <p
              style={{
                margin: 0,
                color: "var(--text-muted)",
                fontSize: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {replyingTo.text}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}

      <div style={{ position: "relative", flexShrink: 0 }}>
        {showEmojiPicker && (
          <div
            ref={pickerRef}
            style={
              inDrawer
                ? {
                    height: 260,
                    overflow: "hidden",
                    borderRadius: 8,
                    marginBottom: 8,
                    background: "var(--bg-secondary)",
                    boxShadow: "var(--shadow-md)",
                  }
                : {
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 999,
                    width: 308,
                    background: "var(--bg-secondary)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                    overflow: "hidden",
                  }
            }
          >
            <EmojiPicker
              theme={Theme.DARK}
              /* 1. STRICT TYPE: Replaced 'any' with EmojiClickData */
              onEmojiClick={(emojiData: EmojiClickData) => {
                const emoji = emojiData?.emoji || "";
                const el = textareaRef.current;
                if (!el) {
                  setChatInput((p) => p + emoji);
                  return;
                }
                const start = el.selectionStart ?? chatInput.length;
                const end = el.selectionEnd ?? chatInput.length;
                setChatInput(
                  (p) => p.slice(0, start) + emoji + p.slice(end)
                );
                requestAnimationFrame(() => {
                  const pos = start + emoji.length;
                  el.focus();
                  el.setSelectionRange(pos, pos);
                });
              }}
              style={{
                width: inDrawer ? "100%" : 308,
                height: inDrawer ? 260 : 350,
                border: "none",
              }}
            />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSendMessage();
          }}
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
            type="button"
            disabled
            style={{
              width: 28,
              height: 28,
              minWidth: 28,
              minHeight: 28,
              padding: 0,
              borderRadius: "50%",
              backgroundColor: "var(--text-secondary)",
              color: "var(--bg-input)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              fontSize: 18,
              fontWeight: "bold",
              cursor: "not-allowed",
              flexShrink: 0,
              marginBottom: 2,
            }}
          >
            +
          </button>

          <textarea
            ref={textareaRef}
            className="chat-input"
            value={chatInput}
            enterKeyHint="send"
            autoCapitalize="sentences"
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
              requestAnimationFrame(() => scrollToBottom("smooth"));
            }}
            rows={1}
            placeholder="Message #game-room"
            autoComplete="off"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 0",
              lineHeight: "20px",
              maxHeight: "120px",
              overflowY: "auto",
              background: "transparent",
              resize: "none",
              border: "none",
              outline: "none",
              color: "inherit",
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
            }}
          />

          <button
            type="button"
            ref={buttonRef}
            onClick={() => setShowEmojiPicker((p) => !p)}
            onMouseDown={e => e.preventDefault()}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              color: showEmojiPicker
                ? "var(--accent)"
                : "var(--text-secondary)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
              marginBottom: 2,
              transition: "color 0.15s ease",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM8.5 9.5C9.328 9.5 10 10.172 10 11C10 11.828 9.328 12.5 8.5 12.5C7.672 12.5 7 11.828 7 11C7 10.172 7.672 9.5 8.5 9.5ZM12 17.5C9.669 17.5 7.697 16.037 6.88 14H17.12C16.303 16.037 14.331 17.5 12 17.5ZM15.5 12.5C14.672 12.5 14 11.828 14 11C14 10.172 14.672 9.5 15.5 9.5C16.328 9.5 17 10.172 17 11C17 11.828 16.328 12.5 15.5 12.5Z" />
            </svg>
          </button>

          <button
            type="submit"
            disabled={!chatInput.trim() || isSending}
            onMouseDown={e => e.preventDefault()}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              border: "none",
              color:
                chatInput.trim() && !isSending
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor:
                chatInput.trim() && !isSending ? "pointer" : "default",
              flexShrink: 0,
              marginBottom: 2,
              opacity: isSending ? 0.7 : 1,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.06-.87.49-.87.99l.01 4.61c0 .71.73 1.2 1.39.92z" />
            </svg>
          </button>
        </form>
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