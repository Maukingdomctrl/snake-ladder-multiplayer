import { Room } from "../firebase/rooms";

interface CountdownCardProps {
  countdown: number | null;
  hostName: string;
}

export default function CountdownCard({ countdown, hostName }: CountdownCardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, width: "100%", padding: 16 }}>
      <div
        style={{
          background: "var(--bg-primary)", padding: "40px 32px", borderRadius: 16,
          boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
          width: "100%", maxWidth: 420, display: "flex", flexDirection: "column",
          alignItems: "center", textAlign: "center",
        }}
      >
        <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontSize: 24 }}>Game Starting</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 32, fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
            <b style={{ color: "var(--text-primary)" }}>Status:</b> Starting
          </span>
          <span style={{ background: "var(--bg-tertiary)", padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)" }}>
            <b style={{ color: "var(--text-primary)" }}>Host:</b> {hostName}
          </span>
        </div>
        <div style={{
          width: 100, height: 100, borderRadius: "50%", background: "var(--bg-tertiary)", border: "4px solid var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 800, color: "var(--text-primary)",
          boxShadow: "var(--shadow-md)", marginBottom: 16,
        }}>
          {countdown ?? 5}
        </div>
        <p style={{ fontSize: 20, fontWeight: "bold", color: "var(--accent)", margin: 0, textTransform: "uppercase", letterSpacing: 2 }}>
          {(countdown ?? 5) >= 4 ? "Ready" : (countdown ?? 5) >= 2 ? "Set" : "Go!"}
        </p>
      </div>
    </div>
  );
}