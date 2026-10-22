"use client";

import { useEffect, useState } from "react";

const COPY = {
  reseller: {
    kicker: "Reseller panel",
    title: "Your store, keys, and loader.",
    lead: "Issue licenses, ship a rebranded loader, and take payouts from the Discord account your admin added.",
    widgets: [
      { icon: "key", title: "License keys", text: "Generate, freeze, and reset HWID.", meter: 78 },
      { icon: "loader", title: "Rebranded loader", text: "Your name, colors, and logo.", meter: 64 },
      { icon: "users", title: "Customers", text: "Discord access and subscriptions.", meter: 52 },
      { icon: "card", title: "Payouts", text: "Card and crypto checkout.", meter: 86 },
    ],
    feed: ["Key desk", "Loader builds", "Customer list", "Payouts"],
  },
  admin: {
    kicker: "Admin panel",
    title: "Staff desk for Script Engine.",
    lead: "Applications, resellers, keys, and payouts. Sign in with the account on the admins table.",
    widgets: [
      { icon: "grid", title: "Applications", text: "Products, variants, and prices.", meter: 70 },
      { icon: "users", title: "Resellers", text: "Stores, roles, and permissions.", meter: 58 },
      { icon: "key", title: "Keys", text: "Issue, ban, and reset from one list.", meter: 82 },
      { icon: "card", title: "Revenue", text: "Orders, payouts, and balances.", meter: 46 },
    ],
    feed: ["Applications", "Resellers", "License desk", "Payments"],
  },
};

function Icon({ name }) {
  if (name === "key") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M14.5 3a6.5 6.5 0 0 0-6.2 8.4L3 16.7V21h4.3l1.2-1.2h2.1v-2.1l1-1A6.5 6.5 0 1 0 14.5 3Zm2 4.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z" />
      </svg>
    );
  }
  if (name === "loader") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9A2.5 2.5 0 0 1 17.5 17H13v2h2.2v2H8.8v-2H11v-2H6.5A2.5 2.5 0 0 1 4 14.5v-9Zm2.2 2.2h11.6v6.6H6.2V7.7Z" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11Zm6.2.2a3 3 0 1 0-2.3-5.5 4.6 4.6 0 0 1 0 5.1 3 3 0 0 0 2.3.4ZM3.2 19.2A5.8 5.8 0 0 1 9 15a5.8 5.8 0 0 1 5.8 4.2.9.9 0 0 1-.9 1.1H4.1a.9.9 0 0 1-.9-1.1Zm11.2-.3a7 7 0 0 0-1.5-3.6 5.2 5.2 0 0 1 4.4 2.3 4.6 4.6 0 0 1 .7 1.3h-2.7a1 1 0 0 1-.9-.1Z" />
      </svg>
    );
  }
  if (name === "card") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3 7.2A2.2 2.2 0 0 1 5.2 5h13.6A2.2 2.2 0 0 1 21 7.2v9.6a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8V7.2Zm1.6 2.6h14.8V7.2H4.6v2.6Zm0 2.2v4.8h14.8v-4.8H4.6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 3h7v4h-7v-4Z" />
    </svg>
  );
}

function LoginClock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      setLabel(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return <time className="loginClock">{label}</time>;
}

function FootIcon({ name }) {
  if (name === "support") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 3a8 8 0 0 0-8 8v3.2A2.8 2.8 0 0 0 6.8 17H8v-6H5.1A7 7 0 0 1 12 4a7 7 0 0 1 6.9 7H16v6h1.2A2.8 2.8 0 0 0 20 14.2V11a8 8 0 0 0-8-8Zm-3 9h2v5H9v-5Zm6 0h2v5h-2v-5Z" />
      </svg>
    );
  }
  if (name === "discord") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M19.27 5.33A17.4 17.4 0 0 0 15.11 4l-.22.4a16.1 16.1 0 0 1 4.06 1.54 16.4 16.4 0 0 0-12.9 0A16.4 16.4 0 0 1 10.1 4.4L9.89 4a17.4 17.4 0 0 0-4.16 1.33C3.1 8.9 2.4 12.37 2.6 15.8a17.6 17.6 0 0 0 5.32 2.69l.68-1.12a11.5 11.5 0 0 1-1.7-.82l.42-.33c3.28 1.52 6.84 1.52 10.08 0l.42.33c-.54.33-1.11.6-1.7.82l.68 1.12a17.6 17.6 0 0 0 5.32-2.69c.3-4.05-.51-7.49-2.15-10.47ZM9.2 14.3c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.8 2.04-1.8 2.04Zm5.6 0c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.79 2.04-1.8 2.04Z" />
      </svg>
    );
  }
  if (name === "appeal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 3h9.2L19 6.8V21H6V3Zm8 1.5V8h3.5L14 4.5ZM8 11h8v1.5H8V11Zm0 3.2h8v1.5H8v-1.5Zm0 3.3h5.2V19H8v-1.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm6.4 8.2h-2.2a13 13 0 0 0-1.1-4 7.4 7.4 0 0 1 3.3 4ZM12 4.6c.8 1.1 1.6 2.8 2 4.6H10c.4-1.8 1.2-3.5 2-4.6ZM5.1 13.8a7.4 7.4 0 0 1 0-3.6h2.4a14 14 0 0 0 0 3.6H5.1Zm.5 1.6h2.2a13 13 0 0 0 1.1 4 7.4 7.4 0 0 1-3.3-4Zm2.7-6.8H6.1a7.4 7.4 0 0 1 3.3-4 13 13 0 0 0-1.1 4ZM12 19.4c-.8-1.1-1.6-2.8-2-4.6h4c-.4 1.8-1.2 3.5-2 4.6Zm2.6-6.2H9.4a12 12 0 0 1 0-3.6h5.2a12 12 0 0 1 0 3.6Zm.4 6.2a13 13 0 0 0 1.1-4h2.2a7.4 7.4 0 0 1-3.3 4Z" />
    </svg>
  );
}

const FOOT_LINKS = [
  { href: "https://scriptengine.gg/", label: "Site", icon: "site" },
  { href: "https://scriptengine.gg/support/", label: "Support", icon: "support" },
  { href: "https://discord.gg/7BTuz82Px5", label: "Discord", icon: "discord" },
  { href: "https://scriptengine.gg/resellers/", label: "Appeal", icon: "appeal" },
];

export default function LoginStage({ kind = "reseller", children }) {
  const copy = COPY[kind] || COPY.reseller;

  return (
    <main className="loginStage">
      <header className="loginTop">
        <img className="loginLogo" src="/images/scriptengine-logo.png" alt="Script Engine" />
        <div className="loginTopMeta">
          <LoginClock />
          <span className="loginOnline">
            <i />
            Online
          </span>
          <a href="https://scriptengine.gg/" target="_blank" rel="noreferrer">
            scriptengine.gg
          </a>
        </div>
      </header>

      <section className="loginShowcase">
        <p className="loginKicker">{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p className="loginLead">{copy.lead}</p>

        <div className="loginDesk">
          <div className="loginDeskBar">
            <span>Overview</span>
            <span className="loginOnline">
              <i />
              Live
            </span>
          </div>
          <div className="loginWidgets">
            {copy.widgets.map((widget) => (
              <article className="loginWidget" key={widget.title}>
                <div className="loginWidgetTop">
                  <span className="loginWidgetIcon">
                    <Icon name={widget.icon} />
                  </span>
                </div>
                <strong>{widget.title}</strong>
                <p>{widget.text}</p>
                <div className="loginMeter" aria-hidden="true">
                  <span style={{ width: `${widget.meter}%` }} />
                </div>
              </article>
            ))}
          </div>
          <ul className="loginFeed">
            {copy.feed.map((item) => (
              <li key={item}>
                <span>{item}</span>
                <em>Ready</em>
              </li>
            ))}
          </ul>
        </div>

        <div className="loginProducts">
          <div>
            <span>AA</span>
            <div>
              <strong>Aim Assist</strong>
              <small>Controller Emulator</small>
            </div>
          </div>
          <div>
            <span>CS</span>
            <div>
              <strong>Controller Scripts</strong>
              <small>Scripts & Macros</small>
            </div>
          </div>
        </div>
      </section>

      <section className="loginPanel">{children}</section>

      <footer className="loginFootBar">
        <nav aria-label="Script Engine">
          {FOOT_LINKS.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
              <FootIcon name={link.icon} />
              {link.label}
            </a>
          ))}
        </nav>
      </footer>
    </main>
  );
}
