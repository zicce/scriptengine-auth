"use client";

export function CloudflareLogo() {
  return (
    <svg className="cf-turnstile-logo" viewBox="0 0 65 28" aria-hidden="true">
      <path
        fill="#F6821F"
        d="M42.7 18.3c-.2-.1-.4-.1-.6 0l-1.5.7c-.3.1-.5.5-.4.8.1.3.4.5.7.5h.2l2.1-.4c.3-.1.5-.4.4-.7-.1-.4-.4-.7-.9-.9Zm6.1-2.2c-.5-.2-1-.2-1.5 0l-9.5 3.7c-.5.2-.8.7-.7 1.2.1.5.6.9 1.1.9h.2l11.3-2.1c.5-.1.8-.6.7-1.1-.1-.6-.6-1.1-1.6-2.6Zm-21.4 5.3c.1 1.2 1.1 2.1 2.3 2.1h15.2c.2 0 .3-.1.3-.3v-.1c-.2-.8-.9-1.3-1.7-1.3H29.9c-.4 0-.7-.3-.7-.7 0-.3.2-.6.5-.7l14.4-5.4c1.1-.4 1.7-1.6 1.4-2.7-.3-1.2-1.5-1.9-2.7-1.6l-2.1.6c.6-2.2-.5-4.5-2.6-5.4-2.1-.9-4.5-.1-5.6 1.8l-.4.8-1.4-.4c-2.5-.7-5.1.7-5.9 3.1-.1.4-.2.8-.2 1.2-1.9.4-3.3 2.1-3.2 4.1.1.9.5 1.7 1.1 2.3Z"
      />
      <path
        fill="#FBAD41"
        d="M50.2 21.3H29.7c-.3 0-.5-.2-.5-.5 0-.2.1-.4.3-.5l14.8-5.5c1.6-.6 2.4-2.4 1.8-4-.5-1.3-1.8-2.1-3.2-2.1-.4 0-.8.1-1.2.2l-1.1.3.3-1.1c.6-2.3-.7-4.7-3-5.5-1.6-.6-3.4-.2-4.6 1.1-.5.6-.9 1.3-1 2.1l-.2.9-.8-.3c-2.1-.7-4.4.4-5.2 2.5-.2.6-.3 1.2-.2 1.8-2.3.1-4.1 2-4.1 4.3 0 .2 0 .4.1.6-.1 0-.1 0-.2 0-1.8 0-3.2 1.5-3.2 3.3 0 .2 0 .3.1.5h34.3c.3 0 .5-.2.5-.5v-.1c-.2-.8-.9-1.4-1.7-1.4Z"
        opacity=".85"
      />
    </svg>
  );
}

function TurnstileSpinner() {
  return (
    <div className="cf-turnstile-spinner" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} style={{ "--i": index }} />
      ))}
    </div>
  );
}

function TurnstileCheck() {
  return (
    <span className="cf-turnstile-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          fill="#22c55e"
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 7.3-5 5a1 1 0 0 1-1.4 0l-2.2-2.2a1 1 0 1 1 1.4-1.4l1.5 1.5 4.3-4.3a1 1 0 1 1 1.4 1.4Z"
        />
      </svg>
    </span>
  );
}

function TurnstileCheckbox() {
  return <span className="cf-turnstile-box" aria-hidden="true" />;
}

export function CloudflareTurnstileWidget({
  status = "idle",
  onStart,
  disabled = false,
  className = "",
}) {
  const isInteractive = status === "idle" && typeof onStart === "function" && !disabled;
  const label = status === "success" ? "Success!" : status === "verifying" ? "Verifying..." : "Verify you are human";

  const content = (
    <>
      <div className="cf-turnstile-left">
        {status === "success" ? <TurnstileCheck /> : null}
        {status === "verifying" ? <TurnstileSpinner /> : null}
        {status === "idle" ? <TurnstileCheckbox /> : null}
        <span className="cf-turnstile-status">{label}</span>
      </div>
      <div className="cf-turnstile-brand">
        <CloudflareLogo />
        <strong>CLOUDFLARE</strong>
        <div className="cf-turnstile-links">
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            Privacy
          </a>
          <span aria-hidden="true">•</span>
          <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            Help
          </a>
        </div>
      </div>
    </>
  );

  if (isInteractive) {
    return (
      <div
        className={`cf-turnstile-widget${className ? ` ${className}` : ""}`}
        role="button"
        tabIndex={0}
        onClick={onStart}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onStart();
          }
        }}
        aria-label="Verify you are human"
      >
        {content}
      </div>
    );
  }

  return (
    <div className={`cf-turnstile-widget${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      {content}
    </div>
  );
}
