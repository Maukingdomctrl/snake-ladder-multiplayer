import { useState, useRef, useEffect } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { sendMessage, Room } from "../firebase/rooms";

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  at: any;
  replyTo?: {
    id: string;
    text: string;
    playerId: string;
    playerName: string;
  } | null;
}

function formatTime(at: any): string {
  if (!at) return "";
  const date = typeof at.toDate === "function" ? at.toDate() : new Date(at.seconds ? at.seconds * 1000 : at);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getMessageTime(at: any): number {
  if (!at) return 0;
  const date = typeof at.toDate === "function" ? at.toDate() : new Date(at.seconds ? at.seconds * 1000 : at);
  return date.getTime();
}

// FIX 7: Added \u20E3 (combining keycap mark) to the stripped characters
const isEmojiOnly = (text: string) => {
  const cleaned = text.replace(/\uFE0F/g, '').replace(/\u200D/g, '').replace(/\u20E3/g, '').replace(/\s/g, '');
  if (!cleaned) return false;
  return /^(\p{Extended_Pictographic})+$/u.test(cleaned);
};

interface ChatProps {
  messages: any[];
  playerId: string;
  playerName: string;
  activeRoomId: string;
  roomData: Room | null;
}

export default function Chat({ messages, playerId, playerName, activeRoomId, roomData }: ChatProps) {
  const [chatInput, setChatInput] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const isNearBottom = useRef(true);

  // FIX 8: Clean up messageRefs to prevent memory leaks
  useEffect(() => {
    const currentIds = new Set(messages.map(m => m.id));
    Object.keys(messageRefs.current).forEach(id => {
      if (!currentIds.has(id)) {
        delete messageRefs.current[id];
      }
    });
  }, [messages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottom.current = distanceFromBottom < 150;
  };

  useEffect(() => {
    if (isNearBottom.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [chatInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  // FIX 1: Error handling on send. Restore state on failure.
  const onSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId) return;
    
    const prevText = chatInput;
    const prevReply = replyingTo;
    
    setChatInput("");
    setReplyingTo(null);
    setShowEmojiPicker(false);
    isNearBottom.current = true;
    
    const replyPayload = prevReply ? {
      id: prevReply.id,
      text: prevReply.text.substring(0, 100),
      playerId: prevReply.playerId,
      playerName: prevReply.playerName
    } : null;

    try {
      await sendMessage(activeRoomId, playerId, playerName, text, replyPayload);
    } catch (error) {
      console.error("Failed to send message:", error);
      setChatInput(prevText);
      setReplyingTo(prevReply);
      alert("Failed to send message. Please try again.");
    }
  };

  // FIX 3: Race condition fix. Clear previous timeout before setting a new one.
  // FIX 4: Fallback if message is aged out of the 50-message window.
  const scrollToMessage = (id: string) => {
    const target = messageRefs.current[id];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setHighlightedId(id);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
    } else {
      alert("Original message is too old to scroll to.");
    }
  };

  let lastSenderId: string | null = null;
  let lastMessageTime = 0;

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
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40, fontSize: 14, padding: "0 20px" }}>
            No messages yet. <br/> Start the conversation!
          </div>
        )}
        
        {messages.map((m) => {
          const isMe = m.playerId === playerId;
          const messageTime = getMessageTime(m.at);
          // FIX 2: Message grouping checks time gap (5 minutes = 300,000 ms)
          const isTimeGap = messageTime - lastMessageTime > 300000;
          const isFirstInGroup = lastSenderId !== m.playerId || isTimeGap;
          lastSenderId = m.playerId;
          if (messageTime > 0) lastMessageTime = messageTime;
          
          const timeString = formatTime(m.at);
          const emojiOnly = isEmojiOnly(m.text);

          return (
            <div
              key={m.id}
              ref={(el) => { messageRefs.current[m.id] = el; }}
              onClick={() => { setReplyingTo(m); textareaRef.current?.focus(); }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                marginTop: isFirstInGroup ? 16 : 2,
                marginBottom: 2,
                width: '100%',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                backgroundColor: highlightedId === m.id ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                animation: 'msg-in 0.2s ease-out',
              }}
            >
              {/* Reply Quote */}
              {m.replyTo && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollToMessage(m.replyTo.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    // FIX (Colors): Brighter overlay instead of darkening an already dark bg
                    backgroundColor: 'rgba(255, 255, 255, 0.06)', 
                    borderLeft: `2px solid ${roomData?.playerColors?.[m.replyTo.playerId] || 'var(--text-muted)'}`,
                    padding: '4px 8px',
                    borderRadius: 4,
                    marginBottom: 4,
                    maxWidth: '85%',
                    overflow: 'hidden',
                    margin: '0 16px 4px 16px',
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: roomData?.playerColors?.[m.replyTo.playerId] || "var(--text-secondary)", fontWeight: 700, fontSize: 11 }}>
                      {m.replyTo.playerName}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.replyTo.text}
                    </span>
                  </div>
                </div>
              )}

              <div
                className={isFirstInGroup ? "chat-row" : "chat-row chat-grouped"}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  width: '100%',
                }}
              >
                {isFirstInGroup && (
                  <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "center", marginBottom: 4, padding: "0 16px" }}>
                    <div
                      className="avatar"
                      style={{
                        backgroundColor: roomData?.playerColors?.[m.playerId] || "#ccc",
                        marginRight: isMe ? 0 : 12,
                        marginLeft: isMe ? 12 : 0,
                        width: 28, height: 28, fontSize: 12
                      }}
                    >
                      {m.playerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="chat-sender" style={{ color: roomData?.playerColors?.[m.playerId] || "var(--text-primary)" }}>
                      {m.playerName}
                    </span>
                    <span className="chat-timestamp">{timeString}</span>
                  </div>
                )}

                <div
                  style={{
                    // FIX (Colors): Use solid surface tone for received messages instead of invisible tint
                    backgroundColor: emojiOnly 
                      ? "transparent" 
                      : isMe 
                        ? "rgba(35, 165, 89, 0.9)" 
                        : "var(--bg-tertiary)",
                    color: emojiOnly ? "inherit" : isMe ? "#fff" : "var(--text-primary)",
                    fontSize: emojiOnly ? 42 : 14,
                    padding: emojiOnly ? "0 8px" : "10px 14px",
                    borderRadius: emojiOnly ? 0 : 16,
                    borderBottomRightRadius: isMe && !emojiOnly ? 4 : 16,
                    borderBottomLeftRadius: !isMe && !emojiOnly ? 4 : 16,
                    maxWidth: "85%",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    fontFamily: emojiOnly 
                      ? "'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif" 
                      : "'Inter', sans-serif",
                    lineHeight: emojiOnly ? 1 : 1.375,
                    margin: emojiOnly ? "0 16px" : "0 16px",
                    boxShadow: emojiOnly ? "none" : "0 1px 2px rgba(0,0,0,0.1)",
                  }}
                  className="chat-message"
                >
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} style={{ height: 12 }} />
      </div>

      {/* Reply Preview Bar */}
      {replyingTo && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '8px 8px 0 0',
          marginBottom: '-8px',
          borderLeft: `3px solid ${roomData?.playerColors?.[replyingTo.playerId] || 'var(--accent)'}`,
          zIndex: 10,
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>
              Replying to {replyingTo.playerName}
            </span>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingTo.text}
            </p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setReplyingTo(null); }} 
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)', 
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}

      {/* Input Area */}
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
              // FIX 6: Refocus textarea after picking an emoji
              onEmojiClick={(emojiData: any) => {
                setChatInput((prev) => prev + emojiData.emoji);
                textareaRef.current?.focus();
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
              border: "none", fontSize: 18, fontWeight: "bold", cursor: "not-allowed", flexShrink: 0, marginBottom: 2
            }}
          >
            +
          </button>

          <textarea
            ref={textareaRef}
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              // FIX 5: IME composition check. Don't send if user is composing CJK characters.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
              fontSize: 15
            }}
          />

          <button
            ref={buttonRef}
            onClick={() => setShowEmojiPicker((p) => !p)}
            style={{
              minHeight: 28, minWidth: 28, padding: 0, background: "transparent",
              color: "var(--text-secondary)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer", marginBottom: 2
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM8.5 9.5C9.328 9.5 10 10.172 10 11C10 11.828 9.328 12.5 8.5 12.5C7.672 12.5 7 11.828 7 11C7 10.172 7.672 9.5 8.5 9.5ZM12 17.5C9.669 17.5 7.697 16.037 6.88 14H17.12C16.303 16.037 14.331 17.5 12 17.5ZM15.5 12.5C14.672 12.5 14 11.828 14 11C14 10.172 14.672 9.5 15.5 9.5C16.328 9.5 17 10.172 17 11C17 11.828 16.328 12.5 15.5 12.5Z" />
            </svg>
          </button>

          <button
            onClick={onSendMessage}
            disabled={!chatInput.trim()}
            style={{
              minHeight: 28, minWidth: 28, padding: 0, background: "transparent", border: "none",
              color: chatInput.trim() ? "var(--accent)" : "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: chatInput.trim() ? "pointer" : "default", flexShrink: 0, marginBottom: 2
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
      `}</style>
    </div>
  );
}