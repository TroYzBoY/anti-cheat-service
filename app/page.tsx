import { MAX_FOCUS_LOSSES, MAX_FULLSCREEN_EXITS, SDK_VERSION } from "@/lib/policy";

const ENDPOINTS = [
  ["GET", `/sdk/v${SDK_VERSION}.js`, "Browser SDK loaded by the exam page"],
  ["POST", "/api/v1/events", "Report an anti-cheat signal (Bearer token)"],
  ["GET", "/api/health", "Database connectivity check"],
] as const;

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px" }}>
      <p style={{ color: "#a78bfa", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
        CodeQuest
      </p>
      <h1 style={{ marginTop: 4 }}>Anti-cheat service</h1>
      <p style={{ color: "rgba(236,237,246,0.7)", lineHeight: 1.6 }}>
        Detects DevTools, tab switching, fullscreen exits, duplicate tabs,
        network-API tampering, overlays and multi-monitor setups during
        CodeQuest exams, and terminates the exam session in the shared
        database. Limits: {MAX_FOCUS_LOSSES} focus losses,{" "}
        {MAX_FULLSCREEN_EXITS} fullscreen exits.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 14 }}>
        <tbody>
          {ENDPOINTS.map(([method, path, description]) => (
            <tr key={path} style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <td style={{ padding: "10px 8px", fontFamily: "monospace", color: "#8ff5ff" }}>{method}</td>
              <td style={{ padding: "10px 8px", fontFamily: "monospace" }}>{path}</td>
              <td style={{ padding: "10px 8px", color: "rgba(236,237,246,0.7)" }}>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
