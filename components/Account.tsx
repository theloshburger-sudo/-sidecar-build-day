"use client";

import { useEffect, useRef, useState } from "react";
import { clearImported, signInWithEmail, signInWithGoogle, signOut, useAccount } from "@/lib/account";

/** Top-bar sign-in / account menu. Renders nothing on guest-only deploys. */
export default function Account() {
  const { configured, ready, user, memory, imported } = useAccount();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!imported) return;
    setMsg("We moved the progress saved on this device into your account.");
    setOpen(true);
    clearImported();
  }, [imported]);

  if (!configured || !ready) return null;

  async function run(f: () => Promise<void>, done?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await f();
      if (done) setMsg(done);
    } catch (e) {
      setMsg((e as Error).message || "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account" ref={ref}>
      <button className="btn btn--small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {user ? `👤 ${user.email?.split("@")[0] ?? "Account"}` : "Sign in"}
      </button>
      {open && (
        <div className="account-pop card" role="dialog" aria-label={user ? "Your account" : "Sign in"}>
          {user ? (
            <>
              <strong>{user.email}</strong>
              <p className="muted small">Your weak spots, recaps and what Teacher learned about you are saved to your account.</p>
              <button className="btn btn--ghost" disabled={busy} onClick={() => run(signOut)}>
                Sign out
              </button>
              <button
                className="link-back small"
                disabled={busy}
                onClick={() => {
                  if (confirm("Delete everything Teacher remembers about you? This can't be undone.")) void run(async () => memory?.forget(), "Done. Teacher has forgotten everything.");
                }}
              >
                Forget everything
              </button>
            </>
          ) : (
            <>
              <strong>Keep your progress on every device</strong>
              <p className="muted small">Teacher remembers the ideas you've missed and brings them back for a quick review right before you'd forget them.</p>
              <button className="btn btn--primary" disabled={busy} onClick={() => run(signInWithGoogle)}>
                Continue with Google
              </button>
              <form
                className="account-email"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) void run(() => signInWithEmail(email.trim()), "Check your email for a sign-in link.");
                }}
              >
                <input type="email" required placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
                <button className="btn btn--ghost" disabled={busy || !email.trim()}>
                  Email me a link
                </button>
              </form>
            </>
          )}
          {msg && (
            <p className="small" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
