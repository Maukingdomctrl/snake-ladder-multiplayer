import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { twemojiUrl } from "./Twemoji";

export default function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker
      theme={Theme.LIGHT}
      emojiStyle={EmojiStyle.TWITTER}
      getEmojiUrl={twemojiUrl}
      lazyLoadEmojis
      autoFocusSearch={false}
      previewConfig={{ showPreview: false }}
      skinTonesDisabled
      width="100%"
      height={340}
      onEmojiClick={(e) => onPick(e.emoji)}
    />
  );
}
