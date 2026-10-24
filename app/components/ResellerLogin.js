"use client";

import { useEffect, useRef, useState } from "react";
import { runAccessChecks } from "../../lib/site-access";
import { CloudflareTurnstileWidget } from "./CloudflareTurnstileWidget";

const VERIFY_MS = 1800;

export default function ResellerLogin({ demo = false }) {
  const [status, setStatus] = useState("idle");
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function start() {
    if (status !== "idle") return;
    setFailed(false);
    setStatus("verifying");
    timer.current = window.setTimeout(() => {
      if (!demo && !runAccessChecks()) {
        setStatus("idle");
        setFailed(true);
        return;
      }
      setStatus("success");
    }, VERIFY_MS);
  }

  const ready = status === "success";

  return (
    <>
      <CloudflareTurnstileWidget className="loginTurnstile" status={status} onStart={start} />
      {failed ? <div className="loginAlert">Verification failed. Please try again.</div> : null}
      <a
        className={`gateButton${ready ? "" : " gateButtonDisabled"}`}
        href={ready ? (demo ? "/demo/applications" : "/api/auth/discord") : undefined}
        aria-disabled={ready ? undefined : true}
        onClick={(event) => {
          if (!ready) event.preventDefault();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.27 5.33A17.4 17.4 0 0 0 15.11 4l-.22.4a16.1 16.1 0 0 1 4.06 1.54 16.4 16.4 0 0 0-12.9 0A16.4 16.4 0 0 1 10.1 4.4L9.89 4a17.4 17.4 0 0 0-4.16 1.33C3.1 8.9 2.4 12.37 2.6 15.8a17.6 17.6 0 0 0 5.32 2.69l.68-1.12a11.5 11.5 0 0 1-1.7-.82l.42-.33c3.28 1.52 6.84 1.52 10.08 0l.42.33c-.54.33-1.11.6-1.7.82l.68 1.12a17.6 17.6 0 0 0 5.32-2.69c.3-4.05-.51-7.49-2.15-10.47ZM9.2 14.3c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.8 2.04-1.8 2.04Zm5.6 0c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.79 2.04-1.8 2.04Z"
          />
        </svg>
        Sign in with Discord
      </a>
    </>
  );
}
