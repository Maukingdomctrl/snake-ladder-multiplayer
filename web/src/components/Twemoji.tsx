import { memo, ReactNode, useState } from "react";

// Discord renders emoji with Twemoji, so we do too — same look on every device.
// SVGs are copied into public/twemoji at build time (scripts/copy-twemoji.mjs).
const BASE = "/twemoji";
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function fileName(grapheme: string) {
  // Twemoji drops the FE0F variation selector except inside ZWJ sequences
  const g = grapheme.includes("‍") ? grapheme : grapheme.replace(/️/g, "");
  return [...g].map((c) => c.codePointAt(0)!.toString(16)).join("-");
}

const Emoji = memo(function Emoji({ char }: { char: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{char}</>;
  return (
    <img
      className="emoji"
      src={`${BASE}/${fileName(char)}.svg`}
      alt={char}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
});

/** Replaces emoji in plain text with Twemoji images. */
export function twemojify(text: string, keyPrefix = ""): ReactNode[] {
  if (!EMOJI_RE.test(text) || !segmenter) return [text];
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (EMOJI_RE.test(segment)) {
      if (buf) out.push(buf);
      buf = "";
      out.push(<Emoji key={`${keyPrefix}e${i++}`} char={segment} />);
    } else buf += segment;
  }
  if (buf) out.push(buf);
  return out;
}

/** Maps emoji-picker-react's "unified" code (e.g. "2764-fe0f") to our Twemoji file. */
export function twemojiUrl(unified: string) {
  const name = unified.includes("200d") ? unified : unified.replace(/-fe0f/g, "");
  return `${BASE}/${name}.svg`;
}
