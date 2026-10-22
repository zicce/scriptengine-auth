"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function TurnstileBox({ onVerify }) {
  const host = useRef(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  useEffect(() => {
    if (!SITE_KEY || !host.current) return undefined;
    let widgetId = null;
    let cancelled = false;

    function render() {
      if (cancelled || !host.current || !window.turnstile) return;
      widgetId = window.turnstile.render(host.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        size: "normal",
        callback(token) {
          onVerifyRef.current(token || "");
        },
        "expired-callback"() {
          onVerifyRef.current("");
        },
        "error-callback"() {
          onVerifyRef.current("");
        },
      });
    }

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector("script[data-turnstile='1']");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetId != null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!SITE_KEY) {
    return <div className="turnstileMissing">Cloudflare verification is not configured.</div>;
  }

  return <div className="turnstileSlot" ref={host} />;
}
