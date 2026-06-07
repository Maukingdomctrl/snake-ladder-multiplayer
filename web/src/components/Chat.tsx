import { useState, useRef, useEffect } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { sendMessage, Room } from "../firebase/rooms";

function formatTime(at: any): string {
  if (!at) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = typeof at.toDate === "function" ? at.toDate() : new Date(at.seconds ? at.seconds * 1000 : at);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const isEmojiOnly = (text: string) => {
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;
  return emojiRegex.test(text.trim()) && text.trim().length <= 8;
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [messages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, []);

  const onSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeRoomId) return;
    setChatInput("");
    setShowEmojiPicker(false);
    await sendMessage(activeRoomId, playerId, playerName, text);
  };

  let lastSenderId: string | null = null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 0 0 0",
          marginBottom: 8,
          backgroundColor: "var(--bg-primary)",
          borderRadius: 8,
        }}
      >
        {messages.map((m) => {
          const isMe = m.playerId === playerId;
          const isFirstInGroup = lastSenderId !== m.playerId;
          lastSenderId = m.playerId;
          const timeString = formatTime(m.at);
          const emojiOnly = isEmojiOnly(m.text);

          return (
            <div
              key={m.id}
              className={isFirstInGroup ? "chat-row" : "chat-row chat-grouped"}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
                marginTop: isFirstInGroup ? 12 : 2,
                marginBottom: 2,
              }}
            >
              {isFirstInGroup && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMe ? "row-reverse" : "row",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div
                    className="avatar"
                    style={{
                      backgroundColor: roomData?.playerColors?.[m.playerId] || "#ccc",
                      marginRight: isMe ? 0 : 12,
                      marginLeft: isMe ? 12 : 0,
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
                  backgroundColor: emojiOnly ? "transparent" : isMe ? "var(--accent)" : "var(--bg-input)",
                  color: emojiOnly ? "inherit" : isMe ? "#fff" : "var(--text-primary)",
                  fontSize: emojiOnly ? 32 : 14,
                  padding: emojiOnly ? "4px 8px" : "8px 12px",
                  borderRadius: emojiOnly ? 8 : 16,
                  borderBottomRightRadius: isMe ? 4 : 16,
                  borderBottomLeftRadius: !isMe ? 4 : 16,
                  maxWidth: "85%",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
                className="chat-message"
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} style={{ height: 12 }} />
      </div>

      <div style={{ position: "relative" }}>
        {showEmojiPicker && (
          <div
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
              onEmojiClick={(emojiData: any) => setChatInput((prev) => prev + emojiData.emoji)}
              style={{ width: "100%", maxWidth: "320px", border: "none" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "var(--bg-input)",
            borderRadius: 24,
            padding: "8px 16px",
            gap: 12,
          }}
        >
          <button
            disabled
            style={{
              width: 24,
              height: 24,
              minWidth: 24,
              minHeight: 24,
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
            }}
          >
            +
          </button>

          <textarea
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            onFocus={() => {
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
              }, 300);
            }}
            rows={1}
            placeholder="Message #game-room"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "2px 0",
              lineHeight: "20px",
              maxHeight: "120px",
              background: "transparent",
              resize: "none",
              border: "none",
              outline: "none",
              color: "inherit"
            }}
          />

          <button
            onClick={() => setShowEmojiPicker((p) => !p)}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              color: "var(--text-secondary)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer"
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM8.5 9.5C9.328 9.5 10 10.172 10 11C10 11.828 9.328 12.5 8.5 12.5C7.672 12.5 7 11.828 7 11C7 10.172 7.672 9.5 8.5 9.5ZM12 17.5C9.669 17.5 7.697 16.037 6.88 14H17.12C16.303 16.037 14.331 17.5 12 17.5ZM15.5 12.5C14.672 12.5 14 11.828 14 11C14 10.172 14.672 9.5 15.5 9.5C16.328 9.5 17 10.172 17 11C17 11.828 16.328 12.5 15.5 12.5Z" />
            </svg>
          </button>

          <button
            onClick={onSendMessage}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              border: "none",
              color: chatInput.trim() ? "var(--accent)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: chatInput.trim() ? "auto" : "none",
              flexShrink: 0,
              cursor: chatInput.trim() ? "pointer" : "default"
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.06-.87.49-.87.99l.01 4.61c0 .71.73 1.2 1.39.92z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}