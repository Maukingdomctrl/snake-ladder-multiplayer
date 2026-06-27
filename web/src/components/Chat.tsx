import { useState, useRef, useEffect, useMemo, useCallback, memo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  sendMessage,
  Room,
  RoomMessage,
  MessageReply,
  toMillis,
} from "../firebase/rooms";

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

function getDateString(ms: number) {
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
}

const emojiOnlyRegex =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|\uFE0F\u20E3)*)+$/u;

const isEmojiOnly = (text: string) => {
  const t = (text || "").trim();
  return t ? emojiOnlyRegex.test(t.replace(/\s+/g, "")) : false;
};

// Hoisted once — building a new Intl.Segmenter per message/keystroke was
// unnecessary allocation churn now that messages render far more often
// per scroll session thanks to virtualization re-mounting rows.
const graphemeSeg =
  typeof (Intl as any)?.Segmenter !== "undefined"
    ? new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
    : null;

const getEmojiFontSize = (rawText: unknown) => {
  const cleaned = (typeof rawText === "string" ? rawText : "").trim();
  let count = 0;
  if (graphemeSeg) {
    count = [...graphemeSeg.segment(cleaned)].length;
  } else {
    count = [...cleaned].length;
  }
  // VISUAL FIX: sizes capped at 32px max. Bitmap-backed system emoji fonts
  // (notably Windows' Segoe UI Emoji) render poorly when asked for a
  // font-size well above their native resolution — visible pixelation or
  // cropped glyphs. Twemoji SVGs (below) make this less of a concern than
  // it used to be, since SVGs scale cleanly at any size, but the size
  // steps are kept conservative for visual consistency with the rest of
  // the chat's type scale.
  if (count <= 1) return 32;
  if (count <= 3) return 28;
  if (count <= 6) return 24;
  if (count <= 10) return 20;
  return 18;
};

// ─── ★★★ TWEMOJI RENDERING ★★★ ───
//
// FEATURE: native emoji rendering varies wildly across platforms — flat
// monochrome glyphs on some Linux setups, soft/pixelated bitmap upscaling
// on Windows (Segoe UI Emoji), inconsistent sizing across iOS/Android/
// desktop. Rendering emoji as Twemoji SVGs instead guarantees every
// player sees the exact same glyph at the exact same crispness, regardless
// of OS. Images fall back to the raw character if the CDN request fails,
// so a network hiccup degrades gracefully instead of showing a broken
// image icon.

const CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";

function emojiToFilename(grapheme: string): string {
  const points = [...grapheme].map((c) => c.codePointAt(0)!);
  const hasKeycap = points.includes(0x20e3);
  // Keycap sequences (e.g. 1️⃣) need the FE0F variation selector kept in
  // the filename; every other sequence strips it, matching Twemoji's
  // asset naming convention.
  const filtered = hasKeycap ? points : points.filter((p) => p !== 0xfe0f);
  return filtered.map((p) => p.toString(16)).join("-");
}

// Expanded to also catch flags (regional indicator pairs) and keycap
// sequences, which \p{Extended_Pictographic} alone does not cover.
const emojiTest = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{20E3}]/u;

const SafeEmojiImage = memo(({ grapheme, size }: { grapheme: string; size?: number | string }) => {
  const [hasError, setHasError] = useState(false);

  // BUG FIX: if the CDN is unreachable or a given codepoint sequence has
  // no matching Twemoji asset, fall back to rendering the raw character
  // instead of a broken-image icon — keeps the message readable either
  // way instead of visually breaking.
  if (hasError) return <span>{grapheme}</span>;

  const file = emojiToFilename(grapheme);

  return (
    <img
      src={`${CDN}/${file}.svg`}
      alt={grapheme}
      draggable={false}
      style={{
        display: "inline-block",
        width: size ? size : "1.25em",
        height: size ? size : "1.25em",
        margin: "0 0.05em 0 0.1em",
        verticalAlign: "-0.2em",
      }}
      onError={() => setHasError(true)}
    />
  );
});

interface TwemojiTextProps {
  text: string;
  size?: number | string;
}

const TwemojiText = memo(function TwemojiText({ text, size }: TwemojiTextProps) {
  if (!text) return null;

  const graphemes: string[] = graphemeSeg
    ? [...graphemeSeg.segment(text)].map((s: any) => s.segment)
    : [...text];

  const out: ReactNode[] = [];
  let buffer = "";

  const flush = (key: number) => {
    if (buffer) {
      out.push(<span key={`text-${key}`}>{buffer}</span>);
      buffer = "";
    }
  };

  graphemes.forEach((g, i) => {
    if (emojiTest.test(g)) {
      flush(i);
      out.push(<SafeEmojiImage key={`emoji-${i}`} grapheme={g} size={size} />);
    } else {
      buffer += g;
    }
  });

  flush(graphemes.length);
  return <>{out}</>;
});

// ─── ★★★ MEMOIZED MESSAGE ITEM ★★★ ───
//
// NOTE on animation: this no longer wraps its root in a framer-motion
// entrance animation. With list virtualization, a row's DOM node is
// recycled/repositioned by the virtualizer as the user scrolls — React
// treats a recycled row as a fresh mount, so a per-mount entrance
// animation would replay every single time a message scrolls back into
// view, not just the first time it appears. That's a real conflict
// between "animate on mount" and "the virtualizer remounts rows
// constantly by design," so the entrance animation is intentionally
// removed here. The hover-reveal reply button below still uses
// AnimatePresence safely, since it mounts/unmounts based on user
// interaction, not on virtualizer recycling.

interface MessageItemProps {
  m: RoomMessage & { isFirstInGroup: boolean; showDateSeparator: boolean; isDiceRoll?: boolean };
  isMe: boolean;
  playerId: string;
  playerColor: string;
  timeString: string;
  emojiOnly: boolean;
  emojiSize: number;
  messageTime: number;
  highlightedId: string | null;
  onReply: (m: RoomMessage) => void;
  onScrollToReply: (id: string) => void;
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
}: MessageItemProps) {
  const safeText = typeof m.text === "string" ? m.text : "";
  const safeName =
    typeof m.playerName === "string" && m.playerName
      ? m.playerName
      : m.playerId || "Player";

  const [isRolling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Defensive fallback: color-mix()/gradient strings need a real color
  // value. playerColor should always be set by the parent, but guard
  // against an empty string reaching the calculations below.
  const safeColor = playerColor && playerColor.trim() ? playerColor : "var(--text-primary)";
  const nameColor = `color-mix(in oklch, ${safeColor} 75%, var(--text-primary))`;

  // BUG FIX (tap-to-reply lost on mobile): the hover-reveal reply button
  // only appears on pointer hover, which doesn't exist as a concept on
  // touch devices — a phone user would have no way to trigger a reply at
  // all if that were the only path. Restoring tap/click-to-reply on the
  // row itself (guarded against firing when the tap was actually a text
  // selection/copy gesture) keeps mobile usable while the hover button
  // remains a faster shortcut on desktop.
  const handleRowClick = useCallback(() => {
    const sel = window.getSelection()?.toString();
    if (!sel) onReply(m);
  }, [m, onReply]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleRowClick}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: isMe ? "flex-end" : "flex-start",
        marginTop: m.isFirstInGroup ? 18 : 3,
        marginBottom: 1,
        width: "100%",
        cursor: "pointer",
        transition: "background-color 0.3s ease",
        backgroundColor: highlightedId === m.id ? "rgba(245, 158, 11, 0.1)" : "transparent",
        opacity: m.isPending ? 0.6 : 1,
      }}
    >
      {m.showDateSeparator && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "0 16px 16px",
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            width: "calc(100% - 32px)",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 10px" }}>{getDateString(messageTime)}</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      )}

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
            borderLeft: `2px solid ${safeColor}`,
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
            <span style={{ color: safeColor, fontWeight: 700, fontSize: 11 }}>
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

      <div
        className={`chat-row ${!m.isFirstInGroup ? "chat-grouped" : ""} ${isRolling ? "has-active-dice" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isMe ? "flex-end" : "flex-start",
          width: "100%",
          position: "relative",
        }}
      >
        {m.isFirstInGroup && (
          <div
            style={{
              display: "flex",
              flexDirection: isMe ? "row-reverse" : "row",
              alignItems: "center",
              marginBottom: 6,
              padding: "0 16px",
            }}
          >
            <div
              className="avatar"
              style={{
                background: `linear-gradient(165deg, color-mix(in oklch, ${safeColor} 88%, white) 0%, ${safeColor} 55%, color-mix(in oklch, ${safeColor} 80%, black) 100%)`,
                marginRight: isMe ? 0 : 12,
                marginLeft: isMe ? 12 : 0,
                width: 30,
                height: 30,
                fontSize: 13,
                border: "1px solid rgba(255,255,255,0.45)",
                boxShadow: [
                  "inset 2px 3px 4px rgba(255,255,255,0.55)",
                  "inset -2px -3px 5px rgba(0,0,0,0.35)",
                  "0 0 0 2px var(--bg-primary)",
                  `0 3px 10px -1px ${safeColor}`,
                ].join(", "),
              }}
            >
              {[...safeName][0]?.toUpperCase() ?? "?"}
            </div>
            <span
              className="chat-sender"
              style={{
                color: nameColor,
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: 0.1,
              }}
            >
              {safeName}
            </span>
            <span className="chat-timestamp">{timeString}</span>
          </div>
        )}

        <div
          className="chat-message"
          style={{
            background: emojiOnly ? "transparent" : isMe ? "var(--bg-base)" : "var(--bg-tertiary)",
            color: emojiOnly ? "inherit" : isMe ? "var(--text-secondary)" : "var(--text-primary)",
            fontSize: emojiSize,
            padding: emojiOnly ? "0 8px" : "10px 14px",
            borderRadius: emojiOnly ? 0 : 16,
            borderBottomRightRadius: isMe && !emojiOnly ? 4 : 16,
            borderBottomLeftRadius: !isMe && !emojiOnly ? 4 : 16,
            maxWidth: "78%",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            fontFamily: '"Inter", sans-serif',
            lineHeight: emojiOnly ? 1.15 : 1.375,
            margin: "0 16px",
            border: emojiOnly ? "none" : "1px solid rgba(255,255,255,0.06)",
            boxShadow: emojiOnly ? "none" : "0 2px 8px rgba(0,0,0,0.18)",
          }}
        >
          <TwemojiText text={safeText} size={emojiOnly ? emojiSize : undefined} />
        </div>

        <AnimatePresence>
          {isHovered && !m.isPending && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute",
                top: m.isFirstInGroup ? 28 : -8,
                right: isMe ? "auto" : 24,
                left: isMe ? 24 : "auto",
                zIndex: 10,
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(m);
                }}
                title="Reply"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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
  const [pickerMounted, setPickerMounted] = useState(false);
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
  const shadowRef = useRef<HTMLDivElement>(null);

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

  const processedMessages = useMemo(() => {
    const serverClientAts = new Set(messages.map((m) => m.clientAt));
    const activeOptimistic = optimisticMessages.filter(
      (om) => !serverClientAts.has(om.clientAt)
    );
    const all = [...activeOptimistic, ...messages];
    all.sort((a, b) => (toMillis(a.at) || a.clientAt) - (toMillis(b.at) || b.clientAt));

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

  // ─── FEATURE: List Virtualization ───
  // Only the messages currently visible (plus a small overscan buffer)
  // are ever mounted in the DOM, regardless of how many thousands of
  // messages exist in the room. This is what prevents long-lived chat
  // rooms from lagging/freezing the browser tab over time — previously
  // every single message stayed mounted forever, growing the DOM (and
  // the cost of every re-render) without bound.
  const rowVirtualizer = useVirtualizer({
    count: processedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 64, // rough average row height before measurement
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 12,
    getItemKey: (i) => processedMessages[i].id || `opt-${processedMessages[i].clientAt}`,
  });

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement, UIEvent>) => {
    const t = e.currentTarget;
    isNearBottom.current = t.scrollHeight - t.scrollTop - t.clientHeight < 150;
  }, []);

  // FEATURE: replaces the previous scrollToBottom()/messageRefs DOM
  // tracking with the virtualizer's own math-based scrollToIndex. This is
  // more reliable than the old approach (which depended on every message
  // having a live DOM ref to measure against) since it computes the exact
  // target offset from row-size math instead of walking actual elements.
  useEffect(() => {
    if (isNearBottom.current && processedMessages.length > 0) {
      rowVirtualizer.scrollToIndex(processedMessages.length - 1, {
        align: "end",
        behavior: hasMountedRef.current ? "smooth" : "auto",
      });
      hasMountedRef.current = true;
    }
  }, [processedMessages.length, rowVirtualizer]);

  // Shadow DOM measurement for the textarea's auto-resize. Mirrors the
  // textarea's exact font/padding/line-height/width so its scrollHeight
  // gives an accurate target height — without ever writing a layout-
  // affecting "auto" reset onto the real textarea, which is the element
  // an IME may be mid-composition on (writing "auto" then remeasuring
  // directly on that element was an earlier source of text visibly
  // duplicating/collapsing while typing on Android).
  useEffect(() => {
    const el = textareaRef.current;
    const shadow = shadowRef.current;
    if (!el || !shadow) return;
    const raf = requestAnimationFrame(() => {
      const measured = Math.min(shadow.scrollHeight, 120);
      const current = parseFloat(el.style.height || "0");
      if (Math.abs(current - measured) > 0.5) {
        el.style.height = `${measured}px`;
      }
    });
    return () => cancelAnimationFrame(raf);
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

  // Prevents the chat list's scroll-past-edge from yanking the mobile
  // drawer closed (or triggering browser pull-to-refresh) when the user
  // scrolls past the very top or bottom of the message list.
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
      if ((atTop && e.touches[0].clientY > lastY) || (atBottom && e.touches[0].clientY < lastY))
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
        at: null as any,
        clientAt,
        replyTo: replyPayload,
        isPending: true,
      },
    ]);

    try {
      await sendMessage(activeRoomId, playerId, playerName, text, replyPayload);
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
  }, [chatInput, activeRoomId, isSending, playerId, playerName, replyingTo, showToast]);

  // FEATURE: jump-to-reply now uses the virtualizer's index-based
  // scrollToIndex instead of walking a map of live DOM refs. Finding the
  // target is now an array search by id (cheap, and always accurate)
  // rather than depending on the target message's DOM node still
  // existing/being tracked, which is the more fragile assumption the old
  // messageRefs approach made.
  const scrollToMessage = useCallback(
    (id: string) => {
      const idx = processedMessages.findIndex((m) => m.id === id);
      if (idx === -1) {
        showToast("Original message not found.");
        return;
      }
      rowVirtualizer.scrollToIndex(idx, { align: "center", behavior: "smooth" });
      setHighlightedId(id);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
    },
    [processedMessages, rowVirtualizer, showToast]
  );

  const handleReply = useCallback((m: RoomMessage) => {
    setReplyingTo(m);
    textareaRef.current?.focus();
  }, []);

  const closeEmojiPicker = useCallback(() => {
    setShowEmojiPicker(false);
    // Refocus once the picker closes so the user can resume typing
    // immediately. By this point inputMode has reverted to "text" (it's
    // derived from showEmojiPicker), so this brings back the NORMAL
    // keyboard rather than re-triggering any emoji mode.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const toggleEmojiPicker = useCallback(() => {
    setPickerMounted(true);
    setShowEmojiPicker((p) => {
      const next = !p;
      if (next) {
        // inputMode is set to "none" in the same render this state
        // change triggers (see the textarea's inputMode prop above), but
        // an explicit blur right after still matters: on some browsers,
        // changing inputMode on an element that's ALREADY focused with a
        // keyboard up doesn't by itself force that keyboard to
        // re-evaluate and close. Blurring (now backed by inputMode being
        // "none", so a refocus can't bring the keyboard back) reliably
        // closes whatever the OS keyboard was showing, including any
        // emoji-mode panel it had switched into.
        requestAnimationFrame(() => textareaRef.current?.blur());
      }
      return next;
    });
  }, []);

  // Deferred scroll-to-bottom on input focus, so it happens after the
  // mobile keyboard/drawer resize settles instead of fighting it mid-
  // animation (previously the source of a visible "sway" on mobile).
  const handleInputFocus = useCallback(() => {
    isNearBottom.current = true;
    const delay = inDrawer ? 220 : 0;
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (processedMessages.length > 0) {
          rowVirtualizer.scrollToIndex(processedMessages.length - 1, { align: "end" });
        }
      });
    }, delay);
  }, [inDrawer, processedMessages.length, rowVirtualizer]);

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
          overflowAnchor: "auto",
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

        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vItem) => {
            const m = processedMessages[vItem.index];
            const textStr = typeof m.text === "string" ? m.text : "";
            const isEmoji = isEmojiOnly(textStr);

            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vItem.start}px)`,
                }}
              >
                <MessageItem
                  m={m}
                  isMe={m.playerId === playerId}
                  playerId={playerId}
                  playerColor={roomData?.playerColors?.[m.playerId] || "var(--text-primary)"}
                  timeString={formatTime(m.at)}
                  emojiOnly={isEmoji}
                  emojiSize={isEmoji ? getEmojiFontSize(textStr) : 14}
                  messageTime={toMillis(m.at) || m.clientAt}
                  highlightedId={highlightedId}
                  onReply={handleReply}
                  onScrollToReply={scrollToMessage}
                />
              </div>
            );
          })}
        </div>

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

      <AnimatePresence initial={false}>
        {replyingTo && (
          <motion.div
            key="reply-preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.7 }}
            style={{ overflow: "hidden" }}
          >
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
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }}>
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ position: "relative", flexShrink: 0 }}>
        {/*
          Emoji picker overlay stays mounted permanently once opened once
          (pickerMounted) and is animated between off-screen/on-screen
          positions rather than unmounted on close — unmounting would
          re-trigger emoji-picker-react's internal data fetch on every
          reopen, which previously showed as a white blank flash.
        */}
        {pickerMounted && (
          <motion.div
            ref={pickerRef}
            initial={false}
            animate={{
              y: showEmojiPicker ? 0 : inDrawer ? "100%" : 10,
              opacity: showEmojiPicker ? 1 : 0,
              scale: showEmojiPicker ? 1 : inDrawer ? 1 : 0.95,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.8 }}
            style={{
              position: inDrawer ? "fixed" : "absolute",
              bottom: inDrawer ? 0 : "100%",
              right: inDrawer ? 0 : 0,
              left: inDrawer ? 0 : "auto",
              marginBottom: inDrawer ? 0 : 8,
              zIndex: 2147483000,
              maxWidth: inDrawer ? "100%" : 340,
              height: inDrawer ? "min(45vh, 320px)" : 350,
              background: "var(--bg-secondary)",
              borderRadius: inDrawer ? "12px 12px 0 0" : 8,
              boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
              overflow: "hidden",
              visibility: showEmojiPicker ? "visible" : "hidden",
              pointerEvents: showEmojiPicker ? "auto" : "none",
              willChange: "transform",
              transformOrigin: "bottom right",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Emoji</span>
              <button
                type="button"
                onClick={closeEmojiPicker}
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(emojiData: EmojiClickData) => {
                const emoji = emojiData?.emoji || "";
                const el = textareaRef.current;
                if (!el) {
                  setChatInput((p) => p + emoji);
                  return;
                }
                const start = el.selectionStart ?? chatInput.length;
                const end = el.selectionEnd ?? chatInput.length;
                setChatInput((p) => p.slice(0, start) + emoji + p.slice(end));
                requestAnimationFrame(() => {
                  const pos = start + emoji.length;
                  el.focus();
                  el.setSelectionRange(pos, pos);
                });
              }}
              style={{
                width: "100%",
                height: inDrawer ? "calc(min(45vh, 320px) - 37px)" : "calc(350px - 37px)",
                border: "none",
              }}
            />
          </motion.div>
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

          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={chatInput}
              enterKeyHint="send"
              autoCapitalize="sentences"
              // BUG FIX (emoji panel cut off / showing OS keyboard's own
              // emoji mode instead of our picker, on mobile):
              // blur() alone wasn't reliably dismissing the OS keyboard
              // once it had already switched into its own emoji-input
              // mode — some keyboards (confirmed: Samsung Keyboard) keep
              // that surface open regardless, and it was rendering INSIDE
              // the same fixed-height container reserved for our picker,
              // pushing emoji-picker-react's actual grid off-screen below
              // the fold. `inputMode="none"` is the reliable cross-
              // browser signal to never show ANY virtual keyboard for
              // this field — applied while our picker is open, it
              // prevents the OS keyboard (in any mode) from claiming that
              // screen space in the first place, instead of trying to
              // dismiss one that's already up.
              inputMode={showEmojiPicker ? "none" : "text"}
              onChange={(e) => setChatInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
                if (isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage();
                  return;
                }
                // Prevents backspace-at-empty-field from bubbling up to
                // any browser/webview back-navigation gesture handling.
                if (e.key === "Backspace" && chatInput.length === 0) {
                  e.stopPropagation();
                }
              }}
              onFocus={handleInputFocus}
              rows={1}
              placeholder="Message #game-room"
              autoComplete="off"
              style={{
                width: "100%",
                padding: "6px 0",
                lineHeight: "20px",
                minHeight: "32px",
                maxHeight: "120px",
                overflowY: "auto",
                background: "transparent",
                resize: "none",
                border: "none",
                outline: "none",
                color: "inherit",
                fontFamily: '"Inter", sans-serif',
                fontSize: 16,
                display: "block",
              }}
            />
            {/*
              Hidden shadow element mirroring the textarea's exact font/
              padding/line-height/width, used to measure target height
              without ever writing a layout-affecting reset onto the real
              textarea (see the resize effect above). Always renders a
              trailing zero-width-space + newline so the height expands
              immediately when Enter is pressed, instead of lagging one
              keystroke behind.
            */}
            <div
              ref={shadowRef}
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                padding: "6px 0",
                lineHeight: "20px",
                border: "none",
                fontFamily: '"Inter", sans-serif',
                fontSize: 16,
                visibility: "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                pointerEvents: "none",
              }}
            >
              {(chatInput.length > 0 ? chatInput : "\u200B") + "\n"}
            </div>
          </div>

          <button
            type="button"
            ref={buttonRef}
            onClick={toggleEmojiPicker}
            onMouseDown={(e) => e.preventDefault()}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              color: showEmojiPicker ? "var(--accent)" : "var(--text-secondary)",
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
            onMouseDown={(e) => e.preventDefault()}
            style={{
              minHeight: 28,
              minWidth: 28,
              padding: 0,
              background: "transparent",
              border: "none",
              color: chatInput.trim() && !isSending ? "var(--accent)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: chatInput.trim() && !isSending ? "pointer" : "default",
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
        @keyframes toast-in { 
            from { opacity: 0; transform: translate(-50%, 10px); } 
            to { opacity: 1; transform: translate(-50%, 0); } 
        }
      `}</style>
    </div>
  );
}