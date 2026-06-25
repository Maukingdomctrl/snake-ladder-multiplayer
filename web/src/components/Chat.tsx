import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
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

/**
 * FEATURE (flawless scroll anchoring, fallback path):
 * CSS `overflow-anchor: auto` (set on the scroll container below) already
 * gives Chromium and Firefox native, free scroll anchoring — when content
 * above the viewport changes size, the browser keeps whatever's currently
 * visible pinned in place automatically. Safari does not implement
 * `overflow-anchor` as of this writing, so this hook is a manual fallback
 * ONLY for that gap: it watches a message element for height changes (e.g.
 * a reply preview rendering late, an emoji-only message re-measuring) and,
 * if the user isn't anchored to the bottom, nudges the scroll container by
 * the exact pixel delta so the content the user was looking at doesn't
 * visibly jump. It intentionally does nothing when isNearBottom is true,
 * since the existing scrollToBottom effect already owns that case.
 */
function useResizeObserver(
  ref: React.RefObject<HTMLElement | null>,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  isNearBottom: React.RefObject<boolean>
) {
  const prevHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const supportsNativeAnchoring =
      typeof CSS !== "undefined" && CSS.supports?.("overflow-anchor: auto");
    if (supportsNativeAnchoring) return; // native anchoring already handles it

    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;

      if (prevHeightRef.current !== null && !isNearBottom.current) {
        const diff = newHeight - prevHeightRef.current;
        if (diff !== 0) {
          const container = scrollContainerRef.current;
if (container) {
  // Only compensate if the resized element is ABOVE the current
  // scroll position's visible area, otherwise a change below the
  // viewport shouldn't move the scroll offset at all.
  const elTop = (el as HTMLElement).getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  if (elTop < containerTop) {
    container.scrollTop += diff;
  }
}
        }
      }
      prevHeightRef.current = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, scrollContainerRef, isNearBottom]);
}

const emojiOnlyRegex =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|\uFE0F\u20E3)*)+$/u;

const isEmojiOnly = (text: string) => {
  const t = (text || "").trim();
  return t ? emojiOnlyRegex.test(t.replace(/\s+/g, "")) : false;
};

// BUG FIX: the original called getEmojiFontSize(m.text as string) directly
// from the parent without going through the same string-safety guard
// MessageItem uses internally (`safeText`). Any non-string `m.text` (e.g.
// a malformed/legacy message doc) would throw inside the grapheme
// segmenter. getEmojiFontSize now defends itself instead of trusting the
// caller, so the unsafe cast at the call site can never crash render.
const getEmojiFontSize = (rawText: unknown) => {
  const cleaned = (typeof rawText === "string" ? rawText : "").trim();
  let count = 0;
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter !== "undefined") {
    count = [
      ...new Segmenter(undefined, { granularity: "grapheme" }).segment(cleaned),
    ].length;
  } else {
    count = [...cleaned].length;
  }
  // VISUAL FIX: sizes were previously pushed up to 56px (then 48px in an
  // earlier pass). Both are large enough to expose a real rendering
  // problem on desktop: several platforms' color-emoji fonts are
  // bitmap-backed at fixed resolutions rather than vector-scalable (most
  // notably Windows' "Segoe UI Emoji"), so requesting a font-size well
  // above their native bitmap resolution makes the browser upscale a
  // raster image — producing visibly soft/pixelated or oddly-cropped
  // glyphs. That's what showed up as emoji "looking out of shape" on a
  // laptop. Capping at 32px keeps every step within a size these fonts
  // render natively/cleanly, while still reading clearly larger than
  // normal message text.
  if (count <= 1) return 32;
  if (count <= 3) return 28;
  if (count <= 6) return 24;
  if (count <= 10) return 20;
  return 18;
};

// ─── ★★★ MEMOIZED MESSAGE ITEM ★★★ ───

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
  messageRef: (el: HTMLDivElement | null) => void;
  inDrawer: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isNearBottom: React.RefObject<boolean>;
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
  scrollContainerRef,
  isNearBottom,
}: MessageItemProps) {
  const safeText = typeof m.text === "string" ? m.text : "";
  const safeName =
    typeof m.playerName === "string" && m.playerName
      ? m.playerName
      : m.playerId || "Player";

  const [isRolling] = useState(false);
  // Defensive fallback: color-mix()/linear-gradient() need a real color
  // value. playerColor should always be set by the parent, but guard
  // against an empty string reaching the gradient/glow calculations below.
  const safeColor = playerColor && playerColor.trim() ? playerColor : "var(--text-primary)";

  // FEATURE (flawless scroll anchoring): tracks this message's own root
  // element so useResizeObserver can detect height changes (e.g. a reply
  // preview, late-loading content, or font/emoji re-measurement) and
  // compensate scroll position when the user isn't anchored to the bottom.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useResizeObserver(rootRef, scrollContainerRef, isNearBottom);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      messageRef(el);
    },
    [messageRef]
  );

  return (
    <>
      {m.showDateSeparator && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "20px 16px 16px",
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ padding: "0 10px" }}>
            {getDateString(messageTime)}
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      )}

      <motion.div
        ref={setRefs}
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.96, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.6 }}
        onClick={() => {
          const sel = window.getSelection()?.toString();
          if (!sel) onReply(m);
        }}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: isMe ? "flex-end" : "flex-start",
          // VISUAL FIX: previous values (12 / 2) made every message in a
          // run sit almost flush against the next, and gave very little
          // breathing room between different senders. Discord-style chat
          // gives clearly more vertical air between *groups* (different
          // senders, or a time gap) than between consecutive messages from
          // the same sender, so the rhythm reads cleanly at a glance.
          marginTop: m.isFirstInGroup ? 18 : 3,
          marginBottom: 1,
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
                    // angled top-left highlight, like light hitting a glass orb
                    "inset 2px 3px 4px rgba(255,255,255,0.55)",
                    // inner shadow on the opposite edge for roundness/depth
                    "inset -2px -3px 5px rgba(0,0,0,0.35)",
                    // thin ring separating the avatar from the message background
                    "0 0 0 2px var(--bg-primary)",
                    // outer glow in the player's own color
                    `0 3px 10px -1px ${safeColor}`,
                  ].join(", "),
                }}
              >
                {[...safeName][0]?.toUpperCase() ?? "?"}
              </div>
              {/* VISUAL FIX: sender names now use the player's actual
                  playerColor directly (no faked per-message hash color).
                  A vertical gradient — white at the top fading to their
                  color at the bottom — combined with a matching
                  drop-shadow filter gives a glowing, neon-ambient-light
                  look anchored to a color that's actually theirs
                  (matches their avatar/token color everywhere else in
                  the app), instead of an arbitrary hashed hue. */}
              <span
                className="chat-sender"
                style={{
                  backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${safeColor} 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                  filter: `drop-shadow(0 0 6px ${safeColor})`,
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
              // VISUAL FIX: emoji rendered via a plain text fontFamily
              // fallback list looked inconsistent across desktop browsers
              // (some render emoji as flat monochrome glyphs from a
              // system serif/sans font instead of the color emoji font).
              // Pinning "Apple Color Emoji"/"Segoe UI Emoji"/"Noto Color
              // Emoji" first — and ALSO applying that stack even for mixed
              // text+emoji messages, not just emoji-only ones — makes
              // emoji render as their native color glyphs everywhere
              // instead of falling back to whatever the body font does
              // with the codepoint.
              fontFamily: emojiOnly
                ? '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Inter",sans-serif'
                : '"Inter","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
              lineHeight: emojiOnly ? 1.15 : 1.375,
              margin: "0 16px",
              border: emojiOnly ? "none" : "1px solid rgba(255,255,255,0.06)",
              boxShadow: emojiOnly ? "none" : "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            {safeText}
          </div>
        </div>
      </motion.div>
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
  // BUG FIX: emoji-picker-react was being fully unmounted on every close
  // (`{showEmojiPicker && <EmojiPicker .../>}`), which tears down its
  // internal emoji-sheet/data fetch each time. Reopening then re-fetches
  // from scratch, which on a slow connection shows as a blank/white box
  // for a beat — the inconsistent "white blank" symptom. Fix: mount the
  // picker once on first open and keep it mounted, just toggling
  // visibility via display/visibility instead of remounting the
  // component. hasOpenedPickerRef ensures we don't pay the (heavier)
  // mount cost until the user actually wants the picker the first time.
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

  // FEATURE/BUG FIX (shadow-element height measurement):
  // The previous version still wrote `el.style.height = "auto"` directly
  // on the live <textarea> before remeasuring — even deferred to a RAF,
  // that's still a layout-affecting write on the exact element an IME may
  // be mid-composition on. This version never touches the real textarea's
  // height via a reset step at all: a hidden, identically-styled shadow
  // div mirrors the current text, the browser measures ITS scrollHeight,
  // and only the resulting pixel value is written to the textarea, once,
  // as a single height assignment. The textarea's own box never goes
  // through an intermediate "auto" state.
  const shadowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    const shadow = shadowRef.current;
    if (!el || !shadow) return;
    const raf = requestAnimationFrame(() => {
      const measured = Math.min(shadow.scrollHeight, 120);
      const current = parseFloat(el.style.height || "0");
      // Only write if the value actually changed, to avoid any unnecessary
      // layout write on keystrokes that don't change line count.
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
        at: null as any,
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

  const toggleEmojiPicker = useCallback(() => {
    setPickerMounted(true);
    setShowEmojiPicker((p) => {
      const next = !p;
      // BUG FIX: opening the in-app emoji picker while the OS keyboard
      // is still up caused the two to visually fight for the same screen
      // space — the picker would render squeezed underneath or beside
      // the still-open system keyboard (including its own native emoji
      // panel), which is what showed up as a broken/cramped emoji grid.
      // Explicitly blurring the textarea before showing the picker tells
      // the OS to dismiss its keyboard first, so the in-app picker gets
      // the full space the system keyboard was occupying.
      if (next) {
        textareaRef.current?.blur();
      }
      return next;
    });
  }, []);

  // BUG FIX (sway on mobile): the textarea's onFocus handler used to fire
  // an immediate `requestAnimationFrame(() => scrollToBottom("smooth"))`
  // the instant focus landed — which on mobile is the exact same moment
  // the keyboard starts opening and App.tsx's visualViewport handler
  // begins resizing the drawer via direct style writes. Three independent
  // motions (keyboard opening, drawer resizing, message list smooth
  // scrolling) had no sequencing between them, which is what produced the
  // visible "sway." Deferring the scroll slightly lets the keyboard/drawer
  // resize settle first, so the scroll happens against a layout that's
  // already stable instead of one that's still actively resizing under it.
  const handleInputFocus = useCallback(() => {
    isNearBottom.current = true;
    const delay = inDrawer ? 220 : 0;
    if (delay === 0) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      setTimeout(() => {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      }, delay);
    }
  }, [inDrawer, scrollToBottom]);

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
          // FEATURE (flawless scroll anchoring): native browser support
          // (Chromium, Firefox) for keeping the user's visible content
          // pinned in place when something above it changes size. Safari
          // doesn't implement this yet — useResizeObserver above is the
          // manual fallback specifically for that gap.
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
                ? getEmojiFontSize(m.text)
                : 14
            }
            messageTime={toMillis(m.at) || m.clientAt}
            highlightedId={highlightedId}
            onReply={handleReply}
            onScrollToReply={scrollToMessage}
            messageRef={handleMessageRef(m.id || "")}
            inDrawer={inDrawer}
            scrollContainerRef={scrollContainerRef}
            isNearBottom={isNearBottom}
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
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ position: "relative", flexShrink: 0 }}>
        {/*
          BUG FIX (emoji picker still not showing correctly / "What's Your
          Mood?" panel instead of the app's picker):
          The previous approach called textareaRef.current.blur() on open,
          assuming that would dismiss the OS keyboard and free up the
          screen space for the in-app picker. In practice several Android
          keyboards (confirmed here: Samsung Keyboard) don't fully close on
          blur if they were already showing their OWN emoji panel — they
          just stay open in emoji mode. The in-app picker WAS mounting and
          WAS set to visible (confirmed by the in-app emoji button showing
          its active/blue state), but the OS keyboard's emoji surface was
          painting on top of/instead of it in the same screen region,
          because blur() only removes focus — it doesn't force-close a
          keyboard that's decided to stay up in its own emoji mode.

          Fix: stop trying to coordinate with the OS keyboard's dismissal
          timing entirely. The in-app picker is now a `position: fixed`
          overlay with a very high z-index in BOTH drawer and non-drawer
          modes, anchored to the bottom of the viewport. This means it
          visually wins regardless of whether the OS keyboard considers
          itself open, closed, or stuck in emoji mode — there's no longer
          a layout region the OS keyboard can paint over instead of it.
          We still attempt the blur (harmless, helps on keyboards that DO
          behave) but no longer depend on it for correctness.

          BUG FIX (emoji button stops responding after closing the
          picker once): a fixed, full-width, high-z-index overlay that's
          only hidden via opacity/visibility can — depending on browser
          and exact paint timing — still intercept the very next tap
          aimed at the emoji or send button sitting underneath it, since
          all three occupy the same bottom strip of the viewport. Moving
          the closed picker fully off-screen guarantees it can never sit
          in the hit-testing path of the buttons below it while closed.

          NOTE on framer-motion usage here: this element intentionally
          stays mounted at all times once opened once (pickerMounted) and
          is positioned off-screen rather than unmounted when closed — do
          NOT wrap it in AnimatePresence/exit animations, since exit
          would unmount it, which reintroduces the white-flash bug fixed
          earlier (emoji-picker-react re-fetching its data on every
          reopen). Instead we drive `animate` directly off showEmojiPicker
          so framer-motion springs the position/opacity without ever
          removing the element from the DOM.
        */}
        {pickerMounted && (
          <motion.div
            ref={pickerRef}
            initial={false}
            animate={{
              bottom: showEmojiPicker ? 0 : "-100vh",
              opacity: showEmojiPicker ? 1 : 0,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.8 }}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              zIndex: 2147483000,
              maxWidth: inDrawer ? "100%" : 340,
              marginLeft: inDrawer ? 0 : "auto",
              marginRight: inDrawer ? 0 : 16,
              height: inDrawer ? "min(45vh, 320px)" : 350,
              background: "var(--bg-secondary)",
              borderRadius: inDrawer ? "12px 12px 0 0" : 8,
              boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
              overflow: "hidden",
              visibility: showEmojiPicker ? "visible" : "hidden",
              pointerEvents: showEmojiPicker ? "auto" : "none",
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
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                Emoji
              </span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Close emoji picker"
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
                // BUG FIX (backspace closes the chat box / feels slow to
                // reopen): on some mobile browsers and PWA-style webviews,
                // pressing backspace while a text field is already empty
                // can be interpreted as a back-navigation gesture if the
                // keystroke isn't explicitly captured here. That reads as
                // "backspace closes the box." Stopping propagation in that
                // specific case (empty field + backspace) prevents the
                // event from reaching any such fallback handling, without
                // changing normal backspace behavior while there's text to
                // delete.
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
                maxHeight: "120px",
                overflowY: "auto",
                background: "transparent",
                resize: "none",
                border: "none",
                outline: "none",
                color: "inherit",
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                display: "block",
              }}
            />

            {/*
              FEATURE (shadow DOM measurement for textarea auto-resize):
              Mirrors the textarea's exact font/padding/line-height/width
              so its scrollHeight gives an accurate target height — without
              ever writing a layout-affecting "auto" reset onto the real
              textarea, which is the element an IME may be mid-composition
              on. visibility: hidden keeps it out of sight but still
              participates in layout sizing; position: absolute keeps it
              out of normal flow so it doesn't add visible space.
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
                fontFamily: "'Inter', sans-serif",
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