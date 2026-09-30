import { useState, useRef, useEffect, useMemo, useCallback, memo, ReactNode, lazy, Suspense } from "react";
import { twemojify } from "./Twemoji";
import { sendMessage, deleteMessage, Room, RoomMessage, MessageReply, toMillis } from "../firebase/rooms";
import { compressImage } from "./imageUtils";

// Full picker (search + categories) only downloads the first time it is opened
const EmojiPanel = lazy(() => import("./EmojiPanel"));


const GROUP_WINDOW_MS = 5 * 60 * 1000;
const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const emojiOnlyRe = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|\s)+$/u;

function formatTime(ms: number) {
  return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

const msgTime = (m: RoomMessage) => toMillis(m.at) || m.clientAt || 0;

type Member = { id: string; name: string; color: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Turns links into clickable anchors, then renders mentions + emoji in the rest. */
function renderText(text: string, members: Member[], myId: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    // Leave trailing punctuation outside the link: "see google.com." -> "google.com"
    const url = match[0].replace(/[.,!?;:)\]'"]+$/, "");
    const start = match.index!;
    if (start > last) out.push(...renderMentions(text.slice(last, start), members, myId, `t${start}-`));
    const href = url.startsWith("www.") ? `https://${url}` : url;
    out.push(
      <a key={`l${start}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(...renderMentions(text.slice(last), members, myId, `t${last}-`));
  return out;
}

/** Splits text into plain runs and highlighted @mentions of room members. */
function renderMentions(text: string, members: Member[], myId: string, keyPrefix: string): ReactNode[] {
  if (!members.length || !text.includes("@")) return twemojify(text, keyPrefix);
  // Longest names first so "@Mau K" wins over "@Mau"
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      const rest = text.slice(i + 1).toLowerCase();
      const hit = sorted.find((m) => rest.startsWith(m.name.toLowerCase()));
      if (hit) {
        if (buf) out.push(...twemojify(buf, `${keyPrefix}${i}-`));
        buf = "";
        out.push(
          <span key={`${keyPrefix}m${i}`} className={`mention ${hit.id === myId ? "mention-me" : ""}`}>
            @{hit.name}
          </span>
        );
        i += hit.name.length + 1;
        continue;
      }
    }
    buf += text[i++];
  }
  if (buf) out.push(...twemojify(buf, `${keyPrefix}end-`));
  return out;
}

interface RowProps {
  m: RoomMessage;
  grouped: boolean;
  isMe: boolean;
  mentionsMe: boolean;
  selected: boolean;
  flash: boolean;
  color: string;
  members: Member[];
  myId: string;
  onSelect: (id: string | null) => void;
  onReply: (m: RoomMessage) => void;
  onJump: (id: string) => void;
  onCopy: (m: RoomMessage) => void;
  onDelete: (m: RoomMessage) => void;
  onOpenImage: (src: string) => void;
}

const MessageRow = memo(function MessageRow({
  m, grouped, isMe, mentionsMe, selected, flash, color, members, myId, onSelect, onReply, onJump, onCopy, onDelete, onOpenImage,
}: RowProps) {
  const text = m.text || "";
  const big = !!text && text.length <= 16 && emojiOnlyRe.test(text);
  return (
    <div
      id={`msg-${m.id}`}
      className={`msg ${grouped ? "msg-grouped" : ""} ${mentionsMe ? "msg-mentioned" : ""} ${
        selected ? "msg-selected" : ""
      } ${flash ? "msg-flash" : ""} ${m.isPending ? "msg-pending" : ""}`}
      onClick={() => isTouch && onSelect(selected ? null : m.id!)}
    >
      {m.replyTo && (
        <button className="msg-replyref" onClick={(e) => (e.stopPropagation(), onJump(m.replyTo!.id))}>
          <span className="msg-replyref-line" />
          <b>{m.replyTo.playerName}</b>
          <span className="msg-replyref-text">{twemojify(m.replyTo.text)}</span>
        </button>
      )}
      {!grouped && (
        <div className="msg-head">
          <span className="msg-name" style={{ color }}>{m.playerName}</span>
          <span className="msg-time">{formatTime(msgTime(m))}</span>
        </div>
      )}
      {text && <div className={`msg-text ${big ? "msg-big" : ""}`}>{renderText(text, members, myId)}</div>}
      {m.image && (
        <img
          className="msg-image"
          src={m.image}
          alt="Shared image"
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            onOpenImage(m.image!);
          }}
        />
      )}
      {!m.isPending && (
        <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
          <button title="Reply" onClick={() => onReply(m)}>↩ Reply</button>
          {text && <button title="Copy text" onClick={() => onCopy(m)}>⧉ Copy</button>}
          {isMe && (
            <button title="Delete" className="danger" onClick={() => onDelete(m)}>
              🗑 Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
});

interface ChatProps {
  messages: RoomMessage[];
  playerId: string;
  playerName: string;
  activeRoomId: string;
  roomData: Room | null;
  inDrawer?: boolean;
  /** When set, a ✕ in the input row closes the chat (phone layout). */
  onClose?: () => void;
}

export default function Chat({ messages, playerId, playerName, activeRoomId, roomData, onClose }: ChatProps) {
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<RoomMessage | null>(null);
  const [pending, setPending] = useState<RoomMessage[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  const members: Member[] = useMemo(
    () =>
      (roomData?.players || []).map((id) => ({
        id,
        name: roomData?.playerNames?.[id] || "Player",
        color: roomData?.playerColors?.[id] || "var(--text-primary)",
      })),
    [roomData?.players, roomData?.playerNames, roomData?.playerColors]
  );
  const colorOf = useCallback(
    (id: string) => members.find((m) => m.id === id)?.color || "var(--text-secondary)",
    [members]
  );

  // Drop optimistic copies once the real message arrives from Firestore
  useEffect(() => {
    setPending((p) =>
      p.filter((o) => !messages.some((m) => m.playerId === o.playerId && m.clientAt === o.clientAt))
    );
  }, [messages]);

  const all = useMemo(() => [...messages, ...pending], [messages, pending]);

  // Keep pinned to the newest message unless the user scrolled up to read
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [all.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Keep the keyboard open while chatting: once the message box has focus,
  // tapping buttons elsewhere (Send, Roll Dice, Reply, the board…) must not
  // steal focus and collapse the keyboard. Other text fields (e.g. emoji
  // search) and the close button still work normally.
  useEffect(() => {
    const keepFocus = (e: MouseEvent) => {
      const box = inputRef.current;
      if (!box || document.activeElement !== box) return;
      const target = e.target as HTMLElement | null;
      if (!target || target === box) return;
      if (target.closest("input, textarea, select, [contenteditable], .chat-close")) return;
      e.preventDefault(); // stops the focus change; the click itself still happens
    };
    document.addEventListener("mousedown", keepFocus, true);
    return () => document.removeEventListener("mousedown", keepFocus, true);
  }, []);

  // Auto-grow the textarea up to ~5 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const mentionOptions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.id !== playerId && m.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, members, playerId]);

  const updateMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (match) {
      setMention({ start: caret - match[2].length - 1, query: match[2] });
      setMentionIdx(0);
    } else setMention(null);
  };

  const insertAtCursor = (insert: string, replaceFrom?: number) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const from = replaceFrom ?? caret;
    const next = input.slice(0, from) + insert + input.slice(caret);
    setInput(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = from + insert.length;
      if (!isTouch || document.activeElement === el) el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const pickMention = (m: Member) => {
    if (!mention) return;
    insertAtCursor(`@${m.name} `, mention.start);
    setMention(null);
    inputRef.current?.focus();
  };

  const startReply = useCallback((m: RoomMessage) => {
    setReplyingTo(m);
    setSelectedId(null);
    inputRef.current?.focus();
  }, []);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1200);
  }, []);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1500);
  };

  const copyMessage = useCallback(async (m: RoomMessage) => {
    setSelectedId(null);
    try {
      await navigator.clipboard.writeText(m.text || "");
      flashToast("Copied");
    } catch {
      flashToast("Couldn't copy");
    }
  }, []);

  const removeMessage = useCallback(
    async (m: RoomMessage) => {
      setSelectedId(null);
      if (!m.id || !window.confirm("Delete this message?")) return;
      try {
        await deleteMessage(activeRoomId, m.id);
      } catch {
        flashToast("Couldn't delete");
      }
    },
    [activeRoomId]
  );

  const attachFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Only photos can be shared.");
    setImageBusy(true);
    setError("");
    try {
      setImage(await compressImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
    } finally {
      setImageBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    const img = image;
    if ((!text && !img) || !activeRoomId) return;
    const replyTo: MessageReply | null = replyingTo?.id
      ? {
          id: replyingTo.id,
          text: (replyingTo.text || (replyingTo.image ? "📷 Photo" : "")).slice(0, 100),
          playerId: replyingTo.playerId,
          playerName: replyingTo.playerName,
        }
      : null;
    const mentions = members.filter((m) => text.toLowerCase().includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);
    const clientAt = Date.now();

    setInput("");
    setImage(null);
    setReplyingTo(null);
    setShowEmoji(false);
    setMention(null);
    setError("");
    stickToBottom.current = true;
    setPending((p) => [
      ...p,
      { id: `pending-${clientAt}`, playerId, playerName, text, image: img, clientAt, replyTo, isPending: true },
    ]);

    try {
      await sendMessage(activeRoomId, playerId, playerName, text, replyTo, mentions, clientAt, img);
    } catch (e) {
      setPending((p) => p.filter((m) => m.clientAt !== clientAt));
      setInput(text);
      setImage(img);
      setError(e instanceof Error ? e.message : "Message failed to send");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (mentionOptions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setMentionIdx((i) => (i + d + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionOptions[mentionIdx]);
        return;
      }
    }
    if (e.key === "Escape") {
      setMention(null);
      setShowEmoji(false);
      setReplyingTo(null);
      return;
    }
    // Desktop: Enter sends, Shift+Enter = new line. Phones: Enter = new line, tap send.
    if (e.key === "Enter" && !e.shiftKey && !isTouch) {
      e.preventDefault();
      send();
    }
  };

  const myName = playerName.toLowerCase();

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={onScroll} onClick={() => setShowEmoji(false)}>
        {all.length === 0 && <div className="chat-empty">No messages yet. Say hi 👋</div>}
        {all.map((m, i) => {
          const prev = all[i - 1];
          const grouped =
            !!prev && !m.replyTo && prev.playerId === m.playerId && msgTime(m) - msgTime(prev) < GROUP_WINDOW_MS;
          const mentionsMe =
            m.playerId !== playerId &&
            ((m as RoomMessage & { mentions?: string[] }).mentions?.includes(playerId) ||
              (!!myName && (m.text || "").toLowerCase().includes(`@${myName}`)) ||
              m.replyTo?.playerId === playerId);
          return (
            <MessageRow
              key={m.id}
              m={m}
              grouped={grouped}
              isMe={m.playerId === playerId}
              mentionsMe={!!mentionsMe}
              selected={selectedId === m.id}
              flash={flashId === m.id}
              color={colorOf(m.playerId)}
              members={members}
              myId={playerId}
              onSelect={setSelectedId}
              onReply={startReply}
              onJump={jumpTo}
              onCopy={copyMessage}
              onDelete={removeMessage}
              onOpenImage={setViewImage}
            />
          );
        })}
      </div>

      <div className="chat-composer">
        {mentionOptions.length > 0 && (
          <div className="chat-popup chat-mentions">
            {mentionOptions.map((m, i) => (
              <button
                key={m.id}
                className={i === mentionIdx ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(m)}
              >
                <span className="dot" style={{ background: m.color }} /> {m.name}
              </button>
            ))}
          </div>
        )}

        {showEmoji && (
          <div className="chat-popup chat-emojis" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
            <Suspense fallback={<div className="chat-empty">Loading emojis…</div>}>
              <EmojiPanel onPick={insertAtCursor} />
            </Suspense>
          </div>
        )}

        {replyingTo && (
          <div className="chat-replybar">
            <span>
              Replying to <b style={{ color: colorOf(replyingTo.playerId) }}>{replyingTo.playerName}</b>
            </span>
            <button aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>
              ✕
            </button>
          </div>
        )}

        {(image || imageBusy) && (
          <div className="chat-attachment">
            {image ? <img src={image} alt="Attachment preview" /> : <span>Preparing photo…</span>}
            {image && (
              <button aria-label="Remove photo" onClick={() => setImage(null)}>
                ✕
              </button>
            )}
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}

        <form
          className="chat-inputrow"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            className="chat-iconbtn chat-plus"
            aria-label="Add photo"
            title="Add photo"
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              attachFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="chat-iconbtn"
            aria-label="Emoji"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowEmoji((s) => !s)}
          >
            😊
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={1000}
            placeholder="Message… (@ to tag)"
            onChange={(e) => {
              setInput(e.target.value);
              updateMention(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
              if (file) {
                e.preventDefault();
                attachFile(file);
              }
            }}
            onBlur={() => setTimeout(() => setMention(null), 150)}
          />
          <button type="submit" className="chat-send" disabled={(!input.trim() && !image) || imageBusy} aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.06-.87.49-.87.99l.01 4.61c0 .71.73 1.2 1.39.92z" />
            </svg>
          </button>
          {onClose && (
            <button type="button" className="chat-iconbtn chat-close" aria-label="Close chat" onClick={onClose}>
              ✕
            </button>
          )}
        </form>
      </div>

      {toast && <div className="chat-toast">{toast}</div>}

      {viewImage && (
        <div className="image-viewer" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="Shared image, full size" />
        </div>
      )}
    </div>
  );
}
