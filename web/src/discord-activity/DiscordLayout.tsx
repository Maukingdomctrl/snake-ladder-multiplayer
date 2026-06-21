import type { ReactNode } from "react";

interface DiscordLayoutProps {
  children: ReactNode;
}

export default function DiscordLayout({ children }: DiscordLayoutProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        maxWidth: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "row",
        background: "#0d0d0f",
        color: "#e8dcc8",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}