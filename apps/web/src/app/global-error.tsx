"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#09090b", color: "#f4f4f5", fontFamily: "system-ui" }}>
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: 32, textAlign: "center" }}>
          <h1>DevPulse could not load</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Your data is safe. Retry now, or check the deployment health if the problem continues.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: 0, cursor: "pointer" }}>Retry</button>
        </main>
      </body>
    </html>
  );
}
