import { useState } from "react";
import { sendMagicLink } from "../lib/auth.tsx";

export function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setError(null);
    const err = await sendMagicLink(email.trim());
    if (err) { setError(err); setState("idle"); } else setState("sent");
  }

  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: "12vh" }}>
      <h1>RuneGate Companion</h1>
      <p className="muted" style={{ marginTop: "0.5rem" }}>Your characters, the rules and your gear – at the table.</p>
      {state === "sent" ? (
        <div className="panel section">
          <h3>Check your email</h3>
          <p style={{ marginTop: "0.5rem" }}>We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</p>
          <button className="btn quiet small" onClick={() => setState("idle")}>Use another email</button>
        </div>
      ) : (
        <form className="panel section grid" onSubmit={submit}>
          <label className="field">Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send sign-in link"}</button>
          {error && <p className="small" style={{ color: "var(--bad)" }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
