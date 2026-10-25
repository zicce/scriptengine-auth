"use client";

import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Ban, Bell, BookOpen, Bug, Check, ChevronDown, Ellipsis, Gamepad2, Globe, HelpCircle, House, Image as ImageIcon, Layers, Link2, Megaphone, Menu, Rocket, Search, Shuffle, SlidersHorizontal, Star, Wifi, WifiOff, Zap, CircleAlert, CircleQuestionMark, CircuitBoard, Clock3, Code, Copy, Cpu, Download, Equal, Euro, FileBox, FolderDown, HardDrive, Info, KeyRound, LayoutGrid, Loader2, Lock, LogOut, MemoryStick, Monitor, MonitorCheck, Moon, Package, Palette, Pencil, Play, Plus, RefreshCw, RotateCcw, Server, Settings, ShieldCheck, Snowflake, Sparkles, Sun, Tag, Trash2, Unlock, Users, Volume2, VolumeX, Wallet, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { installDemoApi } from "../../lib/demo-api";
import { CRYPTO_BONUS_PERCENT, DEPOSIT_TIERS, DEPOSIT_TIER_DAYS } from "../../lib/pricing";
import { APP_STATUSES, DURATION_UNITS, formatDuration, formatPrice } from "../../lib/constants";
import {
  DEFAULT_KEY_FORMAT,
  KEY_PATTERN_MAX,
  KEY_PRESETS,
  KEY_TOKENS,
  describeKeyFormat,
  formatCombinations,
  isRandomToken,
  keyFormatStrength,
  normalizeKeyFormat,
  previewKeys,
} from "../../lib/key-format";
import { UPDATE_BADGE_COLORS, UPDATE_BADGE_MAX, UPDATE_CUSTOM_TAG_MAX_LENGTH, UPDATE_TAG_ICONS, UPDATE_TAG_MAX, emptyUpdateBadge } from "../../lib/updates";
import { isSoundMuted, playSound, setSoundMuted } from "../../lib/ui-sound";
import { runAccessChecks } from "../../lib/site-access";
import { CloudflareTurnstileWidget } from "./CloudflareTurnstileWidget";
import LoginStage from "./LoginStage";
import styles from "./AdminPanel.module.css";
import versionHeaderShot from "./loader-fonts/version-h.png";

const SESSION_KEY = "se-admin-session";

function publicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

function browserClient() {
  const { url, anonKey } = publicConfig();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeSession(session) {
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    })
  );
}

async function getAccessToken() {
  const session = readSession();
  if (!session?.access_token) return null;
  const expiresAt = Number(session.expires_at || 0) * 1000;
  if (expiresAt > Date.now() + 20000) return session.access_token;

  const client = browserClient();
  if (!client || !session.refresh_token) return null;
  const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
  if (error || !data.session) {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
  writeSession(data.session);
  return data.session.access_token;
}

async function resellerApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function api(path, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    const error = new Error("Sign in required.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function formatAgo(value) {
  if (!value) return "Never";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  const [unit, size] = units.find(([, span]) => seconds >= span);
  const count = Math.floor(seconds / size);
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

function formatSession(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const LOADER_BUILD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatLoaderMb(bytes) {
  return (Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(3);
}

function saveBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "Loader.exe";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function easeBurst(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 4.2);
}

function easeCrawl(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x;
}

function makeGenerateBeats(cap) {
  const chunks = [
    { kind: "burst", weight: randRange(0.09, 0.16) },
    { kind: "pause", ms: randRange(200, 480) },
    { kind: "crawl", weight: randRange(0.07, 0.13) },
    { kind: "pause", ms: randRange(560, 1100) },
    { kind: "burst", weight: randRange(0.14, 0.24) },
    { kind: "pause", ms: randRange(120, 260) },
    { kind: "burst", weight: randRange(0.05, 0.1) },
    { kind: "stall", ms: randRange(420, 860) },
    { kind: "crawl", weight: randRange(0.06, 0.11) },
    { kind: "pause", ms: randRange(720, 1400) },
    { kind: "burst", weight: randRange(0.1, 0.17) },
    { kind: "crawl", weight: randRange(0.04, 0.08) },
    { kind: "pause", ms: randRange(280, 640) },
    { kind: "burst", weight: randRange(0.07, 0.13) },
  ];
  const weightSum = chunks.reduce((sum, chunk) => sum + (chunk.weight || 0), 0);
  return chunks.map((chunk) => {
    if (!chunk.weight) return { kind: chunk.kind, ms: chunk.ms };
    return {
      kind: chunk.kind,
      span: (chunk.weight / weightSum) * cap,
      ms: chunk.kind === "burst" ? randRange(90, 280) : randRange(700, 1600),
    };
  });
}

async function playGenerateMotion(setJob, shouldAbort) {
  const cap = 94;
  const beats = makeGenerateBeats(cap);
  let value = 0;
  setJob({ phase: "generate", value, total: 100 });
  for (const beat of beats) {
    if (shouldAbort()) return value;
    if (beat.kind === "pause" || beat.kind === "stall") {
      const from = performance.now();
      while (performance.now() - from < beat.ms) {
        if (shouldAbort()) return value;
        if (beat.kind === "stall") {
          const wave = Math.sin((performance.now() - from) / 110) * 0.08;
          setJob({ phase: "generate", value: Math.max(0, value + wave), total: 100 });
        }
        await nextFrame();
      }
      setJob({ phase: "generate", value, total: 100 });
      continue;
    }
    const from = value;
    const to = value + beat.span;
    const started = performance.now();
    const ease = beat.kind === "burst" ? easeBurst : easeCrawl;
    while (true) {
      if (shouldAbort()) return value;
      const t = Math.min(1, (performance.now() - started) / beat.ms);
      value = from + (to - from) * ease(t);
      setJob({ phase: "generate", value, total: 100 });
      if (t >= 1) break;
      await nextFrame();
    }
    value = to;
  }
  return value;
}

function filenameFromDisposition(header) {
  const match = /filename="([^"]+)"/.exec(header || "");
  return match?.[1] || "Loader.exe";
}

function LoaderJobBar({ job }) {
  const generate = job.phase === "generate";
  const ratio = generate ? Math.min(100, job.value) : job.total > 0 ? (job.value / job.total) * 100 : 0;
  const label = generate
    ? `Generating custom build (${job.value.toFixed(1)}/100%)`
    : `Downloading Loader (${formatLoaderMb(job.value)}/${formatLoaderMb(job.total)}mb)`;
  return (
    <div
      className={`${styles.loaderGenerate} ${styles.loaderJob}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio)}
    >
      <i className={styles.loaderJobFill} style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }} />
      <span>{label}</span>
    </div>
  );
}

function licenseExpiry(license) {
  if (!license?.activated_at) return { text: "—" };
  const unit = String(license.duration_unit || "").toLowerCase();
  if (unit === "lifetime" || unit === "unlimited" || !license.expires_at) return { text: "Lifetime" };
  const end = new Date(license.expires_at).getTime();
  if (Number.isNaN(end)) return { text: "—" };
  return { end };
}

function formatCountdown(remaining) {
  if (remaining <= 0) return "Expired";
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const pad = (value) => String(value).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}.${pad(total % 60)}`;
  return days ? `${days}d ${clock}` : clock;
}

const LicenseFreezeContext = createContext(null);

const CLICKABLE = "button, a[href], [role='button'], label[class], input[type='checkbox'], input[type='radio'], select";

function spawnBubble(x, y) {
  const root = document.createElement("span");
  root.className = styles.clickBubble;
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  root.setAttribute("aria-hidden", "true");
  const ring = document.createElement("i");
  ring.className = styles.clickBubbleRing;
  root.appendChild(ring);
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.5;
    const distance = 16 + Math.random() * 10;
    const dot = document.createElement("b");
    dot.className = styles.clickBubbleDot;
    dot.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    dot.style.setProperty("--size", `${3 + Math.random() * 3}px`);
    root.appendChild(dot);
  }
  document.body.appendChild(root);
  window.setTimeout(() => root.remove(), 700);
}

function ExpiresIn({ license }) {
  const frozenSince = useContext(LicenseFreezeContext);
  const frozenAt = frozenSince ? new Date(frozenSince).getTime() : NaN;
  const expiry = licenseExpiry(license);
  const [now, setNow] = useState(() => Date.now());
  const frozen = Boolean(expiry.end) && Number.isFinite(frozenAt) && expiry.end > frozenAt;
  const ticking = Boolean(expiry.end) && !frozen && expiry.end > now;

  useEffect(() => {
    if (!ticking) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  if (!expiry.end) return expiry.text;
  if (frozen) {
    return (
      <span className={`${styles.countdown} ${styles.countdownFrozen}`} title="Frozen while the loader is under maintenance">
        <Snowflake size={11} />
        {formatCountdown(expiry.end - frozenAt)}
      </span>
    );
  }
  return <span className={styles.countdown}>{formatCountdown(expiry.end - now)}</span>;
}

function readLockedHardware(stored) {
  const [hash = "", packed = ""] = String(stored || "").split("|");
  if (!packed) return { hash, info: null };
  try {
    const base64 = packed.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64 + "===".slice((base64.length + 3) % 4)), (char) => char.charCodeAt(0));
    return { hash, info: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { hash, info: null };
  }
}

const CLOSE_ANIMATION_MS = 200;

function useAnimatedClose(onClose, instant = false) {
  const [closing, setClosing] = useState(false);
  const pending = useRef(false);
  const latest = useRef(onClose);
  latest.current = onClose;

  const close = useCallback(() => {
    if (instant) {
      latest.current?.();
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setClosing(true);
    window.setTimeout(() => {
      pending.current = false;
      setClosing(false);
      latest.current?.();
    }, CLOSE_ANIMATION_MS);
  }, [instant]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return [closing, close];
}

function LicenseInfo({ license, appName, resellerName, light, onClose: requestClose }) {
  const [copied, setCopied] = useState("");
  const [closing, onClose] = useAnimatedClose(requestClose);

  if (typeof document === "undefined") return null;

  const locked = readLockedHardware(license.hwid);
  const copy = async (value, id) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1200);
  };
  const details = [
    { label: "Application", value: appName || "—" },
    { label: "Variant", value: license.variant_label || "—" },
    { label: "Length", value: formatDuration(license.duration_value, license.duration_unit) },
    { label: "Expires in", value: <ExpiresIn license={license} /> },
    { label: "Created", value: formatDate(license.created_at) },
    { label: "Activated at", value: license.activated_at ? formatDate(license.activated_at) : "—" },
    { label: "Expires at", value: license.expires_at ? formatDate(license.expires_at) : license.activated_at ? "Never" : "—" },
    ...(resellerName !== undefined ? [{ label: "Reseller", value: resellerName || "—" }] : []),
    ...(license.ban_reason ? [{ label: "Ban reason", value: license.ban_reason }] : []),
  ];
  const hardware = [
    { icon: CircuitBoard, label: "Motherboard", value: locked.info?.board },
    { icon: Monitor, label: "GPU", value: locked.info?.gpu },
    { icon: Cpu, label: "CPU", value: locked.info?.cpu },
    { icon: MemoryStick, label: "RAM", value: locked.info?.ram },
  ];

  return createPortal(
    <div className={`${styles.versionHelpTheme}${light ? ` ${styles.themeLight}` : ""}`}>
      <div className={`${styles.versionHelpOverlay}${closing ? ` ${styles.modalClosing}` : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className={`${styles.versionHelp} ${styles.licenseInfo}`} role="dialog" aria-modal="true" aria-label="License information">
          <div className={styles.versionHelpHead}>
            <span><Info size={16} /> License information</span>
            <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
          </div>

          <div className={styles.licenseInfoKey}>
            <KeyRound size={15} />
            <code>{license.license_key}</code>
            <span className={`${styles.status} ${statusClass(license.status)}`}>{license.status}</span>
            <button className={styles.iconButton} type="button" aria-label="Copy key" onClick={() => copy(license.license_key, "key")}>
              {copied === "key" ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
            </button>
          </div>

          <dl className={styles.licenseInfoGrid}>
            {details.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.licenseInfoHwid}>
            <div className={styles.licenseInfoHwidHead}>
              <span><Lock size={13} /> HWID lock</span>
              <em className={license.hwid ? styles.licenseInfoLocked : ""}>{license.hwid ? "Locked" : "Not locked"}</em>
            </div>
            {license.hwid ? (
              <>
                <div className={styles.licenseInfoParts}>
                  {hardware.map((part) => {
                    const PartIcon = part.icon;
                    return (
                      <div key={part.label}>
                        <i><PartIcon size={14} /></i>
                        <span>{part.label}</span>
                        <strong>{part.value || "Not recorded"}</strong>
                      </div>
                    );
                  })}
                </div>
                {!locked.info ? <p className={styles.licenseInfoNote}>This PC was locked by an older loader, so its parts were not recorded. They will appear after the next sign-in.</p> : null}
                <div className={styles.licenseInfoHash}>
                  <span>Hash</span>
                  <code>{locked.hash}</code>
                  <button className={styles.iconButton} type="button" aria-label="Copy HWID" onClick={() => copy(locked.hash, "hash")}>
                    {copied === "hash" ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.licenseInfoNote}>The license locks to the first PC that signs in with it.</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatPriceRange(variants) {
  const prices = (variants || []).map((variant) => Number(variant.price)).filter((amount) => Number.isFinite(amount));
  if (!prices.length) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatPrice(min);
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}

function variantOnSale(variant) {
  const price = Number(variant?.price);
  const list = Number(variant?.listPrice);
  return Number.isFinite(price) && Number.isFinite(list) && list > price + 0.001;
}

function VariantPrice({ variant, percent }) {
  const sale = variantOnSale(variant);
  return (
    <span className={styles.variantPrice}>
      {sale ? <s>{formatPrice(variant.listPrice)}</s> : null}
      <b>{formatPrice(variant.price)}</b>
      {sale ? <em>{`-${Number(percent) || 0}%`}</em> : null}
    </span>
  );
}

function VariantPicker({ variants, value, onChange, percent }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const box = useRef(null);
  const menu = useRef(null);
  const selected = variants.find((variant) => variant.id === value) || null;

  useEffect(() => {
    if (!open) return undefined;
    function placeMenu() {
      const button = box.current?.querySelector("button");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = rect.width;
      let left = rect.left;
      const edge = 12;
      if (left + width > window.innerWidth - edge) left = Math.max(edge, window.innerWidth - edge - width);
      setPlace({ top: rect.bottom + 6, left, width });
    }
    function close(event) {
      if (box.current?.contains(event.target) || menu.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    placeMenu();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  return (
    <div className={`${styles.variantPick}${open ? ` ${styles.variantPickOpen}` : ""}`} ref={box}>
      <button
        className={styles.variantPickButton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? (
          <span className={styles.variantPickLabel}>
            <strong>{selected.label}</strong>
            <small>{formatDuration(selected.duration_value, selected.duration_unit)}</small>
          </span>
        ) : (
          <span className={styles.variantPickLabel}>
            <strong>Choose a variant</strong>
          </span>
        )}
        {selected ? <VariantPrice variant={selected} percent={percent} /> : null}
        <ChevronDown size={14} />
      </button>
      {open && place
        ? createPortal(
            <div
              className={styles.variantMenu}
              role="listbox"
              ref={menu}
              style={{ top: place.top, left: place.left, width: place.width }}
            >
              {variants.map((variant) => {
                const active = variant.id === selected?.id;
                return (
                  <button
                    key={variant.id}
                    className={`${styles.variantOption}${active ? ` ${styles.variantOptionOn}` : ""}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(variant.id);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.variantPickLabel}>
                      <strong>{variant.label}</strong>
                      <small>{formatDuration(variant.duration_value, variant.duration_unit)}</small>
                    </span>
                    <VariantPrice variant={variant} percent={percent} />
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function statusClass(status) {
  const key = String(status || "").replace(/\s+/g, "");
  return styles[`status${key}`] || "";
}

function Drawer({ title, onClose: requestClose, instantClose = false, children }) {
  const [closing, onClose] = useAnimatedClose(requestClose, instantClose);
  return (
    <div className={`${styles.overlay}${closing ? ` ${styles.overlayClosing}` : ""}`} onClick={onClose}>
      <aside className={styles.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.drawerHead}>
          <h2>{title}</h2>
          <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function LoginScreen() {
  const config = publicConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cfStatus, setCfStatus] = useState("idle");
  const [link, setLink] = useState({ status: "checking", apiMs: null, dbMs: null });
  const cfTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setLink({ status: "offline", apiMs: null, dbMs: null });
        return;
      }
      const started = performance.now();
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        const apiMs = response.ok ? Math.max(1, Math.round(performance.now() - started)) : null;
        const dbOk = Boolean(body.db);
        setLink({
          status: !response.ok ? "offline" : dbOk ? "online" : "degraded",
          apiMs,
          dbMs: dbOk ? body.dbMs ?? null : null,
        });
      } catch {
        if (!cancelled) setLink({ status: "offline", apiMs: null, dbMs: null });
      }
    }
    ping();
    const id = window.setInterval(ping, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (cfTimer.current) window.clearTimeout(cfTimer.current);
    };
  }, []);

  function startCloudflareVerify() {
    if (cfStatus !== "idle" || busy) return;
    setMessage("");
    setCfStatus("verifying");
    cfTimer.current = window.setTimeout(() => {
      if (!runAccessChecks()) {
        setCfStatus("idle");
        setMessage("Verification failed. Please try again.");
        return;
      }
      setCfStatus("success");
    }, 1800);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (cfStatus !== "success") {
      setMessage("Complete the Cloudflare check.");
      return;
    }
    const client = browserClient();
    if (!client) {
      setMessage("Add the Supabase URL and anon key in .env.local, then restart the server.");
      return;
    }
    setBusy(true);
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error || !data.session) {
      setMessage(error?.message || "Sign in failed.");
      return;
    }
    writeSession(data.session);
    window.location.reload();
  }

  return (
    <LoginStage kind="admin">
      <form className="loginCard" onSubmit={onSubmit}>
        <div className="loginCardHead">
          <span className="loginCardMark" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2>Sign in</h2>
            <p>Use the Supabase account that was added to the admins table.</p>
          </div>
        </div>
        <ol className="loginSteps">
          <li><span>1</span>Check</li>
          <li><span>2</span>Password</li>
          <li><span>3</span>Panel</li>
        </ol>
        {!config.url || !config.anonKey ? (
          <div className="loginAlert">Supabase public keys are missing. Copy .env.example to .env.local.</div>
        ) : null}
        {message ? <div className="loginAlert">{message}</div> : null}
        <div className={styles.loginForm}>
          <div className={styles.group}>
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className={styles.group}>
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <CloudflareTurnstileWidget
            className="loginTurnstile"
            status={cfStatus}
            onStart={startCloudflareVerify}
            disabled={busy}
          />
          <button className={`${styles.primary} loginSubmit`} type="submit" disabled={busy || cfStatus !== "success"}>
            {busy ? <Loader2 size={14} /> : null}
            Sign in
          </button>
        </div>
        <p className="loginFoot">Staff only. The same check runs before the password is sent.</p>
        <div className="loginStatus" aria-live="polite">
          <div>
            <span>Status</span>
            <strong className={link.status === "online" ? "loginStatusOn" : link.status === "degraded" ? "loginStatusSlow" : link.status === "offline" ? "loginStatusOff" : ""}>
              {link.status === "online" ? "Online" : link.status === "degraded" ? "Degraded" : link.status === "offline" ? "Offline" : "Checking"}
            </strong>
          </div>
          <div>
            <span>API</span>
            <strong>{link.apiMs != null ? `${link.apiMs} ms` : "—"}</strong>
          </div>
          <div>
            <span>Database</span>
            <strong>{link.dbMs != null ? `${link.dbMs} ms` : "—"}</strong>
          </div>
        </div>
      </form>
    </LoginStage>
  );
}

const emptyApp = { name: "", version: "1.0.0", status: "Active" };
const emptyVariant = { label: "", durationValue: 1, durationUnit: "days", price: "" };

function blankVariant() {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...emptyVariant };
}

function VariantFields({ variant, onChange, idPrefix }) {
  const lifetime = variant.durationUnit === "lifetime";
  return (
    <>
      <div className={styles.group}>
        <label htmlFor={`${idPrefix}-name`}>Variant name</label>
        <input
          id={`${idPrefix}-name`}
          value={variant.label}
          onChange={(event) => onChange({ label: event.target.value })}
          required
        />
      </div>
      <div className={styles.row}>
        <div className={styles.group}>
          <label htmlFor={`${idPrefix}-length`}>Length</label>
          <input
            id={`${idPrefix}-length`}
            type="number"
            min="1"
            value={lifetime ? "" : variant.durationValue}
            disabled={lifetime}
            onChange={(event) => onChange({ durationValue: Number(event.target.value || 1) })}
          />
        </div>
        <div className={styles.group}>
          <label htmlFor={`${idPrefix}-unit`}>Unit</label>
          <select
            id={`${idPrefix}-unit`}
            value={variant.durationUnit}
            onChange={(event) => onChange({ durationUnit: event.target.value })}
          >
            {DURATION_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.group}>
        <label className={styles.priceLabel} htmlFor={`${idPrefix}-price`}>
          Price
          <Euro size={13} />
        </label>
        <input
          id={`${idPrefix}-price`}
          type="number"
          min="0"
          step="0.01"
          value={variant.price}
          onChange={(event) => onChange({ price: event.target.value })}
          required
        />
      </div>
    </>
  );
}

function AppIdButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className={styles.muted}>—</span>;

  return (
    <button
      className={styles.appId}
      type="button"
      onClick={async (event) => {
        event.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span className={styles.appIdValue}>{value}</span>
      {copied ? <span className={styles.appIdCopied}>Copied</span> : null}
    </button>
  );
}

const PANEL_VIEWS = ["links", "faq", "applications", "licenses", "updates", "deposit", "transactions", "loader", "resellers", "settings", "team"];
const DEPOSIT_MIN = 25;
const DEPOSIT_MAX = 2500;
const DEPOSIT_PRESETS = [25, 50, 100, 250, 500, 1000];

function clampDeposit(value) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount)) return DEPOSIT_MIN;
  return Math.min(DEPOSIT_MAX, Math.max(DEPOSIT_MIN, amount));
}

function formatDepositDraft(amount) {
  const rounded = Math.round(Number(amount) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// The public /demo page runs this same panel against sample data (lib/demo-api.js).
let demoPanelBase = "";

function panelBase(reseller) {
  return reseller ? demoPanelBase || "/panel" : "/admin";
}

function parsePanelPath(pathname, reseller) {
  const base = panelBase(reseller);
  const path = pathname || base;
  const rest = path === base ? "" : path.startsWith(`${base}/`) ? path.slice(base.length + 1) : "";
  const parts = rest.split("/").filter(Boolean);
  if (!reseller && parts[0] === "resellers" && parts[1]) {
    return { view: "reseller-licenses", resellerId: decodeURIComponent(parts[1]), canonical: `${base}/resellers/${parts[1]}` };
  }
  if (parts.length === 1 && PANEL_VIEWS.includes(parts[0])) {
    if ((reseller && parts[0] === "resellers") || (!reseller && (parts[0] === "team" || parts[0] === "transactions" || parts[0] === "deposit"))) {
      return { view: "applications", resellerId: "", canonical: `${base}/applications` };
    }
    return { view: parts[0], resellerId: "", canonical: `${base}/${parts[0]}` };
  }
  return { view: "applications", resellerId: "", canonical: `${base}/applications` };
}

const DEPOSIT_METHODS = [
  {
    id: "card",
    name: "Credit/Debit Card",
    detail: "Visa, Mastercard",
    processor: "Stripe",
    marks: [
      { src: "/images/payment-methods/visa.svg", card: true },
      { src: "/images/payment-methods/mastercard.svg", card: true },
    ],
  },
  {
    id: "crypto",
    name: "Cryptocurrencies",
    detail: `BTC, ETH, LTC, USDT and more · +${CRYPTO_BONUS_PERCENT}% bonus`,
    processor: "NOWPayments",
    marks: [{ src: "/images/payment-methods/bitcoin.svg?v=3" }],
  },
];

const DEPOSIT_STEPS = [
  { icon: Wallet, title: "Choose amount", text: `Anything from ${formatPrice(DEPOSIT_MIN)} to ${formatPrice(DEPOSIT_MAX)}.` },
  { icon: ShieldCheck, title: "Pay securely", text: "Card through Stripe or crypto through NOWPayments." },
  { icon: Check, title: "Balance credited", text: "Added automatically once the payment is confirmed." },
];

function DepositScreen({
  balance,
  amount,
  draft,
  draftOk,
  method,
  preview,
  topups,
  depositedTotal,
  onAmount,
  onDraft,
  onCommitDraft,
  onMethod,
  onPreview,
  onClearPreview,
  busy = false,
  discount = 0,
  tierTotal = 0,
}) {
  const nextTier = DEPOSIT_TIERS.find((tier) => tierTotal < tier.amount) || null;
  const fill = ((clampDeposit(amount) - DEPOSIT_MIN) / (DEPOSIT_MAX - DEPOSIT_MIN)) * 100;
  const bonus = method === "crypto" ? Math.round(Number(amount || 0) * CRYPTO_BONUS_PERCENT) / 100 : 0;
  const after = Math.round((Number(balance || 0) + Number(amount || 0) + bonus) * 100) / 100;
  const selected = DEPOSIT_METHODS.find((entry) => entry.id === method) || null;
  const step = preview ? 2 : selected ? 1 : 0;

  return (
    <>
      <div className={styles.viewHead}>
        <div>
          <h1>Deposit</h1>
          <p>{demoPanelBase ? "Top up your balance to buy licenses. This is a preview only, so no money can be sent here." : "Top up your balance to buy licenses. This screen is a preview and does not charge anything."}</p>
        </div>
      </div>

      <div className={styles.dpGrid}>
        <div className={styles.dpMain}>
          <section className={`${styles.dpCard} ${styles.dpAmountCard}`}>
            <div className={styles.dpCardHead}>
              <span className={styles.dpKicker}>Amount</span>
              <span className={styles.dpBalanceTag}>
                <Wallet size={13} />
                Balance <strong>{formatPrice(balance)}</strong>
              </span>
      </div>

            <label className={`${styles.dpAmount}${draftOk ? "" : ` ${styles.dpAmountBad}`}`} htmlFor="deposit-amount">
              <span className={styles.dpCurrency}>€</span>
              <input
                id="deposit-amount"
                inputMode="decimal"
                autoComplete="off"
                value={draft}
                style={{ width: `${Math.max(2, draft.length || 1) + 0.2}ch` }}
                onChange={(event) => onDraft(event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
                onBlur={onCommitDraft}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              />
            </label>
            <p className={`${styles.dpAmountHint}${draftOk ? "" : ` ${styles.dpAmountHintBad}`}`}>
              {draftOk ? "Click the amount to type your own." : `Enter an amount from ${formatPrice(DEPOSIT_MIN)} to ${formatPrice(DEPOSIT_MAX)}.`}
            </p>

            <div className={styles.dpSlider}>
            <input
                className={styles.dpRange}
              style={{ "--fill": `${fill}%` }}
              type="range"
                aria-label="Deposit amount"
              min={DEPOSIT_MIN}
              max={DEPOSIT_MAX}
              step="1"
              value={Math.min(DEPOSIT_MAX, Math.max(DEPOSIT_MIN, Math.round(Number(amount) || DEPOSIT_MIN)))}
              onChange={(event) => onAmount(event.target.value)}
            />
              <div className={styles.dpScale}>
              <span>{formatPrice(DEPOSIT_MIN)}</span>
              <span>{formatPrice(DEPOSIT_MAX)}</span>
            </div>
              </div>

            <div className={styles.dpPresets}>
              {DEPOSIT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`${styles.dpPreset}${Number(amount) === preset ? ` ${styles.dpPresetOn}` : ""}`}
                  type="button"
                  onClick={() => onAmount(preset)}
                >
                  {formatPrice(preset)}
                </button>
              ))}
            </div>

            <div className={styles.dpFlow}>
              <div>
                <span>Now</span>
                <strong>{formatPrice(balance)}</strong>
              </div>
              <i aria-hidden="true"><ArrowRight size={14} /></i>
              <div>
                <span>Deposit</span>
                <strong className={styles.dpFlowPlus}>+{formatPrice(amount)}</strong>
              </div>
              <i aria-hidden="true"><ArrowRight size={14} /></i>
              <div>
                <span>After</span>
                <strong key={after} className={styles.dpFlowAfter}>{formatPrice(after)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.dpCard}>
            <div className={styles.dpCardHead}>
              <span className={styles.dpKicker}>How does it work?</span>
            </div>
            <ol className={styles.dpSteps}>
              {DEPOSIT_STEPS.map((entry, index) => {
                const StepIcon = entry.icon;
                const state = index < step ? styles.dpStepDone : index === step ? styles.dpStepNow : "";
                return (
                  <li key={entry.title} className={`${styles.dpStep} ${state}`}>
                    <div className={styles.dpStepTop}>
                      <span className={styles.dpStepIcon}>
                        {index < step ? <Check size={16} strokeWidth={3} /> : <StepIcon size={16} />}
                      </span>
                      <em>Step {String(index + 1).padStart(2, "0")}</em>
                    </div>
                    <strong>{entry.title}</strong>
                    <p>{entry.text}</p>
                    <i className={styles.dpStepLink} aria-hidden="true" />
              </li>
                );
              })}
            </ol>
            <div className={styles.dpFacts}>
              <span><ShieldCheck size={12} /> Secured payment processor</span>
              <span><Check size={12} /> Automatic balance credit</span>
              <span><Clock3 size={12} /> Instant confirmation</span>
              <span className={styles.dpProcessors}>
                <img src="/images/payment-methods/stripe.svg" alt="Stripe" title="Card payments are processed by Stripe" />
                <img className={styles.dpNpDark} src="/images/payment-methods/nowpayments.svg" alt="NOWPayments" title="Crypto payments are processed by NOWPayments" />
                <img className={styles.dpNpLight} src="/images/payment-methods/nowpayments-ink.svg" alt="" />
              </span>
            </div>
          </section>
        </div>

        <aside className={styles.dpSide}>
          <section className={styles.dpCard}>
            <div className={styles.dpCardHead}>
              <span className={styles.dpKicker}>Payment method</span>
            </div>
            <div className={styles.dpMethods}>
              {DEPOSIT_METHODS.map((entry) => (
                <button
                  key={entry.id}
                  className={`${styles.dpMethod}${method === entry.id ? ` ${styles.dpMethodOn}` : ""}`}
                  type="button"
                  aria-pressed={method === entry.id}
                  onClick={() => onMethod(entry.id)}
                >
                  <span className={styles.dpMarks} aria-hidden="true">
                    {entry.marks.map((mark) => (
                      <img key={mark.src} className={mark.card ? styles.dpMarkCard : ""} src={mark.src} alt="" />
                    ))}
              </span>
                  <span className={styles.dpMethodText}>
                    <strong>{entry.name}</strong>
                    <em>{entry.detail}</em>
              </span>
                  <span className={styles.dpRadio} aria-hidden="true">
                    <Check size={11} strokeWidth={3} />
              </span>
                </button>
              ))}
            </div>

            <div className={`${styles.dpCheckout}${selected ? ` ${styles.dpCheckoutOpen}` : ""}`}>
              <div className={styles.dpCheckoutInner}>
                <dl className={styles.dpSummary}>
              <div>
                    <dt>Amount</dt>
                    <dd>{formatPrice(amount)}</dd>
              </div>
                  {bonus > 0 ? (
                    <div>
                      <dt>Crypto bonus ({CRYPTO_BONUS_PERCENT}%)</dt>
                      <dd>+{formatPrice(bonus)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Fee</dt>
                    <dd>{formatPrice(0)}</dd>
            </div>
                  <div>
                    <dt>Processed by</dt>
                    <dd>{selected?.processor || "—"}</dd>
                  </div>
                  <div className={styles.dpSummaryTotal}>
                    <dt>Balance after</dt>
                    <dd>{formatPrice(after)}</dd>
                  </div>
                </dl>
                {preview ? (
                  <div className={styles.dpReceipt}>
                    <ShieldCheck size={16} />
                    <div>
                      <strong>Preview ready</strong>
                      <p>{demoPanelBase ? "This is a preview only. You cannot send money here." : "No payment was sent. Checkout is not connected yet."}</p>
                    </div>
                    <button className={styles.secondary} type="button" onClick={onClearPreview}>
                      Back
                    </button>
                  </div>
                ) : (
                  <button className={`${styles.primary} ${styles.dpPay}`} type="button" disabled={!draftOk || !selected || busy} onClick={onPreview}>
                    {busy ? "Opening checkout…" : `Pay ${formatPrice(amount)}`}
                    {busy ? <Loader2 size={15} /> : <ArrowRight size={15} />}
                  </button>
                )}
              </div>
            </div>
            {selected ? null : <p className={styles.dpPick}>Pick a method to continue.</p>}
          </section>

          <section className={styles.dpCard}>
            <div className={styles.dpCardHead}>
              <span className={styles.dpKicker}>Discount tiers</span>
              <span className={styles.dpTotal}>{Number(discount) > 0 ? `${Number(discount)}% active` : "None yet"}</span>
            </div>
            <ul className={styles.dpTiers}>
              {DEPOSIT_TIERS.map((tier) => (
                <li key={tier.amount} className={tierTotal >= tier.amount ? styles.dpTierOn : ""}>
                  <span>{formatPrice(tier.amount)}</span>
                  <b>{tier.discount}% off</b>
                </li>
              ))}
            </ul>
            <p className={styles.dpTierNote}>
              Card and crypto top-ups in the last {DEPOSIT_TIER_DAYS} days add up: {formatPrice(tierTotal)} so far.
              {nextTier ? ` ${formatPrice(nextTier.amount - tierTotal)} more unlocks ${nextTier.discount}%.` : " You have the top tier."} Your discount never goes down.
            </p>
          </section>

          <section className={styles.dpCard}>
            <div className={styles.dpCardHead}>
              <span className={styles.dpKicker}>Recent top-ups</span>
              <span className={styles.dpTotal}>{formatPrice(depositedTotal)} total</span>
            </div>
            {topups.length ? (
              <ul className={styles.dpHistory}>
                {topups.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <i aria-hidden="true"><Plus size={13} /></i>
                    <span>
                      <strong>Account top-up{entry.bonus > 0 ? ` (incl. ${formatPrice(entry.bonus)} bonus)` : ""}</strong>
                      <em>{formatDate(entry.createdAt)}</em>
                    </span>
                    <b>+{formatPrice(entry.amount)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.dpEmpty}>
                <Wallet size={18} />
                <span>No deposits yet.</span>
              </div>
            )}
          </section>
        </aside>
          </div>
    </>
  );
}

const UPDATE_PREVIEW_CHARS = 320;

const TAG_ICON_COMPONENTS = {
  tag: Tag,
  package: Package,
  shield: ShieldCheck,
  zap: Zap,
  bug: Bug,
  wrench: Wrench,
  sparkles: Sparkles,
  rocket: Rocket,
  star: Star,
  monitor: Monitor,
  cpu: Cpu,
  server: Server,
  gamepad: Gamepad2,
  globe: Globe,
  lock: Lock,
  key: KeyRound,
  download: Download,
  bell: Bell,
};

const TAG_ICON_LABELS = {
  tag: "Tag",
  package: "Package",
  shield: "Shield",
  zap: "Lightning",
  bug: "Bug",
  wrench: "Wrench",
  sparkles: "Sparkles",
  rocket: "Rocket",
  star: "Star",
  monitor: "Display",
  cpu: "CPU",
  server: "Server",
  gamepad: "Gamepad",
  globe: "Globe",
  lock: "Lock",
  key: "Key",
  download: "Download",
  bell: "Bell",
};

function affectIcon(tag) {
  if (tag.kind === "custom") return TAG_ICON_COMPONENTS[tag.icon] || Tag;
  return tag.kind === "variant" ? Tag : Package;
}

function affectLabel(tag) {
  return tag.kind === "variant" ? `${tag.applicationName} / ${tag.name}` : tag.name;
}

function AffectChip({ tag, children }) {
  const Icon = affectIcon(tag);
  return (
    <span className={`${styles.updateTag}${tag.kind === "custom" ? ` ${styles.updateTagCustom}` : ""}`}>
      <Icon size={12} />
      {affectLabel(tag)}
      {children}
    </span>
  );
}

function updateDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const today = new Date();
  const start = (input) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function formFromUpdate(entry) {
  return {
    title: entry.title || "",
    description: entry.description || "",
    badges: entry.badges?.length ? entry.badges.map((badge) => ({ ...badge })) : [emptyUpdateBadge()],
    tags: (entry.tags || []).map((tag) => ({ ...tag })),
  };
}

function UpdateEntry({ entry, fresh, editing, reseller, busy, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const description = String(entry.description || "");
  const long = description.length > UPDATE_PREVIEW_CHARS;
  const accent = entry.badges?.[0]?.color || "";

  return (
    <article className={`${styles.feedItem}${fresh ? ` ${styles.feedItemNew}` : ""}${editing ? ` ${styles.feedItemEdit}` : ""}`} style={accent ? { "--feed-accent": accent } : undefined}>
      <span className={styles.feedDot} aria-hidden="true" />
      <div className={styles.feedCard}>
        <header className={styles.feedHead}>
          <span className={styles.feedIcon} aria-hidden="true">
            <Megaphone size={16} />
          </span>
          <div className={styles.feedTitle}>
            <div className={styles.feedTitleRow}>
              <h2>{entry.title}</h2>
              {fresh ? <span className={styles.feedNew}>New</span> : null}
        </div>
            <span className={styles.feedMeta} title={formatDate(entry.createdAt)}>
              Administrator
              <i aria-hidden="true" />
              {formatAgo(entry.createdAt)}
            </span>
          </div>
          {reseller ? null : (
            <div className={styles.feedActions}>
              <button className={`${styles.iconButton} ${styles.feedEdit}`} type="button" disabled={busy} onClick={() => onEdit(entry)} aria-label="Edit update" title="Edit update">
                <Pencil size={14} />
              </button>
              <button className={`${styles.iconButton} ${styles.feedDelete}`} type="button" disabled={busy} onClick={() => onDelete(entry.id)} aria-label="Delete update" title="Delete update">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </header>

        {(entry.badges || []).length ? (
          <div className={styles.feedBadges}>
            {entry.badges.map((badge, index) => (
              <span className={styles.updateBadge} style={{ background: badge.color }} key={`${entry.id}-badge-${index}`}>
                {badge.label}
              </span>
            ))}
              </div>
        ) : null}

        <div className={`${styles.feedBody}${long && !open ? ` ${styles.feedBodyClamped}` : ""}`}>
          <p className={styles.updateDesc}>{description}</p>
            </div>
        {long ? (
          <button className={`${styles.feedMore}${open ? ` ${styles.feedMoreOpen}` : ""}`} type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "Show less" : "Read more"}
            <ChevronDown size={14} />
          </button>
        ) : null}

        {(entry.tags || []).length ? (
          <div className={styles.feedTags}>
            <span className={styles.feedTagsLabel}>Affects</span>
            {entry.tags.map((tag) => (
              <AffectChip tag={tag} key={`${entry.id}-${tag.kind}-${tag.id}`} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function UpdateFeed({ updates, loading, reseller, newSince, busy, editingId, onEdit, onDelete }) {
  const groups = [];
  updates.forEach((entry) => {
    const label = updateDayLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  });

  if (loading && !updates.length) {
    return (
      <div className={styles.feedEmpty}>
        <Loader2 className={styles.spin} size={18} />
        <span>Loading updates…</span>
      </div>
    );
  }

  if (!updates.length) {
    return (
      <div className={styles.feedEmpty}>
        <span className={styles.feedEmptyIcon}><Bell size={18} /></span>
        <strong>No updates yet</strong>
        <span>{reseller ? "Messages from the administrator will appear here." : "Published messages will appear here."}</span>
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {groups.map((group) => (
        <section className={styles.feedGroup} key={group.label}>
          <div className={styles.feedDay}>
            <span>{group.label}</span>
            <em>{group.entries.length === 1 ? "1 message" : `${group.entries.length} messages`}</em>
          </div>
          {group.entries.map((entry) => (
            <UpdateEntry
              key={entry.id}
              entry={entry}
              fresh={reseller && newSince !== null && new Date(entry.createdAt).getTime() > newSince}
              reseller={reseller}
              busy={busy}
              editing={editingId === entry.id}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function VersionHelp({ loaderVersion, authVersion, light, reseller = false, onClose: requestClose }) {
  const same = Boolean(loaderVersion && authVersion) && loaderVersion.replace(/^v/i, "").toLowerCase() === authVersion.replace(/^v/i, "").toLowerCase();
  const [closing, onClose] = useAnimatedClose(requestClose);

  const show = (value) => (value ? `v${String(value).replace(/^v/i, "")}` : "—");

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`${styles.versionHelpTheme}${light ? ` ${styles.themeLight}` : ""}`}>
    <div className={`${styles.versionHelpOverlay}${closing ? ` ${styles.modalClosing}` : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className={styles.versionHelp} role="dialog" aria-modal="true" aria-label="How loader versions work">
      <div className={styles.versionHelpHead}>
        <span><CircleQuestionMark size={16} /> How versions work</span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>

      <div className={`${styles.versionHelpPair}${reseller ? ` ${styles.versionHelpPairEven}` : ""}`}>
        <div className={styles.versionHelpItem}>
          <em className={styles.versionHelpTagLoader}><Code size={11} /> In the source code</em>
          <strong>LOADER_VERSION</strong>
          {reseller ? (
            <p>
              The version written in the source code of the <b>currently uploaded</b> Loader.exe. The site reads it from the file automatically. It is the version of the Loader.exe file itself.
            </p>
          ) : (
            <>
              <p>
                The version written in the source code of the <b>currently uploaded</b> Loader.exe. The site reads it from the file automatically when you upload. It is the version of the Loader.exe file itself.
              </p>
              <figure className={styles.versionHelpShot}>
                <img src={versionHeaderShot.src} alt="LOADER_VERSION in version.h" />
                <figcaption><Code size={11} /> framework/headers/version.h</figcaption>
              </figure>
              <p className={styles.versionHelpSmall}>Change it in version.h, rebuild Loader.exe, and upload the new file here.</p>
            </>
          )}
        </div>
        <div className={styles.versionHelpItem}>
          <em className={styles.versionHelpTagAuth}><Server size={11} /> Global</em>
          <strong>AUTH VERSION</strong>
          <p>
            {reseller
              ? "The global authorization version. Every loader asks the server for it on launch, together with the status. An administrator manages it."
              : "The global authorization version. Every loader asks the server for it on launch, together with the status. It is set from LOADER_VERSION on upload and can be changed here."}
          </p>
        </div>
      </div>

      <div className={styles.versionFlow}>
        <div className={styles.versionFlowStep}>
          <i><Play size={13} /></i>
          <span>Launch</span>
          <small>Loader.exe</small>
        </div>
        <ArrowRight className={styles.versionFlowArrow} size={14} />
        <div className={styles.versionFlowStep}>
          <i><Code size={13} /></i>
          <span>Reads</span>
          <code>{show(loaderVersion)}</code>
        </div>
        <ArrowRight className={styles.versionFlowArrow} size={14} />
        <div className={styles.versionFlowStep}>
          <i><Server size={13} /></i>
          <span>Asks auth</span>
          <code>{show(authVersion)}</code>
        </div>
        <ArrowRight className={styles.versionFlowArrow} size={14} />
        <div className={`${styles.versionFlowStep} ${same ? styles.versionFlowSame : styles.versionFlowDiff}`}>
          <i><Equal size={13} /></i>
          <span>Compare</span>
          <small>{same ? "Same" : "Different"}</small>
        </div>
      </div>

      <ul className={styles.versionOutcomes}>
        <li className={styles.versionOutcomeOk}>
          <i><MonitorCheck size={13} /></i>
          <span><b>Online + same version</b> The menu opens.</span>
        </li>
        <li className={styles.versionOutcomeWarn}>
          <i><Wrench size={13} /></i>
          <span><b>Maintenance</b> “Loader is under maintenance.” and the loader closes.</span>
        </li>
        <li className={styles.versionOutcomeUpdate}>
          <i><RefreshCw size={13} /></i>
          <span><b>Online + different version</b> Downloads the latest build with the reseller's branding and replaces the old file.</span>
        </li>
      </ul>
    </div>
    </div>
    </div>,
    document.body,
  );
}

function LoaderOutcomeBar({ uploaded, status, loaderVersion, authVersion, reseller = false }) {
  const formatVer = (value) => (value ? `v${String(value).replace(/^v/i, "")}` : "—");
  const cleanVer = (value) => String(value || "").trim().replace(/^v/i, "").toLowerCase();
  const versionsMatch = Boolean(cleanVer(loaderVersion)) && cleanVer(loaderVersion) === cleanVer(authVersion);
  const outcome = !uploaded
    ? reseller
      ? { tone: "idle", icon: FileBox, title: "No loader uploaded", text: "An administrator has not uploaded a loader yet." }
      : { tone: "idle", icon: FileBox, title: "No loader uploaded", text: "Upload a Loader.exe to see what happens when it starts." }
    : status === "maintenance"
      ? { tone: "warn", icon: Wrench, title: "Loader will show maintenance", text: "Every loader shows “Loader is under maintenance.” and closes automatically." }
      : !loaderVersion || !authVersion
        ? { tone: "idle", icon: CircleAlert, title: "Version unknown", text: "The site could not read both versions yet." }
        : versionsMatch
          ? {
              tone: "ok",
              icon: MonitorCheck,
              title: "Loader will open",
              text: reseller
                ? `Loaders on ${formatVer(authVersion)} open the menu. Older loaders download ${formatVer(authVersion)} with your brand first, then open.`
                : `Loaders on ${formatVer(authVersion)} open the menu. Loaders on other versions download ${formatVer(authVersion)} first, then open.`,
            }
          : { tone: "bad", icon: CircleAlert, title: "Loader will not open", text: `AUTH VERSION is ${formatVer(authVersion)}. The new loader will not download, because no loader with the same version is uploaded yet.` };
  const OutcomeIcon = outcome.icon;
  const outcomeTone = { ok: styles.loaderOutcomeOk, warn: styles.loaderOutcomeWarn, bad: styles.loaderOutcomeBad, idle: "" }[outcome.tone];

  return (
    <div className={`${styles.loaderOutcome} ${outcomeTone}${reseller ? ` ${styles.loaderOutcomeFree}` : ""}`}>
      <i className={styles.loaderOutcomeIcon}><OutcomeIcon size={14} /></i>
      <strong>{outcome.title}</strong>
      <p>{outcome.text}</p>
      {uploaded && loaderVersion && authVersion ? (
        <span className={styles.loaderOutcomeChip}>
          {formatVer(loaderVersion)} {versionsMatch ? "=" : "≠"} {formatVer(authVersion)} · {status === "maintenance" ? "Maintenance" : "Online"}
        </span>
      ) : null}
    </div>
  );
}

function BanFace({ name, avatarUrl, className }) {
  const initials = String(name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  if (avatarUrl) return <img className={className} src={avatarUrl} alt="" />;
  return <span className={className} aria-hidden="true">{initials}</span>;
}

function usePanelClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function usePanelConnection() {
  const [online, setOnline] = useState(true);
  const [latency, setLatency] = useState(null);
  useEffect(() => {
    let cancelled = false;
    function onOnline() {
      setOnline(true);
    }
    function onOffline() {
      setOnline(false);
      setLatency(null);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    async function ping() {
      if (!navigator.onLine) {
        setOnline(false);
        setLatency(null);
        return;
      }
      const start = performance.now();
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (cancelled) return;
        setOnline(res.ok);
        setLatency(res.ok ? Math.max(1, Math.round(performance.now() - start)) : null);
      } catch {
        if (!cancelled) {
          setOnline(false);
          setLatency(null);
        }
      }
    }
    ping();
    const id = window.setInterval(ping, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return { online, latency };
}

function OmniSearch({ value, open, active, results, onChange, onOpen, onClose, onActive, onPick }) {
  const box = useRef(null);
  const input = useRef(null);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        onOpen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  useEffect(() => {
    function onDown(event) {
      if (!open) return;
      if (box.current && !box.current.contains(event.target)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <div className={`${styles.omni}${open ? ` ${styles.omniOpen}` : ""}`} ref={box}>
      <Search size={14} />
      <input
        ref={input}
        value={value}
        placeholder="Search pages, licenses, people…"
        spellCheck={false}
        autoComplete="off"
        onFocus={onOpen}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            input.current?.blur();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (results.length) onActive(Math.min(results.length - 1, active + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (results.length) onActive(Math.max(0, active - 1));
            return;
          }
          if (event.key === "Enter" && results[active]) {
            event.preventDefault();
            onPick(results[active]);
          }
        }}
      />
      <kbd className={styles.omniKbd}>{mac ? "⌘K" : "Ctrl K"}</kbd>
      {open ? (
        <div className={styles.omniMenu} role="listbox">
          {results.length ? results.map((item, index) => {
            const Icon = item.icon || Search;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.omniHit}${index === active ? ` ${styles.omniHitOn}` : ""}`}
                onMouseEnter={() => onActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(item)}
              >
                <i><Icon size={14} /></i>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
              </button>
            );
          }) : (
            <div className={styles.omniEmpty}>Nothing matches “{value.trim()}”.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LoaderAdminScreen({ info, version, blacklist, resellers = [], discordId, file, busy, statusBusy, downloading, light, onDownload, onVersion, onSaveVersion, onStatus, onDiscordId, onFile, onUpload, onAdd, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const uploaded = Boolean(info?.uploaded);
  const status = info?.status === "maintenance" ? "maintenance" : "online";
  const sizeShare = Math.min(100, Math.max(uploaded ? 2 : 0, (Number(info?.fileSize) || 0) / (80 * 1024 * 1024) * 100));
  const details = info?.details || null;
  const embeddedVersion = details?.embeddedVersion || "";
  const authVersion = info?.version || "";
  const formatVer = (value) => (value ? `v${String(value).replace(/^v/i, "")}` : "—");
  const versionLabel = formatVer(embeddedVersion || authVersion);
  const versionDirty = Boolean(version.trim()) && version.trim() !== String(info?.version || "");
  const [copiedHash, setCopiedHash] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [copiedBan, setCopiedBan] = useState("");
  const [banQuery, setBanQuery] = useState("");
  const typedId = discordId.trim();
  const idTyped = Boolean(typedId);
  const alreadyBlocked = blacklist.some((entry) => entry.discordId === typedId);
  const idValid = /^\d{15,22}$/.test(typedId) && !alreadyBlocked;
  const matchedPerson = resellers.find((entry) => entry.discordId === typedId)
    || blacklist.find((entry) => entry.discordId === typedId)
    || null;
  const matchedName = matchedPerson?.username || matchedPerson?.serviceName || "";
  const query = banQuery.trim().toLowerCase();
  const shownBans = query
    ? blacklist.filter((entry) => [entry.username, entry.serviceName, entry.discordId].some((field) => String(field || "").toLowerCase().includes(query)))
    : blacklist;
  const specs = details
    ? [
        { label: "LOADER_VERSION", value: formatVer(embeddedVersion) },
        { label: "AUTH VERSION", value: formatVer(authVersion) },
        { label: "Status", value: status === "online" ? "Online" : "Maintenance" },
        { label: "File name", value: info.fileName || "—" },
        { label: "Size", value: `${formatBytes(details.bytes)} · ${Number(details.bytes).toLocaleString("en-GB")} bytes` },
        { label: "Build date", value: details.builtAt ? formatDate(details.builtAt) : "—" },
        { label: "Uploaded", value: formatDate(info.updatedAt) },
        { label: "Architecture", value: details.architecture || "—" },
        { label: "Subsystem", value: details.subsystem || "—" },
        { label: "Linker", value: details.linker ? `MSVC ${details.linker}` : "—" },
        { label: "Sections", value: details.sections ?? "—" },
      ]
    : [];
  return (
    <>
      <div className={styles.viewHead}>
        <div>
          <h1>Loader</h1>
          <p>Upload the loader, switch it between online and maintenance, and set the version resellers see.</p>
        </div>
      </div>
      <section className={styles.settingsStack}>
        <div className={styles.loaderAdminWidgets}>
          <div className={styles.loaderTile}>
            <div className={styles.loaderTileHead}>
              <span><Tag size={12} /> Version</span>
            </div>
            <div className={styles.loaderVersionPair}>
              <span>LOADER_VERSION</span>
              <strong>{formatVer(embeddedVersion)}</strong>
              <span>AUTH VERSION</span>
              <strong>{formatVer(authVersion)}</strong>
            </div>
          </div>
          <div className={`${styles.loaderTile} ${status === "online" ? styles.loaderTileOk : styles.loaderTileWarn}`}>
            <div className={styles.loaderTileHead}>
              <span><ShieldCheck size={12} /> Status</span>
            </div>
            <strong className={styles.loaderStatus}><i />{status === "online" ? "Online" : "Maintenance"}</strong>
            <p>{info?.statusUpdatedAt ? `Changed ${formatAgo(info.statusUpdatedAt).toLowerCase()}` : "Default status"}</p>
          </div>
          <div className={styles.loaderTile}>
            <div className={styles.loaderTileHead}>
              <span><FileBox size={12} /> File</span>
              <em>{formatBytes(info?.fileSize)}</em>
            </div>
            <strong className={styles.loaderFileName}>{info?.fileName || "—"}</strong>
            <div className={styles.loaderMeter}><i style={{ width: `${sizeShare}%` }} /></div>
          </div>
          <div className={styles.loaderTile}>
            <div className={styles.loaderTileHead}>
              <span><Clock3 size={12} /> Last upload</span>
            </div>
            <strong className={styles.loaderVersion}>{uploaded ? formatAgo(info.updatedAt) : "Never"}</strong>
            <p>{uploaded ? formatDate(info.updatedAt) : "No loader uploaded yet"}</p>
          </div>
        </div>

        <LoaderOutcomeBar uploaded={uploaded} status={status} loaderVersion={embeddedVersion} authVersion={authVersion} />

        <div className={styles.settingsCard}>
          <div className={styles.loaderCardTitle}>
            <span className={styles.loaderIcon}><FileBox size={18} strokeWidth={2} /></span>
            <div>
              <h2>Current loader</h2>
              <p>{uploaded ? "Details read from the file resellers build from." : "Upload a loader to see its details."}</p>
            </div>
          </div>
          {uploaded && details ? (
            <>
              <div className={styles.loaderHash}>
                <span>SHA-256</span>
                <code>{details.sha256}</code>
              <button
                  className={styles.secondary}
                type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(details.sha256);
                    setCopiedHash(true);
                    window.setTimeout(() => setCopiedHash(false), 1200);
                  }}
                >
                  {copiedHash ? <Check size={13} /> : <Copy size={13} />}
                  {copiedHash ? "Copied" : "Copy"}
                </button>
              </div>
              <dl className={styles.loaderSpecs}>
                {specs.map((spec) => (
                  <div key={spec.label}>
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
                <button className={styles.loaderGrab} type="button" onClick={onDownload} disabled={downloading} title="Download the original loader">
                  <i>{downloading ? <Loader2 className={styles.spin} size={14} /> : <Download size={14} />}</i>
                <span>
                    <strong>{downloading ? "Preparing…" : "Download"}</strong>
                    <small>{formatBytes(details.bytes)} · {details.architecture || "exe"}</small>
                </span>
              </button>
              </dl>
            </>
          ) : uploaded ? (
            <div className={styles.empty}>The loader file could not be read on this server.</div>
          ) : (
            <div className={styles.empty}>No loader uploaded yet.</div>
          )}
            </div>

        <div className={styles.loaderAdminGrid}>
          <div className={styles.settingsCard}>
            <div className={styles.loaderCardTitle}>
              <span className={styles.loaderIcon}><Package size={18} strokeWidth={2} /></span>
                  <div>
                <h2>Upload loader</h2>
                <p>Loader.exe built from UNI - Loader, up to 80 MB.</p>
                  </div>
            </div>
            <input ref={onFile.ref} id="loader-file" type="file" accept=".exe,application/octet-stream" onChange={onFile.change} hidden />
            <button
              type="button"
              className={`${styles.loaderDrop} ${dragging ? styles.loaderDropOn : ""} ${file ? styles.loaderDropPicked : ""}`}
              onClick={() => onFile.ref.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                onFile.drop(event.dataTransfer.files?.[0] || null);
              }}
              disabled={busy}
            >
              <HardDrive size={20} />
              <strong>{file ? file.name : "Drop Loader.exe here"}</strong>
              <span>{file ? formatBytes(file.size) : "or click to choose a file"}</span>
            </button>
            <button className={`${styles.primary} ${styles.loaderGenerate}`} type="button" onClick={onUpload} disabled={busy || !file}>
              {busy ? <Loader2 className={styles.spin} size={14} /> : <Download size={14} />}
              Upload loader
            </button>
          </div>

          <div className={styles.settingsCard}>
            <div className={styles.loaderCardTitle}>
              <span className={styles.loaderIcon}><Tag size={18} strokeWidth={2} /></span>
                  <div>
                <h2>Version</h2>
                <p>LOADER_VERSION comes from the exe. AUTH VERSION is what loaders check on launch.</p>
                  </div>
            </div>
            <div className={styles.loaderVersionRows}>
              {helpOpen ? <VersionHelp loaderVersion={embeddedVersion} authVersion={authVersion} light={light} onClose={closeHelp} /> : null}
              {[
                { label: "LOADER_VERSION", value: embeddedVersion },
                { label: "AUTH VERSION", value: authVersion },
              ].map((row) => (
                <div key={row.label} className={styles.loaderVersionShift}>
                  <span>{row.label}</span>
                  <ArrowRight size={12} />
                  <strong>{formatVer(row.value)}</strong>
                  <button
                    type="button"
                    data-version-help
                    className={`${styles.versionHelpButton} ${helpOpen ? styles.versionHelpButtonOn : ""}`}
                    onClick={() => setHelpOpen((open) => !open)}
                    aria-label="How versions work"
                    aria-expanded={helpOpen}
                  >
                    <CircleQuestionMark size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.group}>
              <label htmlFor="loader-version">AUTH VERSION</label>
              <input
                id="loader-version"
                value={version}
                maxLength={31}
                spellCheck={false}
                autoComplete="off"
                placeholder="1.0.0"
                onChange={(event) => onVersion(event.target.value)}
              />
            </div>
            <button className={`${styles.secondary} ${styles.loaderGenerate}`} type="button" onClick={onSaveVersion} disabled={busy || !uploaded || !versionDirty}>
              <Check size={14} />
              Save AUTH VERSION
            </button>
            <p className={styles.loaderVersionNote}>
              Change <code>LOADER_VERSION</code> in <code>framework/headers/version.h</code>, rebuild, and upload. AUTH VERSION is saved here and is the value loaders compare on launch.
            </p>
          </div>

          <div className={styles.settingsCard}>
            <div className={styles.loaderCardTitle}>
              <span className={styles.loaderIcon}><ShieldCheck size={18} strokeWidth={2} /></span>
                  <div>
                <h2>Status</h2>
                <p>Maintenance stops resellers from generating or downloading builds.</p>
                  </div>
                  </div>
            <div className={styles.loaderStatusPick}>
              {[
                { id: "online", label: "Online", hint: "Builds are available" },
                { id: "maintenance", label: "Maintenance", hint: "Builds are paused" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.loaderStatusOption} ${option.id === "online" ? styles.loaderStatusOnline : styles.loaderStatusMaint} ${status === option.id ? styles.loaderStatusOptionOn : ""}`}
                  onClick={() => status !== option.id && onStatus(option.id)}
                  disabled={statusBusy}
                  aria-pressed={status === option.id}
                >
                  <i />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </span>
                  {statusBusy && status !== option.id ? <Loader2 className={styles.spin} size={14} /> : status === option.id ? <Check size={14} /> : null}
                </button>
              ))}
                </div>
          </div>
        </div>
        <div className={styles.settingsCard}>
          <div className={styles.loaderCardTitle}>
            <span className={styles.loaderIcon}><Ban size={18} strokeWidth={2} /></span>
                    <div>
              <h2>Blacklist</h2>
              <p>The reseller and every helper on their team see a blacklist announcement instead of the builder.</p>
                    </div>
            <span className={`${styles.banCount} ${blacklist.length ? styles.banCountOn : ""}`}>
              <strong>{blacklist.length}</strong>
              blocked
            </span>
          </div>

          <form
            className={styles.banForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (idValid && !busy) onAdd();
            }}
          >
            <label htmlFor="loader-blacklist">Discord user ID</label>
            <div className={`${styles.banInput} ${idTyped ? (idValid ? styles.banInputOk : styles.banInputBad) : ""}`}>
              {matchedPerson ? (
                <BanFace name={matchedName} avatarUrl={matchedPerson.avatarUrl} className={styles.banInputFace} />
              ) : (
                <Users size={14} />
              )}
              <input
                id="loader-blacklist"
                value={discordId}
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
                placeholder="123456789012345678"
                onChange={(event) => onDiscordId(event.target.value.replace(/\D/g, ""))}
              />
              <button className={styles.primary} type="submit" disabled={busy || !idValid}>
                {busy ? <Loader2 className={styles.spin} size={14} /> : <Ban size={14} />}
                Blacklist
                    </button>
                  </div>
            <small className={styles.banHint}>
              {!idTyped
                ? "Right-click the reseller in Discord and copy their user ID."
                : alreadyBlocked
                  ? matchedName ? `${matchedName} is already blacklisted.` : "This Discord ID is already blacklisted."
                  : idValid
                    ? matchedName ? `Will blacklist ${matchedName}.` : "Looks like a valid Discord ID."
                    : `Discord IDs are 15–22 digits (${typedId.length} typed).`}
            </small>
          </form>

          {!blacklist.length ? (
            <div className={styles.banEmpty}>
              <ShieldCheck size={22} />
              <strong>Nobody is blacklisted</strong>
              <span>Every reseller and their team can build loaders.</span>
            </div>
          ) : (
            <>
              {blacklist.length > 3 ? (
                <div className={`${styles.group} ${styles.banSearch}`}>
                  <input value={banQuery} onChange={(event) => setBanQuery(event.target.value)} placeholder="Search by name or Discord ID" spellCheck={false} />
                </div>
              ) : null}
              <ul className={styles.banList}>
                {shownBans.map((entry) => {
                  const name = entry.username || entry.serviceName || "Unknown reseller";
                  return (
                    <li key={entry.discordId}>
                      <BanFace name={name} avatarUrl={entry.avatarUrl} className={styles.banAvatar} />
                      <div className={styles.banWho}>
                        <strong>{name}</strong>
                        <span>
                          {entry.serviceName && entry.username ? <em>{entry.serviceName}</em> : null}
                          <i>Team blocked</i>
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.banId}
                        onClick={async () => {
                          await navigator.clipboard.writeText(entry.discordId);
                          setCopiedBan(entry.discordId);
                          window.setTimeout(() => setCopiedBan(""), 1200);
                        }}
                        title="Copy Discord ID"
                      >
                        {copiedBan === entry.discordId ? <Check size={12} /> : <Copy size={12} />}
                        {copiedBan === entry.discordId ? "Copied" : entry.discordId}
                  </button>
                      <span className={styles.banWhen} title={formatDate(entry.createdAt)}>
                        <Clock3 size={12} />
                        {formatAgo(entry.createdAt)}
                      </span>
                      <button className={styles.banRemove} type="button" onClick={() => onRemove(entry.discordId)} disabled={busy} title="Remove from blacklist">
                        <Unlock size={13} />
                        Unblock
                      </button>
                    </li>
                  );
                })}
                {!shownBans.length ? <li className={styles.banNone}>No match for “{banQuery}”.</li> : null}
              </ul>
            </>
                )}
              </div>
      </section>
    </>
  );
}

const LOADER_SWATCHES = ["#E94438", "#3B82F6", "#22C55E", "#A855F7", "#F59E0B", "#06B6D4"];

function easeLoader(value, target, speed, dt) {
  const step = speed * dt;
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

function fitLoaderText(node, max, preferred) {
  if (!node) return;
  node.style.fontSize = `${preferred}px`;
  const width = node.scrollWidth;
  if (width > max + 1 && width > 1) node.style.fontSize = `${Math.max(8, Math.floor(preferred * (max / width)))}px`;
}

function LoaderBootPreview({ primary, secondary, color, logoSrc }) {
  const accent = /^#[0-9A-F]{6}$/.test(color) ? color : "#E94438";
  const frameRef = useRef(null);
  const heroRef = useRef(null);
  const topRef = useRef(null);
  const authMarkRef = useRef(null);
  const [boot, setBoot] = useState({ phase: "load", fade: 1, timer: 0, auth: 0, progress: [0, 0, 0], alpha: [0, 0], width: [0, 0] });

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const state = { phase: "load", mode: "play", pending: "", fade: 1, timer: 0, auth: 0, progress: [0, 0, 0], alpha: [0, 0], width: [0, 0] };
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state.mode === "out") {
        state.fade = Math.max(0, state.fade - 4 * dt);
        if (state.fade === 0) {
          state.phase = state.pending;
          state.mode = "in";
          if (state.phase === "load") {
            state.timer = 0;
            state.progress = [0, 0, 0];
            state.alpha = [0, 0];
            state.width = [0, 0];
          } else {
            state.auth = 0;
          }
        }
      } else if (state.mode === "in") {
        state.fade = Math.min(1, state.fade + 4 * dt);
        if (state.fade === 1) state.mode = "play";
      } else if (state.phase === "auth") {
        state.auth += dt;
        if (state.auth >= 3) {
          state.mode = "out";
          state.pending = "load";
        }
      } else {
        state.timer += dt;
        if (state.timer >= 9.9) {
          state.mode = "out";
          state.pending = "auth";
        }
        const timer = state.timer;
        state.progress[0] = easeLoader(state.progress[0], 1, 1, dt);
        state.progress[1] = easeLoader(state.progress[1], timer >= 4.5 ? 1 : 0, 1, dt);
        state.progress[2] = easeLoader(state.progress[2], timer >= 9 ? 1 : 0, 1, dt);
        state.alpha[0] = easeLoader(state.alpha[0], timer >= 1 ? 1 : 0, 8, dt);
        state.alpha[1] = easeLoader(state.alpha[1], timer >= 5.5 ? 1 : 0, 8, dt);
        state.width[0] = easeLoader(state.width[0], timer >= 1 ? 214 : 0, 60, dt);
        state.width[1] = easeLoader(state.width[1], timer >= 5.5 ? 214 : 0, 60, dt);
      }
      setBoot({
        phase: state.phase,
        fade: state.fade,
        timer: state.timer,
        auth: state.auth,
        progress: [...state.progress],
        alpha: [...state.alpha],
        width: [...state.width],
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const unit = frameRef.current ? frameRef.current.clientWidth / 875 : 1;
    fitLoaderText(heroRef.current, 592 * unit, 105 * unit);
    fitLoaderText(authMarkRef.current, 397.5 * unit, 90 * unit);
    if (topRef.current) fitLoaderText(topRef.current, topRef.current.clientWidth, 18 * unit);
  }, [primary, secondary, boot.phase]);

  const status = boot.timer >= 5 ? "CHECK EXTERNAL SYSTEM DRIVERS " : "INSTALL OUR FILES, DO NOT CLOSE THE APPLICATION ";
  const steps = [
    { icon: "E", size: 11, x: 0 },
    { icon: "F", size: 11, x: 274 },
    { icon: "G", size: 13, x: 548 },
  ];

  return (
    <div ref={frameRef} className={styles.bootFrame} style={{ "--loader-accent": accent }} aria-hidden="true">
      <div className={styles.bootMenu}>
        <div className={styles.bootTop}>
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <i />
          <strong ref={topRef}>
            <em style={{ color: accent }}>{primary}</em>
            {secondary}
          </strong>
          <b>D</b>
        </div>
        <div className={styles.bootBody} style={{ opacity: boot.fade }}>
        {boot.phase === "load" ? <div className={styles.bootShade} /> : null}
        {boot.phase === "auth" ? (
          <>
            <div className={styles.authBar}>
              <span className={styles.authBarMark}>
                <img src={logoSrc || "/images/loader-mark.png"} alt="" />
              </span>
              <div className={styles.authRail}>
                <i className={styles.authRailLine} style={{ top: "calc(35 * var(--u))" }} />
                <i className={styles.authRailLine} style={{ top: "calc(125 * var(--u))" }} />
                <span className={styles.authRailNode} style={{ top: 0 }}>
                  <svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="none" stroke="#212232" strokeWidth="2" /></svg>
                  <em style={{ fontSize: "calc(9 * var(--u))" }}>H</em>
                </span>
                <span className={styles.authRailNode} style={{ top: "calc(90 * var(--u))" }}>
                  <svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="none" stroke="#212232" strokeWidth="2" /></svg>
                  <em style={{ fontSize: "calc(10 * var(--u))" }}>G</em>
                </span>
                <span className={styles.authRailNode} style={{ top: "calc(180 * var(--u))" }}>
                  <svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="none" stroke="#212232" strokeWidth="2" /></svg>
                  <em style={{ fontSize: "calc(10 * var(--u))" }}>I</em>
                </span>
              </div>
            </div>
            <div className={styles.authBrand}>
              <strong ref={authMarkRef}>
                <em>{primary}</em>
                {secondary}
              </strong>
              <b>AUTHORIZATION</b>
            </div>
            <div className={styles.authForm}>
              <div className={styles.authField}>
                <i className={styles.authUser}>
                  <svg viewBox="0 0 40 40"><circle cx="20" cy="17" r="4" fill="#5c5d73" /></svg>
                  <em>N</em>
                </i>
                <span>Username</span>
              </div>
              <div className={styles.authField}>
                <i className={styles.authLock}>
                  <em>J</em>
                  <em>K</em>
                </i>
                <span>Passowrd</span>
                <b className={styles.authEye}>
                  <em>L</em>
                  <em>M</em>
                </b>
              </div>
              <div className={styles.authCheck}><i /><span>Remember me</span></div>
              <div className={styles.authSign}>SIGN</div>
            </div>
            <div className={styles.authLang}>EN</div>
            <div className={styles.authVersion}>V. 0.05</div>
            <div className={styles.authPromo}>
              <strong>Start Dominating</strong>
              <strong>Every Game You Play</strong>
              <i />
              <span>REMAPPING, MACROS, RECOIL CONTROL &amp; CUSTOM CROSSHAIRS — ALL IN ONE PLATFORM.</span>
            </div>
          </>
            ) : null}
        {boot.phase === "load" ? (
        <div className={styles.bootHero}>
          <strong ref={heroRef}>
            <em style={{ color: accent }}>{primary}</em>
            {secondary}
          </strong>
        </div>
        ) : null}
        {boot.phase === "load" ? (
        <div className={styles.bootSteps}>
          <span className={styles.bootTrack} style={{ left: "calc(50 * var(--u))" }} />
          <span className={styles.bootFill} style={{ left: "calc(50 * var(--u))", width: `calc(${boot.width[0]} * var(--u))`, background: accent, opacity: boot.alpha[0] }} />
          <span className={styles.bootTrack} style={{ left: "calc(324 * var(--u))" }} />
          <span className={styles.bootFill} style={{ left: "calc(324 * var(--u))", width: `calc(${boot.width[1]} * var(--u))`, background: accent, opacity: boot.alpha[1] }} />
          {steps.map((step, index) => (
            <span key={step.icon} className={styles.bootNode} style={{ left: `calc(${step.x} * var(--u))` }}>
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="19" fill="none" stroke="#212232" strokeWidth="3" />
                <path d="M 1 20 A 19 19 0 0 0 39 20" fill="none" stroke={accent} strokeWidth="3" pathLength="1" strokeDasharray={`${boot.progress[index]} 1`} />
                <path d="M 1 20 A 19 19 0 0 1 39 20" fill="none" stroke={accent} strokeWidth="3" pathLength="1" strokeDasharray={`${boot.progress[index]} 1`} />
              </svg>
              <em style={{ fontSize: `calc(${step.size} * var(--u))` }}>{step.icon}</em>
            </span>
          ))}
        </div>
        ) : null}
        {boot.phase === "load" ? (
        <p className={styles.bootStatus}>
          <span>{status}</span>
          <b>{`( ${Math.trunc(boot.timer * 10)}% )`}</b>
        </p>
        ) : null}
        </div>
        <div className={styles.bootBorder} />
      </div>
    </div>
  );
}

const STATUS_RANGES = [
  { key: "24h", label: "24H", ms: 86400000, slots: 48, axis: "24h ago" },
  { key: "7d", label: "7D", ms: 7 * 86400000, slots: 56, axis: "7 days ago" },
  { key: "30d", label: "30D", ms: 30 * 86400000, slots: 60, axis: "30 days ago" },
];

function formatSpan(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

function StatusTimeline({ history, status }) {
  const [rangeKey, setRangeKey] = useState("24h");
  const [hovered, setHovered] = useState(-1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const range = STATUS_RANGES.find((entry) => entry.key === rangeKey) || STATUS_RANGES[0];
  const start = now - range.ms;
  const events = (history || [])
    .map((entry) => ({ status: entry.status, at: new Date(entry.at).getTime() }))
    .filter((entry) => Number.isFinite(entry.at) && entry.at <= now)
    .sort((a, b) => a.at - b.at);

  const segments = [];
  let state = events.length ? null : status;
  let cursor = start;
  for (const event of events) {
    if (event.at <= start) {
      state = event.status;
      continue;
    }
    if (event.status === state) continue;
    segments.push({ status: state || "none", from: cursor, to: event.at });
    state = event.status;
    cursor = event.at;
  }
  segments.push({ status: state || "none", from: cursor, to: now });
  const visible = segments.filter((segment) => segment.to > segment.from);

  const known = visible.filter((segment) => segment.status !== "none");
  const knownMs = known.reduce((sum, segment) => sum + (segment.to - segment.from), 0);
  const onlineMs = known.filter((segment) => segment.status === "online").reduce((sum, segment) => sum + (segment.to - segment.from), 0);
  const uptime = knownMs ? (onlineMs / knownMs) * 100 : null;
  const changes = events.filter((event) => event.at > start).length;
  const slotMs = range.ms / range.slots;
  const bars = Array.from({ length: range.slots }, (_, index) => {
    const from = start + index * slotMs;
    const to = from + slotMs;
    const spent = { online: 0, maintenance: 0, none: 0 };
    for (const segment of visible) {
      const overlap = Math.min(to, segment.to) - Math.max(from, segment.from);
      if (overlap > 0) spent[segment.status] += overlap;
    }
    const status = spent.maintenance > 0 ? "maintenance" : spent.online > 0 ? "online" : "none";
    return { from, to, status, spent };
  });
  const tip = hovered >= 0 ? bars[hovered] : null;
  const tipLeft = tip ? Math.min(85, Math.max(15, ((hovered + 0.5) / range.slots) * 100)) : 0;
  const label = { online: "Online", maintenance: "Maintenance", none: "No data" };
  const segmentClass = { online: styles.timelineOnline, maintenance: styles.timelineMaint, none: styles.timelineNone };

  return (
    <div className={styles.statusTimeline}>
      <div className={styles.statusTimelineHead}>
        <span>
          Uptime <b>{uptime === null ? "—" : `${uptime >= 99.95 ? "100" : uptime.toFixed(1)}%`}</b>
          <em>{changes} change{changes === 1 ? "" : "s"}</em>
        </span>
        <div className={styles.statusRanges} role="group" aria-label="Time range">
          {STATUS_RANGES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={entry.key === range.key ? styles.statusRangeOn : ""}
              onClick={() => {
                setRangeKey(entry.key);
                setHovered(-1);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.statusTimelineBar} onMouseLeave={() => setHovered(-1)}>
        {bars.map((bar, index) => (
          <i
            key={index}
            className={`${segmentClass[bar.status]}${index === hovered ? ` ${styles.timelineHover}` : ""}`}
            onMouseEnter={() => setHovered(index)}
          />
        ))}
        {tip ? (
          <div className={styles.statusTip} style={{ left: `${tipLeft}%` }}>
            <strong className={segmentClass[tip.status]}>{label[tip.status]}</strong>
            <span>
              {formatDate(new Date(tip.from).toISOString())}
              {" → "}
              {hovered === range.slots - 1 ? "Now" : formatDate(new Date(tip.to).toISOString())}
            </span>
            {tip.spent.online ? <b className={styles.statusTipOnline}>Online {formatSpan(tip.spent.online)}</b> : null}
            {tip.spent.maintenance ? <b className={styles.statusTipMaint}>Maintenance {formatSpan(tip.spent.maintenance)}</b> : null}
            {!tip.spent.online && !tip.spent.maintenance ? <b>No data</b> : null}
          </div>
        ) : null}
      </div>
      <div className={styles.statusTimelineAxis}>
        <span>{range.axis}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function formatVersionLabel(value) {
  return value ? `v${String(value).replace(/^v/i, "")}` : "—";
}

function LoaderResellerScreen({ blacklisted, current, licenses, primary, secondary, color, logoSrc, savedLogo, busy, downloading, ready, light, onPrimary, onSecondary, onColor, onLogo, onLogoClear, onGenerate, onDownload }) {
  const [now, setNow] = useState(() => Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceAccepted, setReplaceAccepted] = useState(false);
  const jobLock = useRef(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const logoInputRef = useRef(null);
  const lastBuild = new Date(current?.generatedAt || "").getTime();
  const nextBuild = Number.isFinite(lastBuild) && lastBuild > 0 ? lastBuild + LOADER_BUILD_COOLDOWN_MS : 0;
  const waitMs = nextBuild > now ? nextBuild - now : 0;

  useEffect(() => {
    setNow(Date.now());
  }, [current?.generatedAt]);

  useEffect(() => {
    if (!waitMs) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [waitMs]);

  if (blacklisted) {
    return (
      <section className={styles.loaderBan}>
        <Ban size={28} />
        <h1>You have been blacklisted</h1>
        <p>This reseller account and its team cannot generate a loader. Contact an administrator if you think this is a mistake.</p>
          </section>
    );
  }

  const safeColor = /^#[0-9A-F]{6}$/.test(color) ? color : "#E94438";
  const savedColor = /^#[0-9A-F]{6}$/i.test(current?.color || "") ? current.color.toUpperCase() : "#E94438";
  const hasBuild = Boolean(current?.hasBuild && current?.primary);
  const uploaded = Boolean(current?.uploaded);
  const maintenance = current?.status === "maintenance";
  const locked = Boolean(job) || busy || downloading;

  async function startGenerate() {
    if (jobLock.current || locked || waitMs || !ready || maintenance || !primary.trim()) return;
    jobLock.current = true;
    setJob({ phase: "generate", value: 0, total: 100 });
    try {
      const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const downloadMs = reduce ? 700 : 3600;
      let pack = null;
      let failed = false;
      const pending = Promise.resolve(onGenerate())
        .then((result) => {
          pack = result && result.blob ? result : null;
          if (!pack) failed = true;
        })
        .catch(() => {
          failed = true;
        });
      let last = 0;
      if (reduce) {
        const started = performance.now();
        while (!failed && last < 94) {
          const time = await nextFrame();
          last = Math.min(94, ((time - started) / 1400) * 94);
          setJob({ phase: "generate", value: last, total: 100 });
          if (pack && last >= 90) break;
        }
      } else {
        last = await playGenerateMotion(setJob, () => failed);
        while (!failed && !pack) await nextFrame();
      }
      await pending;
      if (failed || !pack?.blob) return;
      if (last < 99.95) {
        if (!reduce) await new Promise((resolve) => window.setTimeout(resolve, randRange(160, 420)));
        const finishAt = performance.now();
        const finishMs = reduce ? 280 : randRange(220, 480);
        const from = last;
        while (true) {
          const time = await nextFrame();
          const u = Math.min(1, (time - finishAt) / finishMs);
          last = from + (100 - from) * easeBurst(u);
          setJob({ phase: "generate", value: last, total: 100 });
          if (u >= 1) break;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, reduce ? 40 : 180));
      const total = pack.blob.size || 1;
      const downloadAt = performance.now();
      while (true) {
        const time = await nextFrame();
        const u = Math.min(1, (time - downloadAt) / downloadMs);
        const loaded = (1 - Math.pow(1 - u, 2.7)) * total;
        setJob({ phase: "download", value: loaded, total });
        if (u >= 1) break;
      }
      saveBlobFile(pack.blob, pack.filename);
      playSound("success");
      await new Promise((resolve) => window.setTimeout(resolve, reduce ? 80 : 240));
    } finally {
      setJob(null);
      jobLock.current = false;
    }
  }
  const sizeShare = Math.min(100, Math.max(uploaded ? 2 : 0, (Number(current?.fileSize) || 0) / (80 * 1024 * 1024) * 100));
  const reach = (() => {
    const list = Array.isArray(licenses) ? licenses : [];
    const nowMs = Date.now();
    const counts = { active: 0, waiting: 0, expired: 0, banned: 0 };
    for (const license of list) {
      const end = license.expires_at ? new Date(license.expires_at).getTime() : NaN;
      const ended = license.activated_at && Number.isFinite(end) && end <= nowMs;
      if (license.status === "Banned") counts.banned += 1;
      else if (license.status === "Expired" || ended) counts.expired += 1;
      else if (license.activated_at) counts.active += 1;
      else counts.waiting += 1;
    }
    return {
      total: list.length,
      active: counts.active,
      expired: counts.expired,
      banned: counts.banned,
      segments: [
        { key: "active", label: "Active", count: counts.active, className: styles.reachActive },
        { key: "waiting", label: "Not activated", count: counts.waiting, className: styles.reachWaiting },
        { key: "expired", label: "Expired", count: counts.expired, className: styles.reachExpired },
        { key: "banned", label: "Banned", count: counts.banned, className: styles.reachBanned },
      ],
    };
  })();
  return (
    <>
      <div className={styles.viewHead}>
        <div>
          <h1>Loader</h1>
          <p>Your saved build stays on the left. The studio on the right only changes it after you generate.</p>
        </div>
      </div>
      <LoaderAboutCard />
      <div className={styles.loaderSplit}>
        <section className={styles.settingsCard}>
          <div className={styles.loaderCardTitle}>
            <span className={styles.loaderIcon}><Package size={18} strokeWidth={2} /></span>
            <div>
              <h2>Loader</h2>
              <p>{current?.uploaded ? "Ready for this account." : "An administrator has not uploaded a loader yet."}</p>
            </div>
          </div>
          <div className={styles.loaderWidgets} style={{ "--saved-accent": savedColor }}>
            <div className={`${styles.loaderTile} ${styles.loaderBrandTile} ${hasBuild ? "" : styles.loaderTileEmpty}`}>
              <div className={styles.loaderTileHead}>
                <span><Palette size={12} /> Saved brand</span>
                {hasBuild ? <em className={styles.loaderHex}><i />{savedColor}</em> : null}
              </div>
              {hasBuild ? (
                <strong className={styles.loaderBrandMark}>
                  <img className={styles.loaderBrandLogo} src={savedLogo || "/images/loader-mark.png"} alt="" />
                  <b><span>{current.primary}</span>{current.secondary}</b>
                </strong>
              ) : (
                <strong className={styles.loaderBrandMark}>No build yet</strong>
              )}
              <p>{hasBuild ? "Stamped into every download of your current loader." : "Generate a build on the right to save your brand."}</p>
            </div>
            <div className={`${styles.loaderTile} ${!uploaded ? styles.loaderTileBad : maintenance ? styles.loaderTileWarn : styles.loaderTileOk}`}>
              <div className={styles.loaderTileHead}>
                <span><ShieldCheck size={12} /> Status</span>
              </div>
              <strong className={styles.loaderStatus}><i />{!uploaded ? "Missing" : maintenance ? "Maintenance" : "Online"}</strong>
              <p>
                {!uploaded
                  ? "Waiting for an admin upload."
                  : current?.statusUpdatedAt
                    ? `${maintenance ? "In maintenance" : "Online"} for ${formatSpan(Date.now() - new Date(current.statusUpdatedAt).getTime())}`
                    : maintenance ? "Builds are paused for now." : "Base loader is ready."}
              </p>
              <StatusTimeline history={current?.statusHistory} status={maintenance ? "maintenance" : "online"} />
            </div>
            <div className={styles.loaderTile}>
              <div className={styles.loaderTileHead}>
                <span><Tag size={12} /> Version</span>
              </div>
              <div className={styles.versionStack}>
                <div className={styles.versionStackRow}>
                  <i><Code size={12} /></i>
                  <span>LOADER_VERSION</span>
                  <strong>{formatVersionLabel(current?.latestVersion)}</strong>
                </div>
                <div className={styles.versionStackRow}>
                  <i><Server size={12} /></i>
                  <span>AUTH VERSION</span>
                  <strong>{formatVersionLabel(current?.version)}</strong>
                </div>
              </div>
              <button type="button" className={styles.versionStackHelp} onClick={() => setHelpOpen(true)}>
                <CircleQuestionMark size={13} />
                How does it work?
              </button>
              {helpOpen ? <VersionHelp reseller loaderVersion={current?.latestVersion || ""} authVersion={current?.version || ""} light={light} onClose={closeHelp} /> : null}
            </div>
            <LoaderOutcomeBar reseller uploaded={uploaded} status={current?.status} loaderVersion={current?.latestVersion} authVersion={current?.version} />
            <div className={`${styles.loaderTile} ${styles.loaderTileWide}`}>
              <div className={styles.loaderTileHead}>
                <span><FileBox size={12} /> File</span>
                <em><HardDrive size={12} /> {formatBytes(current?.fileSize)}</em>
              </div>
              <strong className={styles.loaderFileName}>{current?.fileName || "—"}</strong>
              <div className={styles.loaderMeter}><i style={{ width: `${sizeShare}%` }} /></div>
              <p>{uploaded ? `${sizeShare.toFixed(1)}% of the 80 MB limit` : "No file uploaded"}</p>
            </div>
            <div className={`${styles.loaderTile} ${styles.loaderTileWide}`}>
              <div className={styles.loaderTileHead}>
                <span><Users size={12} /> Your customers</span>
              </div>
              <div className={styles.reachStats}>
                <div>
                  <strong>{reach.total}</strong>
                  <span>Licenses</span>
                </div>
                <div>
                  <strong>{reach.active}</strong>
                  <span>Active now</span>
                </div>
                <div>
                  <strong>{reach.expired}</strong>
                  <span>Expired</span>
                </div>
                <div>
                  <strong>{reach.banned}</strong>
                  <span>Banned</span>
                </div>
              </div>
              <div className={styles.reachBar} aria-hidden="true">
                {reach.segments.map((segment) =>
                  segment.count ? <i key={segment.key} className={segment.className} style={{ flexGrow: segment.count }} /> : null
                )}
              </div>
              <ul className={styles.reachLegend}>
                {reach.segments.map((segment) => (
                  <li key={segment.key}>
                    <i className={segment.className} />
                    {segment.label}
                    <b>{segment.count}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button className={`${styles.primary} ${styles.loaderGenerate}`} type="button" onClick={onDownload} disabled={!ready || locked || maintenance || !current?.hasBuild || !current?.uploaded}>
            {downloading ? <Loader2 className={styles.spin} size={18} /> : <Download size={14} />}
            {downloading ? null : "Download current loader"}
          </button>
        </section>
        <section className={styles.settingsCard}>
          <div className={styles.loaderCardTitle}>
            <span className={styles.loaderIcon}><Sparkles size={18} strokeWidth={2} /></span>
            <div>
              <h2>New build</h2>
              <p>Primary takes the color. Secondary stays white. The logo is the mark in the sidebar.</p>
            </div>
          </div>
          <LoaderBootPreview primary={primary} secondary={secondary} color={safeColor} logoSrc={logoSrc} />
          <div className={styles.row}>
            <div className={styles.group}>
              <label htmlFor="loader-primary">Primary</label>
              <input
                id="loader-primary"
                value={primary}
                maxLength={23}
                spellCheck={false}
                autoComplete="off"
                placeholder="kylo"
                disabled={locked}
                onChange={(event) => onPrimary(event.target.value)}
              />
            </div>
            <div className={styles.group}>
              <label htmlFor="loader-secondary">Secondary</label>
              <input
                id="loader-secondary"
                value={secondary}
                maxLength={23}
                spellCheck={false}
                autoComplete="off"
                placeholder=".gg"
                disabled={locked}
                onChange={(event) => onSecondary(event.target.value)}
              />
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.loaderFieldLabel} htmlFor="loader-color"><Palette size={13} /> Primary color</label>
            <div className={styles.loaderColorBar}>
              <div className={styles.colorRow}>
                <input id="loader-color" type="color" value={safeColor} disabled={locked} onChange={(event) => onColor(event.target.value.toUpperCase())} />
                <input
                  aria-label="Hex color"
                  value={color}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={locked}
                  onChange={(event) => {
                    const next = event.target.value.toUpperCase();
                    if (next === "" || next === "#" || /^#[0-9A-F]{0,6}$/.test(next)) onColor(next);
                  }}
                />
              </div>
              <i className={styles.loaderColorSplit} />
              <div className={styles.loaderPalette}>
                {LOADER_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={`${styles.loaderDot} ${safeColor === swatch ? styles.loaderDotOn : ""}`}
                    style={{ background: swatch }}
                    aria-label={swatch}
                    onClick={() => onColor(swatch)}
                    disabled={locked}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.group}>
            <label className={styles.loaderFieldLabel}><ImageIcon size={13} /> Logo</label>
            <div className={styles.loaderLogoRow}>
              <div className={styles.loaderLogoSlot}>
                <img src={logoSrc || "/images/loader-mark.png"} alt="" />
              </div>
              <div className={styles.loaderLogoCopy}>
                <div className={styles.loaderLogoActions}>
                  <button className={styles.secondary} type="button" onClick={() => logoInputRef.current?.click()} disabled={locked}>
                    Choose logo
                  </button>
                  <button className={styles.ghost} type="button" onClick={onLogoClear} disabled={locked}>
                    Script Engine logo
                  </button>
                </div>
                <p>Recommended 256×256. PNG, WEBP, or JPEG, up to 4 MB. A square file with a transparent background fits best. Every logo is scaled into the same sidebar slot on every loader page.</p>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                event.target.value = "";
                if (file) onLogo(file);
              }}
            />
          </div>
          {job ? (
            <LoaderJobBar job={job} />
          ) : (
            <button
              className={`${styles.primary} ${styles.loaderGenerate}`}
              type="button"
              onClick={() => {
                if (hasBuild) {
                  setReplaceAccepted(false);
                  setReplaceOpen(true);
                  return;
                }
                startGenerate();
              }}
              disabled={!ready || locked || maintenance || Boolean(waitMs) || !primary.trim()}
            >
              {waitMs ? <Clock3 size={14} /> : <Sparkles size={14} />}
              {waitMs ? `Next build in ${formatWait(waitMs)}` : "Generate custom build"}
            </button>
          )}
          {waitMs ? (
            <div className={styles.loaderCooldown} role="status">
              <Clock3 size={14} />
              <span>The next loader can be generated in {formatWait(waitMs)}.</span>
            </div>
          ) : null}
        </section>
      </div>
      {replaceOpen ? createPortal(
        <div className={`${styles.versionHelpTheme}${light ? ` ${styles.themeLight}` : ""}`}>
          <div className={styles.versionHelpOverlay} onMouseDown={(event) => event.target === event.currentTarget && setReplaceOpen(false)}>
            <div className={styles.loaderReplace} role="dialog" aria-modal="true" aria-labelledby="loader-replace-title">
              <h2 id="loader-replace-title"><CircleAlert size={16} /> This replaces the active loader</h2>
              <p>
                Generating a new loader makes the previous one inactive. Only one rebranded loader can be active.
                Opening the old loader shows <b>Loader is updated, contact seller!</b>
              </p>
              <label className={`${styles.checkRow} ${styles.loaderReplaceCheck}${replaceAccepted ? ` ${styles.checkRowOn}` : ""}`}>
                <input type="checkbox" checked={replaceAccepted} onChange={(event) => setReplaceAccepted(event.target.checked)} />
                <span className={styles.checkBox}>{replaceAccepted ? <Check size={13} strokeWidth={2.5} /> : null}</span>
                I understand the previous loader will stop working
              </label>
              <div className={styles.loaderReplaceActions}>
                <button className={styles.ghost} type="button" onClick={() => setReplaceOpen(false)}>Cancel</button>
                <button
                  className={styles.primary}
                  type="button"
                  disabled={!replaceAccepted}
                  onClick={() => {
                    setReplaceOpen(false);
                    startGenerate();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function QuickLinksView({ reseller, isHelper, showLicenses, showTeam, onOpen }) {
  const items = [
    { view: "applications", icon: LayoutGrid, title: "Applications", text: reseller ? "Products you are allowed to sell." : "Name, version, and status of each product." },
    showLicenses ? { view: "licenses", icon: KeyRound, title: "Licenses", text: reseller ? "Buy keys with your balance." : "Generate and manage keys." } : null,
    { view: "updates", icon: Bell, title: "Updates", text: "Announcements and change notes." },
    reseller
      ? { view: "deposit", icon: Wallet, title: "Deposit", text: "Top up the balance used for licenses." }
      : { view: "resellers", icon: Users, title: "Resellers", text: "Accounts, balances, and assigned apps." },
    reseller ? { view: "transactions", icon: ArrowLeftRight, title: "Transactions", text: "Deposits and license purchases." } : null,
    showTeam ? { view: "team", icon: Users, title: "Team", text: "Helpers who can sign in to this panel." } : null,
    isHelper ? null : { view: "loader", icon: Download, title: "Loader", text: reseller ? "Brand and download your build." : "Upload, version, and blacklist." },
    { view: "faq", icon: HelpCircle, title: "FAQ", text: "Short answers for this panel." },
    { view: "settings", icon: Settings, title: "Settings", text: "Theme, sound, and account." },
    { href: "https://scriptengine.gg/", icon: Globe, title: "Website", text: "Open scriptengine.gg." },
  ].filter(Boolean);

  return (
    <div className={styles.qlView}>
      <header className={styles.qlHero}>
        <span className={styles.qlBadge}><Link2 size={13} /> Shortcuts</span>
        <h1>Quick Links</h1>
        <p>Jump to panel tools and the public site without hunting through the sidebar.</p>
      </header>
      <div className={styles.qlGrid}>
        {items.map((item) => {
          const Icon = item.icon;
          const body = (
            <>
              <span className={styles.qlIcon}><Icon size={18} /></span>
              <span className={styles.qlCopy}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </span>
              <ArrowRight size={15} className={styles.qlArrow} />
            </>
          );
          if (item.href) {
            return (
              <a key={item.title} className={styles.qlCard} href={item.href} target="_blank" rel="noopener noreferrer">
                {body}
              </a>
            );
          }
          return (
            <button key={item.title} type="button" className={styles.qlCard} onClick={() => onOpen(item.view)}>
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FaqLink({ view, onOpen, children }) {
  return (
    <button type="button" className={styles.faqInline} onClick={() => onOpen(view)}>
      {children}
    </button>
  );
}

function FaqView({ reseller, onOpen }) {
  const [openIndex, setOpenIndex] = useState(0);
  const items = reseller
    ? [
        {
          tag: "Licenses",
          icon: KeyRound,
          q: "How do I buy a license?",
          a: <>Open <FaqLink view="licenses" onOpen={onOpen}>Licenses</FaqLink> and use <strong>Buy</strong>. Pick an application, a variant, and a quantity. The cost is taken from your balance.</>,
        },
        {
          tag: "Status",
          icon: ShieldCheck,
          q: "What do the license statuses mean?",
          a: <><strong>Not activated</strong> has not been used yet. <strong>Active</strong> is running. <strong>Banned</strong> is blocked. <strong>Expired</strong> has run out of time.</>,
        },
        {
          tag: "Deposit",
          icon: Wallet,
          q: "Where does my balance come from?",
          a: <>Top-ups live on <FaqLink view="deposit" onOpen={onOpen}>Deposit</FaqLink>. History of credits and purchases is on <FaqLink view="transactions" onOpen={onOpen}>Transactions</FaqLink>.</>,
        },
        {
          tag: "Team",
          icon: Users,
          q: "What can a helper do?",
          a: <>Helpers sign in with Discord and only see the applications you assign. Permissions cover generating keys, resetting HWID, and banning. They cannot open <strong>Loader</strong> or manage the team.</>,
        },
        {
          tag: "Loader",
          icon: Download,
          q: "Who can download the loader?",
          a: <>The reseller builds and downloads it from <FaqLink view="loader" onOpen={onOpen}>Loader</FaqLink>. Helpers do not see that page.</>,
        },
        {
          tag: "Updates",
          icon: Bell,
          q: "Where are announcements?",
          a: <><FaqLink view="updates" onOpen={onOpen}>Updates</FaqLink> lists new messages. A red dot on the sidebar means something you have not opened yet.</>,
        },
      ]
    : [
        {
          tag: "Licenses",
          icon: KeyRound,
          q: "How do I generate licenses?",
          a: <>Open <FaqLink view="licenses" onOpen={onOpen}>Licenses</FaqLink> and use <strong>Generate</strong>. Keys follow the pattern saved in <FaqLink view="settings" onOpen={onOpen}>Settings</FaqLink>.</>,
        },
        {
          tag: "Format",
          icon: Sparkles,
          q: "What do the license tokens mean?",
          a: <><strong>*</strong> is a letter or digit, <strong>?</strong> a letter, <strong>#</strong> a digit, <strong>@</strong> hex, <strong>~</strong> skips lookalike characters, and <strong>$</strong> is a checksum of the key so far. Typed letters stay as written.</>,
        },
        {
          tag: "Resellers",
          icon: Users,
          q: "Where are reseller purchases?",
          a: <>Your generated keys stay on <FaqLink view="licenses" onOpen={onOpen}>Licenses</FaqLink>. Keys a reseller bought are listed on that reseller from <FaqLink view="resellers" onOpen={onOpen}>Resellers</FaqLink>.</>,
        },
        {
          tag: "Loader",
          icon: Download,
          q: "What does Loader control?",
          a: <><FaqLink view="loader" onOpen={onOpen}>Loader</FaqLink> is the file resellers brand, plus version and the Discord blacklist. A blacklisted reseller cannot build or download.</>,
        },
        {
          tag: "Updates",
          icon: Bell,
          q: "Can I edit an update?",
          a: <>Yes. On <FaqLink view="updates" onOpen={onOpen}>Updates</FaqLink> use the pencil. The original date stays. Custom affects can have their own icon.</>,
        },
        {
          tag: "Status",
          icon: ShieldCheck,
          q: "What do the license statuses mean?",
          a: <><strong>Not activated</strong> is unused. <strong>Active</strong> is in use. <strong>Banned</strong> is blocked. <strong>Expired</strong> has finished.</>,
        },
      ];

  return (
    <div className={styles.faqView}>
      <header className={styles.faqHero}>
        <span className={styles.qlBadge}><HelpCircle size={13} /> Help center</span>
        <h1>Frequently asked questions</h1>
        <p>Short answers for this panel. Open a question to read the rest.</p>
      </header>
      <div className={styles.faqList}>
        {items.map((item, index) => {
          const open = openIndex === index;
          const Icon = item.icon;
          return (
            <article key={item.q} className={`${styles.faqItem}${open ? ` ${styles.faqItemOpen}` : ""}`}>
              <button type="button" className={styles.faqQuestion} aria-expanded={open} onClick={() => setOpenIndex(open ? -1 : index)}>
                <span className={styles.faqQuestionMain}>
                  <span className={styles.faqIcon}><Icon size={16} /></span>
                  <span className={styles.faqCopy}>
                    <span className={styles.faqTag}>{item.tag}</span>
                    <span className={styles.faqText}>{item.q}</span>
                  </span>
                </span>
                <span className={styles.faqChevron}><ChevronDown size={16} /></span>
              </button>
              <div className={`${styles.faqPanel}${open ? ` ${styles.faqPanelOpen}` : ""}`}>
                <div className={styles.faqAnswer}>{item.a}</div>
              </div>
            </article>
          );
        })}
      </div>
      <aside className={styles.faqSupport}>
        <div>
          <strong>Need the public site?</strong>
          <span>Product pages and the storefront live on scriptengine.gg.</span>
        </div>
        <a className={styles.primary} href="https://scriptengine.gg/" target="_blank" rel="noopener noreferrer">
          <Globe size={14} />
          Open website
        </a>
      </aside>
    </div>
  );
}

const COMPAT_DOWNLOADS = [
  { href: "/sdk/se_auth.h", name: "se_auth.h", label: "Header", ext: "H", tone: "h" },
  { href: "/sdk/se_auth.cpp", name: "se_auth.cpp", label: "Source", ext: "CPP", tone: "c" },
  { href: "/sdk/example.cpp", name: "example.cpp", label: "Start here", ext: "EX", tone: "e" },
];

const COMPAT_SHEETS = {
  call: {
    icon: Pencil,
    title: "example.cpp",
    lines: [
      [["fn", "se_authorize"], ["id", "("]],
      [["id", "    L"], ["ed", "\"your-panel-host\""], ["id", ","]],
      [["id", "    key, hwid,"]],
      [["id", "    "], ["ed", "\"Aim Assist\""], ["id", ");"]],
    ],
    notes: [
      { mark: "1", title: "Host", value: "your-panel-host", text: "No https://" },
      { mark: "2", title: "Name", value: "Aim Assist", text: "Same as Applications" },
    ],
  },
  answer: {
    icon: KeyRound,
    title: "result",
    lines: [
      [["kw", "if"], ["id", " (!auth."], ["ty", "ok"], ["id", ")"]],
      [["kw", "    return"], ["id", " "], ["num", "1"], ["id", ";"]],
      [],
      [["ty", "status"], ["id", "="], ["st", "ok"]],
      [["ty", "application"], ["id", "="], ["ed", "Aim Assist"]],
      [["ty", "expires"], ["id", "="], ["st", "lifetime"]],
    ],
    notes: [
      { mark: "!", title: "Pass", value: "status=ok", text: "Anything else stops" },
      { mark: "t", title: "Time", value: "expires", text: "A date, or lifetime" },
    ],
  },
};

function CppCode({ lines }) {
  return (
    <pre className={styles.cppCode}>
      {lines.map((line, index) => (
        <div key={index}>
          <span className={styles.cppNo}>{index + 1}</span>
          <span>
            {line.length ? line.map((part, partIndex) => (
              <span key={partIndex} className={styles[`cpp${part[0]}`] || styles.cppid}>{part[1]}</span>
            )) : " "}
          </span>
        </div>
      ))}
    </pre>
  );
}

const USDC_ADDRESS = "DLAFu2wJ7uiWSvdn7ycA8i8DyH8xr3RjP5YnW8NmKamz";
const DEVELOPER_DISCORD = "https://discord.com/users/1383200339565613137";

function CompatGuide({ light, onClose: requestClose }) {
  const [sheet, setSheet] = useState("call");
  const [hire, setHire] = useState(false);
  const [copied, setCopied] = useState(false);
  const [closing, onClose] = useAnimatedClose(requestClose);
  const active = COMPAT_SHEETS[sheet];
  const facts = [
    { icon: Code, value: "C++" },
    { icon: Cpu, value: "x64" },
    { icon: Monitor, value: "Windows" },
    { icon: ShieldCheck, value: "Release" },
  ];
  const steps = [
    { icon: Plus, title: "Create the app" },
    { icon: FolderDown, title: "Drop the files in" },
    { icon: Cpu, title: "Build as x64" },
    { icon: KeyRound, title: "Check the key" },
  ];

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(USDC_ADDRESS);
      setCopied(true);
      playSound("success");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      playSound("error");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`${styles.versionHelpTheme}${light ? ` ${styles.themeLight}` : ""}`}>
      <div className={`${styles.versionHelpOverlay}${closing ? ` ${styles.modalClosing}` : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className={`${styles.versionHelp} ${styles.compatGuide}`} role="dialog" aria-modal="true" aria-label={hire ? "Contact the developer" : "How to add your own application"}>
          <div className={styles.versionHelpHead}>
            <span>{hire ? <><Wallet size={16} /> Add it for you</> : <><BookOpen size={16} /> Add your own application</>}</span>
            <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
          </div>
          {hire ? (
            <div className={styles.compatHire}>
              <button className={styles.compatBack} type="button" onClick={() => setHire(false)}>
                <ArrowLeft size={14} /> Back
              </button>
              <ol className={styles.compatHireSteps}>
                <li>
                  <i><Wallet size={16} /></i>
                  <div>
                    <span>Step 1</span>
                    <strong>Send 50 USDC</strong>
                    <p>Solana. Send it before you write.</p>
                    <button className={styles.compatAddress} type="button" onClick={copyAddress}>
                      <b>$50</b>
                      <code>{USDC_ADDRESS}</code>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </li>
                <li>
                  <i><Link2 size={16} /></i>
                  <div>
                    <span>Step 2</span>
                    <strong>After payment, contact me</strong>
                    <p>Open the Discord profile and send a message.</p>
                    <a href={DEVELOPER_DISCORD} target="_blank" rel="noopener noreferrer">
                      Discord
                      <ArrowRight size={14} />
                    </a>
                  </div>
                </li>
                <li>
                  <i><FolderDown size={16} /></i>
                  <div>
                    <span>Step 3</span>
                    <strong>Send the application source</strong>
                    <p>Attach the source of the application you want added.</p>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
          <>
          <div className={styles.compatSpec}>
            {facts.map((fact) => {
              const Icon = fact.icon;
              return <span key={fact.value}><Icon size={15} />{fact.value}</span>;
            })}
          </div>
          <div className={styles.compatBody}>
            <ol className={styles.compatRail}>
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.title}>
                    <i><Icon size={14} /></i>
                    <span>{step.title}</span>
                  </li>
                );
              })}
            </ol>
            <div className={styles.compatFiles}>
              {COMPAT_DOWNLOADS.map((file) => (
                <a key={file.href} className={styles.compatFile} href={file.href} download={file.name}>
                  <b className={styles[`compatExt${file.tone}`]}>{file.ext}</b>
                  <span>
                    <strong>{file.name}</strong>
                    <em>{file.label}</em>
                  </span>
                  <em className={styles.compatGet}><Download size={13} /> Get</em>
                </a>
              ))}
            </div>
          </div>
          <div className={styles.compatStudio}>
            <div className={styles.compatStudioBar}>
              <button type="button" className={sheet === "call" ? styles.compatTabOn : styles.compatTab} onClick={() => setSheet("call")}>
                <Pencil size={13} /> The call
              </button>
              <button type="button" className={sheet === "answer" ? styles.compatTabOn : styles.compatTab} onClick={() => setSheet("answer")}>
                <Server size={13} /> The answer
              </button>
              <em>{active.title}</em>
            </div>
            <CppCode lines={active.lines} />
            <aside className={styles.compatNotes}>
              {active.notes.map((note) => (
                <div key={note.title}>
                  <i>{note.mark}</i>
                  <span>{note.title}</span>
                  <strong>{note.value}</strong>
                  <p>{note.text}</p>
                </div>
              ))}
            </aside>
          </div>
          <button className={`${styles.primary} ${styles.compatHireBtn}`} type="button" onClick={() => setHire(true)}>
            <Wallet size={15} />
            Contact developer to add it
            <ArrowRight size={14} />
          </button>
          </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApplicationGuideDock({ light }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={styles.licenseDock}>
        <i className={styles.licenseDockMark} aria-hidden="true">
          <BookOpen size={22} />
        </i>
        <div className={styles.licenseDockCopy}>
          <strong>How to add your own application</strong>
          <p>Make it compatible with the loader. C++ and x64 only.</p>
        </div>
        <button className={styles.primary} type="button" onClick={() => setOpen(true)}>
          <BookOpen size={15} />
          Check it out
          <ArrowRight size={14} />
        </button>
      </div>
      {open ? <CompatGuide light={light} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ApplicationActionDock({ count, onCreate }) {
  return (
    <div className={styles.licenseDock}>
      <i className={styles.licenseDockMark} aria-hidden="true">
        <LayoutGrid size={22} />
      </i>
      <div className={styles.licenseDockCopy}>
        <strong>New application</strong>
        <p>Add a product, then set its version, variants, and who can sell it.</p>
      </div>
      <div className={styles.licenseDockBalance}>
        <span>Products</span>
        <b>{count}</b>
      </div>
      <button className={styles.primary} type="button" onClick={onCreate}>
        <Plus size={15} />
        Create New
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function LicenseActionDock({ reseller, balance, disabled, onBuy }) {
  return (
    <div className={styles.licenseDock}>
      <i className={styles.licenseDockMark} aria-hidden="true">
        {reseller ? <Wallet size={22} /> : <KeyRound size={22} />}
      </i>
      <div className={styles.licenseDockCopy}>
        <strong>{reseller ? "Buy licenses" : "Generate licenses"}</strong>
        <p>
          {reseller
            ? "Pay from your balance. New keys land in this list right away."
            : "Issue keys for unlocked applications. Reseller purchases stay on each reseller."}
        </p>
      </div>
      {reseller ? (
        <div className={styles.licenseDockBalance}>
          <span>Balance</span>
          <b>{formatPrice(balance)}</b>
        </div>
      ) : null}
      <button className={styles.primary} type="button" onClick={onBuy} disabled={disabled}>
        {reseller ? <Wallet size={15} /> : <KeyRound size={15} />}
        {reseller ? "Buy" : "Generate"}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function LicenseMetrics({ metrics }) {
  return (
    <div className={styles.metrics}>
      {[
        { key: "total", label: "Total", icon: KeyRound },
        { key: "fresh", label: "Not activated", icon: Clock3 },
        { key: "active", label: "Active", icon: ShieldCheck },
        { key: "banned", label: "Banned", icon: Ban },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className={styles.metric} data-kind={item.key}>
            <i className={styles.metricIcon}><Icon size={22} strokeWidth={2.2} /></i>
            <div>
              <span>{item.label}</span>
              <strong>{metrics[item.key]}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tokenKind(char) {
  if (char === "*" || char === "?" || char === "#" || char === "@" || char === "~" || char === "$") return char;
  if (char === "-" || char === "_" || char === ".") return "sep";
  return "lit";
}

function KeyFormatStudio({ format, onChange }) {
  const inputRef = useRef(null);
  const [shuffle, setShuffle] = useState(0);
  const [copied, setCopied] = useState("");
  const parsed = normalizeKeyFormat(format);
  const strength = keyFormatStrength(format);
  const samples = useMemo(() => previewKeys(format, 1), [format.pattern, format.uppercase, format.digits, shuffle]);
  const activePreset = KEY_PRESETS.find(
    (preset) => preset.pattern === format.pattern && preset.uppercase === format.uppercase
  );

  function insertToken(token) {
    const current = format.pattern || "";
    const field = inputRef.current;
    const start = field ? field.selectionStart ?? current.length : current.length;
    const end = field ? field.selectionEnd ?? start : start;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`.slice(0, KEY_PATTERN_MAX);
    onChange({ ...format, pattern: next });
    playSound("click");
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      const caret = Math.min(start + token.length, KEY_PATTERN_MAX);
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  async function copySample(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      playSound("success");
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      playSound("error");
    }
  }

  const meter = Math.max(6, Math.min(100, (strength.log10 / 14) * 100));

  return (
    <>
      <div className={styles.kfPresets} role="list">
        {KEY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="listitem"
            className={`${styles.kfPreset}${activePreset?.id === preset.id ? ` ${styles.kfPresetOn}` : ""}`}
            onClick={() => {
              onChange({ pattern: preset.pattern, uppercase: preset.uppercase, digits: preset.digits });
              playSound("toggle");
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className={styles.group}>
        <label htmlFor="key-pattern">Pattern</label>
        <input
          ref={inputRef}
          id="key-pattern"
          className={styles.kfInput}
          value={format.pattern}
          maxLength={KEY_PATTERN_MAX}
          onChange={(event) => onChange({ ...format, pattern: event.target.value.slice(0, KEY_PATTERN_MAX) })}
          placeholder="SE-****-****-****"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={styles.kfMeta}>
        <span>{format.pattern.length}/{KEY_PATTERN_MAX}</span>
        <span>{parsed.error || describeKeyFormat(format)}</span>
      </div>

      {parsed.error ? <p className={styles.kfError}>{parsed.error}</p> : null}

      <div className={styles.kfTokens}>
        {KEY_TOKENS.map((token) => (
          <button
            key={token.id}
            type="button"
            className={styles.kfToken}
            title={token.hint}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertToken(token.id)}
          >
            <b data-kind={tokenKind(token.id)}>{token.id}</b>
            {token.label}
          </button>
        ))}
      </div>

      {format.pattern ? (
        <div className={styles.kfMap} aria-hidden="true">
          {[...format.pattern].map((char, index) => (
            <em key={`${char}-${index}`} data-kind={tokenKind(char)}>{char}</em>
          ))}
        </div>
      ) : null}

      <div className={styles.kfChecks}>
        <label className={`${styles.checkRow}${format.uppercase ? ` ${styles.checkRowOn}` : ""}`}>
          <input
            type="checkbox"
            checked={format.uppercase}
            onChange={(event) => onChange({ ...format, uppercase: event.target.checked })}
          />
          <span className={styles.checkBox} aria-hidden="true">{format.uppercase ? <Check size={14} strokeWidth={3} /> : null}</span>
          <span>Uppercase letters</span>
        </label>
      </div>

      <div className={styles.kfStrength}>
        <div className={styles.kfStrengthTop}>
          <span>Entropy</span>
          <strong data-level={strength.id}>{strength.label}</strong>
        </div>
        <div className={styles.kfMeter} data-level={strength.id}>
          <i style={{ width: `${parsed.error ? 8 : meter}%` }} />
        </div>
        <p>
          {parsed.error
            ? "Fix the pattern to estimate combinations."
            : `${formatCombinations(strength.log10)} combinations · ${strength.random} random slot${strength.random === 1 ? "" : "s"}${strength.checks ? ` · checksum ×${strength.checks}` : ""}`}
        </p>
      </div>

      <div className={styles.kfPreview}>
        <div className={styles.kfPreviewHead}>
          <span>Live sample</span>
          <button
            type="button"
            className={styles.ghost}
            disabled={Boolean(parsed.error)}
            onClick={() => {
              setShuffle((value) => value + 1);
              playSound("pop");
            }}
          >
            <Shuffle size={13} />
            Shuffle
          </button>
        </div>
        {samples.length ? (
          <ul>
            {samples.map((sample, sampleIndex) => (
              <li key={`${sample}-${sampleIndex}`}>
                <button type="button" onClick={() => copySample(sample)} title="Copy sample">
                  <code>
                    {[...sample].map((char, index) => {
                      const source = format.pattern[index] || "";
                      return (
                        <span key={`${sampleIndex}-${index}`} data-rand={isRandomToken(source) ? "1" : "0"}>
                          {char}
                        </span>
                      );
                    })}
                  </code>
                  {copied === sample ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.kfEmpty}>A sample appears once the pattern is valid.</p>
        )}
      </div>
    </>
  );
}

function LoaderAboutCard() {
  return (
      <section className={`${styles.settingsCard} ${styles.loaderAboutCard}`}>
        <div className={styles.loaderCardTitle}>
          <span className={styles.loaderIcon}><Package size={18} strokeWidth={2} /></span>
          <div>
            <h2>About rebranded loaders</h2>
            <p>What you should know before sharing your build with customers.</p>
          </div>
        </div>
        <div className={styles.loaderAbout}>
          {LOADER_ABOUT.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className={`${styles.loaderAboutItem} ${item.featured ? styles.loaderAboutFeatured : ""}`}>
                <span className={styles.loaderAboutIcon}><Icon size={15} /></span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
  );
}

const LOADER_ABOUT = [
  {
    icon: RotateCcw,
    featured: true,
    title: "Updates itself on launch",
    text: "Every rebranded loader updates automatically when it starts, so you and your customers never need to download it again after a new release.",
  },
  {
    icon: Palette,
    title: "Your brand, built in",
    text: "The name, color, and logo you choose are stamped into the file you download from this page.",
  },
  {
    icon: Clock3,
    title: "One build every 24 hours",
    text: "You can generate a new loader once every 24 hours. Downloading your current loader is always available.",
  },
  {
    icon: ShieldCheck,
    title: "Maintenance pauses builds",
    text: "While the loader is under maintenance, generating and downloading are paused until it is back online.",
  },
];

export default function AdminPanel({ mode = "admin", demo = false }) {
  const reseller = mode === "reseller";
  if (demo) {
    demoPanelBase = "/demo";
    installDemoApi();
  }
  const pathname = usePathname() || "";
  const [section, setSection] = useState(() => parsePanelPath(pathname, reseller));
  const view = section.view;

  function goTo(target) {
    const next = parsePanelPath(target, reseller);
    setSection(next);
    if (typeof window !== "undefined" && window.location.pathname !== next.canonical) {
      window.history.pushState(null, "", next.canonical);
    }
  }

  function setView(next) {
    const base = panelBase(reseller);
    goTo(`${base}/${next}`);
  }
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [compact, setCompact] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setNavOpen(false);
  }, [view]);
  const [keyFormat, setKeyFormat] = useState(DEFAULT_KEY_FORMAT);
  const formatHydrated = useRef(false);
  const savedFormat = useRef("");
  const [applications, setApplications] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transactionsReady, setTransactionsReady] = useState(true);
  const [depositAmount, setDepositAmount] = useState(100);
  const [depositDraft, setDepositDraft] = useState("100");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositPreview, setDepositPreview] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [updatesSeen, setUpdatesSeen] = useState("0");
  const [updatesNewSince, setUpdatesNewSince] = useState(null);
  const [updateForm, setUpdateForm] = useState({ title: "", description: "", badges: [emptyUpdateBadge()], tags: [] });
  const [editingUpdateId, setEditingUpdateId] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [customAffect, setCustomAffect] = useState({ name: "", icon: UPDATE_TAG_ICONS[0] });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [resellerForm, setResellerForm] = useState({ discordId: "", serviceName: "", balance: "0", discountPercent: "0", applicationIds: [], teamManagement: true });
  const [balanceAmount, setBalanceAmount] = useState("");
  const [helpers, setHelpers] = useState([]);
  const [helperForm, setHelperForm] = useState({ discordId: "", applicationIds: [], canGenerate: false, canResetHwid: false, canBan: false });
  const [inspectedReseller, setInspectedReseller] = useState(null);
  const [resellerLicenses, setResellerLicenses] = useState([]);
  const [resellerQuery, setResellerQuery] = useState("");
  const [resellerAppFilter, setResellerAppFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [appForm, setAppForm] = useState(emptyApp);
  const [variantForm, setVariantForm] = useState(emptyVariant);
  const [deleteName, setDeleteName] = useState("");
  const [draftVariants, setDraftVariants] = useState([]);
  const [licenseForm, setLicenseForm] = useState({ applicationId: "", variantId: "", quantity: 1 });
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [formMessage, setFormMessage] = useState("");
  const [formTone, setFormTone] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [appFilter, setAppFilter] = useState("all");
  const [copiedId, setCopiedId] = useState("");
  const [infoLicenseId, setInfoLicenseId] = useState("");
  const [licenseFrozenSince, setLicenseFrozenSince] = useState(null);
  const closeLicenseInfo = useCallback(() => setInfoLicenseId(""), []);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const loaderInputRef = useRef(null);
  const [loaderInfo, setLoaderInfo] = useState(null);
  const [loaderBlacklist, setLoaderBlacklist] = useState([]);
  const [blacklistId, setBlacklistId] = useState("");
  const [loaderFile, setLoaderFile] = useState(null);
  const [loaderPrimary, setLoaderPrimary] = useState("SCRIPT");
  const [loaderSecondary, setLoaderSecondary] = useState("ENGINE");
  const [loaderColor, setLoaderColor] = useState("#E94438");
  const [loaderLogoFile, setLoaderLogoFile] = useState(null);
  const [loaderLogoPreview, setLoaderLogoPreview] = useState("");
  const [loaderLogoCleared, setLoaderLogoCleared] = useState(false);
  const [loaderHasLogo, setLoaderHasLogo] = useState(false);
  const [loaderLogoVersion, setLoaderLogoVersion] = useState("0");
  const [loaderVersion, setLoaderVersion] = useState("1.0.0");
  const [loaderCurrent, setLoaderCurrent] = useState({
    uploaded: false,
    fileName: "",
    fileSize: 0,
    updatedAt: null,
    version: "",
    primary: "",
    secondary: "",
    color: "",
    generatedAt: "",
    hasBuild: false,
  });
  const [loaderBlacklisted, setLoaderBlacklisted] = useState(false);
  const [loaderUploaded, setLoaderUploaded] = useState(false);
  const [loaderStatusReady, setLoaderStatusReady] = useState(false);
  const [loaderBusy, setLoaderBusy] = useState(false);
  const [loaderStatusBusy, setLoaderStatusBusy] = useState(false);
  const [loaderDownloading, setLoaderDownloading] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [scratch, setScratch] = useState("");
  const [scratchSaved, setScratchSaved] = useState(null);
  const firstView = useRef(true);
  const sessionStart = useRef(Date.now());
  const scratchTimer = useRef(null);
  const clock = usePanelClock();
  const connection = usePanelConnection();

  useEffect(() => {
    setSoundOn(!isSoundMuted());
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    function onPointerDown(event) {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
      if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
      if (!reduceMotion) spawnBubble(event.clientX, event.clientY);
      if (!target.closest(`.${styles.navItem}`)) playSound("click");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    playSound("nav");
  }, [view]);

  const [navEl, setNavEl] = useState(null);
  const [navMark, setNavMark] = useState(null);
  const [navHover, setNavHover] = useState(null);
  const [navAnimate, setNavAnimate] = useState(false);

  useLayoutEffect(() => {
    const nav = navEl;
    if (!nav) return undefined;
    function measure() {
      const active = nav.querySelector(`.${styles.navItemActive}`);
      setNavMark(active ? { y: active.offsetTop, h: active.offsetHeight } : null);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [view, navEl]);

  useEffect(() => {
    if (!navMark || navAnimate) return undefined;
    const frame = window.requestAnimationFrame(() => setNavAnimate(true));
    return () => window.cancelAnimationFrame(frame);
  }, [navMark, navAnimate]);

  function trackNavHover(event) {
    const item = event.target instanceof Element ? event.target.closest(`.${styles.navItem}`) : null;
    if (!item || !navEl?.contains(item)) return;
    setNavHover({ y: item.offsetTop, h: item.offsetHeight, on: true });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundMuted(!next);
    setSoundOn(next);
    if (next) playSound("toggle");
  }

  function showToast(text, type = "error") {
    playSound(type === "error" ? "error" : "success");
    setToast({ text, type, id: Date.now() });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }

  function showError(text) {
    showToast(text, "error");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = reseller ? await resellerApi("/api/reseller/data") : await api("/api/admin/data");
      setEmail(data.account?.email || data.email || "");
      setAccount(data.account || null);
      setApplications(data.applications || []);
      setLicenses(data.licenses || []);
      setLicenseFrozenSince(data.licenseFrozenSince || null);
      setResellers(data.resellers || []);
      setUpdates(data.updates || []);
      setTransactions(data.transactions || []);
      setTransactionsReady(data.transactionsReady !== false);
      setHelpers(data.helpers || []);
      if (data.keyFormat?.pattern && !formatHydrated.current) {
        const next = {
          pattern: data.keyFormat.pattern,
          uppercase: Boolean(data.keyFormat.uppercase),
          digits: Boolean(data.keyFormat.digits),
        };
        savedFormat.current = JSON.stringify(next);
        setKeyFormat(next);
        formatHydrated.current = true;
      }
      setAuthed(true);
      setLastSync(Date.now());
    } catch (err) {
      if (err.status === 401) {
        if (reseller) {
          window.location.href = "/?error=session";
          return;
        }
        window.localStorage.removeItem(SESSION_KEY);
        setAuthed(false);
      } else {
        setAuthed(true);
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [reseller]);

  useEffect(() => {
    const current = parsePanelPath(window.location.pathname, reseller);
    if (current.canonical !== window.location.pathname) {
      window.history.replaceState(null, "", current.canonical);
      setSection(current);
    }
    function onPop() {
      setSection(parsePanelPath(window.location.pathname, reseller));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [reseller]);

  useEffect(() => {
    if (!authed || reseller || view !== "reseller-licenses" || !section.resellerId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    api(`/api/admin/resellers?id=${encodeURIComponent(section.resellerId)}`)
      .then((data) => {
        if (cancelled) return;
        setInspectedReseller(data.reseller || null);
        setResellerLicenses(data.licenses || []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) {
          window.localStorage.removeItem(SESSION_KEY);
          setAuthed(false);
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, reseller, view, section.resellerId]);

  useEffect(() => {
    if (!reseller || !account?.id) return;
    setUpdatesSeen(window.localStorage.getItem(`se-updates-seen:${account.id}`) || "0");
  }, [reseller, account?.id]);

  useEffect(() => {
    if (view !== "updates") setUpdatesNewSince(null);
  }, [view]);

  useEffect(() => {
    if (!reseller || !account?.id || view !== "updates" || !updates.length) return;
    const key = `se-updates-seen:${account.id}`;
    const seenBefore = Number(window.localStorage.getItem(key) || 0);
    setUpdatesNewSince((current) => (current === null ? seenBefore : current));
    const newest = updates.reduce((max, entry) => {
      const time = new Date(entry.createdAt).getTime();
      return Number.isFinite(time) && time > max ? time : max;
    }, 0);
    if (!newest) return;
    window.localStorage.setItem(key, String(newest));
    setUpdatesSeen(String(newest));
  }, [reseller, account?.id, view, updates]);

  useEffect(() => {
    if (!reseller || !account) return;
    const helperAccount = account.role === "Helper";
    const licenseAccess = !helperAccount || account.permissions?.generate || account.permissions?.resetHwid || account.permissions?.ban;
    if (!licenseAccess && view === "licenses") setView("applications");
    if ((!account.teamManagement || helperAccount) && view === "team") setView("applications");
    if (helperAccount && view === "loader") setView("applications");
  }, [reseller, account, view]);

  useEffect(() => {
    if (!authed || view !== "loader" || (reseller && account?.role === "Helper")) return undefined;
    let cancelled = false;
    setLoaderStatusReady(false);
    const request = reseller ? resellerApi("/api/reseller/loader") : api("/api/admin/loader");
    request
      .then((data) => {
        if (cancelled) return;
        if (reseller) {
          setLoaderBlacklisted(Boolean(data.blacklisted));
          setLoaderUploaded(Boolean(data.uploaded));
          setLoaderCurrent({
            uploaded: Boolean(data.uploaded),
            fileName: data.loader?.fileName || "",
            fileSize: data.loader?.fileSize || 0,
            updatedAt: data.loader?.updatedAt || null,
            version: data.loader?.version || "",
            latestVersion: data.loader?.latestVersion || "",
            statusHistory: Array.isArray(data.loader?.statusHistory) ? data.loader.statusHistory : [],
            statusUpdatedAt: data.loader?.statusUpdatedAt || null,
            status: data.loader?.status === "maintenance" ? "maintenance" : "online",
            primary: data.current?.primary || "",
            secondary: data.current?.secondary || "",
            color: data.current?.color || "",
            generatedAt: data.current?.generatedAt || "",
            hasBuild: Boolean(data.current?.hasBuild),
            hasLogo: Boolean(data.current?.hasLogo),
          });
          setLoaderHasLogo(Boolean(data.current?.hasLogo));
          setLoaderLogoVersion(data.current?.generatedAt || "0");
          if (data.primary) setLoaderPrimary(data.primary);
          if (typeof data.secondary === "string") setLoaderSecondary(data.secondary);
          if (data.color) setLoaderColor(String(data.color).toUpperCase());
          return;
        }
        setLoaderInfo(data.loader || null);
        setLoaderBlacklist(data.blacklist || []);
        if (data.loader?.version) setLoaderVersion(data.loader.version);
      })
      .catch((err) => {
        if (!cancelled) showError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoaderStatusReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, reseller, view, account?.role]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("se-admin-theme");
    const storedCompact = window.localStorage.getItem("se-admin-compact");
    if (storedTheme === "light") setTheme("light");
    if (storedCompact === "1") setCompact(true);
  }, []);

  useEffect(() => {
    if (reseller) {
      load();
      return;
    }
    const session = readSession();
    if (!session?.access_token) {
      setReady(true);
      return;
    }
    load();
  }, [load, reseller]);

  useEffect(() => {
    if (!reseller || demoPanelBase) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("np")) {
      // Crypto is credited by NOWPayments' own notification, so this only refreshes the balance.
      const paid = params.get("np") === "success";
      window.history.replaceState(null, "", window.location.pathname);
      if (!paid) {
        showToast("Payment cancelled. You were not charged.", "error");
        return;
      }
      showToast("Thanks. Your balance updates as soon as the payment confirms.", "success");
      [4000, 15000, 40000].forEach((delay) => window.setTimeout(() => load(), delay));
      return;
    }
    const outcome = params.get("stripe");
    if (!outcome) return;
    const sessionId = params.get("session_id");
    window.history.replaceState(null, "", window.location.pathname);
    if (outcome !== "success" || !sessionId) {
      showToast("Payment cancelled. You were not charged.", "error");
      return;
    }
    resellerApi(`/api/reseller/deposit?session_id=${encodeURIComponent(sessionId)}`)
      .then((result) => {
        if (!result.paid) {
          showToast("Payment is still processing. Your balance updates once it clears.", "error");
          return null;
        }
        showToast("Payment received. Your balance was updated.", "success");
        return load();
      })
      .catch((err) => showToast(err.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseller]);

  useEffect(() => {
    if (!formatHydrated.current) return undefined;
    const parsed = normalizeKeyFormat(keyFormat);
    if (parsed.error) return undefined;
    const serialized = JSON.stringify(parsed);
    if (serialized === savedFormat.current) return undefined;
    const timer = window.setTimeout(() => {
      api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(parsed),
      })
        .then(() => {
          savedFormat.current = serialized;
        })
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [keyFormat]);

  const appsById = useMemo(() => new Map(applications.map((app) => [app.id, app])), [applications]);

  const visibleLicenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses.filter((license) => {
      if (appFilter !== "all" && license.application_id !== appFilter) return false;
      if (!needle) return true;
      const appName = appsById.get(license.application_id)?.name || "";
      return [license.license_key, license.status, license.variant_label, appName]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [licenses, query, appFilter, appsById]);

  const infoLicense = infoLicenseId
    ? licenses.find((license) => license.id === infoLicenseId) || resellerLicenses.find((license) => license.id === infoLicenseId) || null
    : null;

  const visibleResellerLicenses = useMemo(() => {
    const needle = resellerQuery.trim().toLowerCase();
    return resellerLicenses.filter((license) => {
      if (resellerAppFilter !== "all" && license.application_id !== resellerAppFilter) return false;
      if (!needle) return true;
      const appName = appsById.get(license.application_id)?.name || "";
      return [license.license_key, license.status, license.variant_label, appName]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [resellerLicenses, resellerQuery, resellerAppFilter, appsById]);

  const resellerMetrics = useMemo(() => {
    const source = resellerAppFilter === "all" ? resellerLicenses : resellerLicenses.filter((license) => license.application_id === resellerAppFilter);
    return {
      total: source.length,
      fresh: source.filter((license) => license.status === "Not Activated").length,
      active: source.filter((license) => license.status === "Active").length,
      banned: source.filter((license) => license.status === "Banned").length,
    };
  }, [resellerLicenses, resellerAppFilter]);

  const tagSuggestions = useMemo(() => {
    const queryText = tagQuery.trim().toLowerCase();
    const selected = new Set(updateForm.tags.map((tag) => `${tag.kind}:${tag.id}`));
    const items = [];
    for (const app of applications) {
      if (!selected.has(`application:${app.id}`) && (!queryText || app.name.toLowerCase().includes(queryText))) {
        items.push({ kind: "application", id: app.id, name: app.name, hint: "Product" });
      }
      for (const variant of app.variants || []) {
        if (selected.has(`variant:${variant.id}`)) continue;
        const haystack = `${app.name} ${variant.label}`.toLowerCase();
        if (queryText && !haystack.includes(queryText)) continue;
        items.push({
          kind: "variant",
          id: variant.id,
          applicationId: app.id,
          name: variant.label,
          applicationName: app.name,
          hint: "Variant",
        });
      }
    }
    const custom = queryText && !updateForm.tags.some((entry) => entry.kind === "custom" && entry.name.toLowerCase() === queryText)
      ? {
          kind: "custom",
          id: "custom-draft",
          name: tagQuery.trim().slice(0, UPDATE_CUSTOM_TAG_MAX_LENGTH),
          icon: customAffect.icon,
          hint: "Custom",
        }
      : null;
    const limited = items.slice(0, custom ? 7 : 8);
    if (custom) limited.push(custom);
    return limited;
  }, [applications, customAffect.icon, tagQuery, updateForm.tags]);

  const metrics = useMemo(() => {
    const source = appFilter === "all" ? licenses : licenses.filter((license) => license.application_id === appFilter);
    return {
      total: source.length,
      fresh: source.filter((license) => license.status === "Not Activated").length,
      active: source.filter((license) => license.status === "Active").length,
      banned: source.filter((license) => license.status === "Banned").length,
    };
  }, [licenses, appFilter]);

  function openCreate() {
    setAppForm(emptyApp);
    setDraftVariants([]);
    setFormMessage("");
    setFormTone("");
    setDrawer({ type: "create-app", step: "app" });
  }

  function openAddVariant() {
    setVariantForm(emptyVariant);
    setFormMessage("");
    setFormTone("");
    setDrawer((current) => (current ? { ...current, step: "variant" } : current));
  }

  function backToApp() {
    setFormMessage("");
    setFormTone("");
    setDeleteName("");
    setDrawer((current) => (current ? { ...current, step: "app" } : current));
  }

  function openDeleteApp() {
    setDeleteName("");
    setFormMessage("");
    setFormTone("");
    setDrawer((current) => (current ? { ...current, step: "delete" } : current));
  }

  function openEdit(app) {
    setAppForm({ name: app.name, version: app.version, status: app.status });
    setVariantForm(emptyVariant);
    setFormMessage("");
    setFormTone("");
    setDrawer({ type: "edit-app", step: "app", app });
  }

  function openGenerate() {
    const first = applications.find((app) => !app.keys_locked) || null;
    const variant = first?.variants?.[0];
    setLicenseForm({
      applicationId: first?.id || "",
      variantId: variant?.id || "",
      quantity: 1,
    });
    setGeneratedKeys([]);
    setFormMessage("");
    setFormTone("");
    setDrawer({ type: "generate" });
  }

  async function saveApplication(event) {
    event.preventDefault();
    setBusy(true);
    setFormMessage("");
    try {
      if (drawer?.type === "create-app") {
        if (!draftVariants.length) {
          setFormTone("error");
          setFormMessage("Add at least one variant.");
          setBusy(false);
          return;
        }
        await api("/api/admin/applications", {
          method: "POST",
          body: JSON.stringify({ ...appForm, variants: draftVariants }),
        });
      } else {
        await api("/api/admin/applications", {
          method: "PATCH",
          body: JSON.stringify({ id: drawer.app.id, ...appForm }),
        });
      }
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addVariant(event) {
    event.preventDefault();
    setFormMessage("");
    if (drawer?.type === "create-app") {
      setDraftVariants((current) => [...current, { ...blankVariant(), ...variantForm }]);
      setVariantForm(emptyVariant);
      backToApp();
      return;
    }
    if (!drawer?.app) return;
    setBusy(true);
    try {
      await api("/api/admin/variants", {
        method: "POST",
        body: JSON.stringify({ applicationId: drawer.app.id, ...variantForm }),
      });
      setVariantForm(emptyVariant);
      await load();
      backToApp();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVariant(id) {
    const app = applications.find((entry) => entry.id === drawer?.app?.id);
    if ((app?.variants?.length || 0) <= 1) {
      showError("You can't delete the last variant. An application must keep at least one.");
      return;
    }
    if (!window.confirm("Delete this variant?")) return;
    setBusy(true);
    try {
      await api("/api/admin/variants", { method: "DELETE", body: JSON.stringify({ id }) });
      await load();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleKeyLock() {
    if (!editingApp?.id) return;
    setBusy(true);
    try {
      await api("/api/admin/applications", {
        method: "PATCH",
        body: JSON.stringify({ id: editingApp.id, keysLocked: !editingApp.keys_locked }),
      });
      await load();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteApplication(event) {
    event.preventDefault();
    if (!editingApp?.id) return;
    if (deleteName !== editingApp.name) {
      setFormTone("error");
      setFormMessage("Type the application name exactly.");
      return;
    }
    setBusy(true);
    setFormMessage("");
    try {
      await api("/api/admin/applications", {
        method: "DELETE",
        body: JSON.stringify({ id: editingApp.id, name: deleteName }),
      });
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateLicenses(event) {
    event.preventDefault();
    setBusy(true);
    setFormMessage("");
    setGeneratedKeys([]);
    try {
      const request = {
        method: "POST",
        body: JSON.stringify({
          applicationId: licenseForm.applicationId,
          variantId: licenseForm.variantId,
          quantity: Number(licenseForm.quantity),
        }),
      };
      const result = reseller
        ? await resellerApi("/api/reseller/licenses", request)
        : await api("/api/admin/licenses", request);
      setGeneratedKeys(result.keys || []);
      setFormTone("ok");
      setFormMessage(
        reseller
          ? `Bought ${result.keys?.length || 0} license(s) for ${formatPrice(result.cost)}.`
          : `Generated ${result.keys?.length || 0} license(s).`
      );
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function licenseAction(id, action) {
    const prompts = {
      delete: "Delete this license? This cannot be undone.",
      ban: "Ban this license?",
      unban: "Remove the ban from this license?",
      reset_hwid: "Reset the hardware ID on this license?",
    };
    if (reseller && action === "delete") return;
    if (!window.confirm(prompts[action])) return;
    setError("");
    try {
      if (reseller) {
        await resellerApi("/api/reseller/licenses", { method: "PATCH", body: JSON.stringify({ id, action }) });
      } else if (action === "delete") {
        await api("/api/admin/licenses", { method: "DELETE", body: JSON.stringify({ id }) });
      } else {
        await api("/api/admin/licenses", { method: "PATCH", body: JSON.stringify({ id, action }) });
      }
      await load();
      if (inspectedReseller?.id) {
        const data = await api(`/api/admin/resellers?id=${inspectedReseller.id}`);
        setResellerLicenses(data.licenses || []);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyText(value, id) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  function signOut() {
    if (demo) {
      showToast("This is a demo. Nothing to sign out of.", "error");
      return;
    }
    if (reseller) {
      window.location.href = "/api/auth/discord/logout";
      return;
    }
    window.localStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  function openResellerLicenses(entry) {
    setInspectedReseller(entry);
    setResellerQuery("");
    setResellerAppFilter("all");
    setResellerLicenses([]);
    setError("");
    goTo(`/admin/resellers/${entry.id}`);
  }

  function openBalance(entry) {
    setBalanceAmount("");
    setFormMessage("");
    setFormTone("");
    setDrawer({ type: "balance", id: entry.id, balance: Number(entry.balance || 0), name: entry.serviceName || entry.username || entry.discordId });
  }

  async function adjustBalance(action) {
    if (!drawer?.id || busy) return;
    setBusy(true);
    setFormMessage("");
    try {
      const data = await api("/api/admin/resellers", {
        method: "PATCH",
        body: JSON.stringify({ id: drawer.id, balanceAction: action, amount: balanceAmount }),
      });
      const next = Number(data.balance);
      setResellers((current) => current.map((entry) => (entry.id === drawer.id ? { ...entry, balance: next } : entry)));
      setDrawer((current) => (current?.type === "balance" ? { ...current, balance: next } : current));
      setBalanceAmount("");
      setFormTone("ok");
      setFormMessage(action === "remove" ? "Balance removed." : "Balance added.");
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openReseller(entry) {
    setResellerForm(
      entry
        ? {
            discordId: entry.discordId,
            serviceName: entry.serviceName || "",
            balance: Number(entry.balance || 0).toFixed(2),
            discountPercent: String(Number(entry.discountPercent || 0)),
            applicationIds: entry.applicationIds || [],
            teamManagement: entry.teamManagement !== false,
          }
        : { discordId: "", serviceName: "", balance: "0", discountPercent: "0", applicationIds: [], teamManagement: true }
    );
    setFormMessage("");
    setFormTone("");
    setDrawer(entry ? { type: "reseller", id: entry.id } : { type: "reseller" });
  }

  function toggleResellerApp(id) {
    setResellerForm((current) => ({
      ...current,
      applicationIds: current.applicationIds.includes(id)
        ? current.applicationIds.filter((entry) => entry !== id)
        : [...current.applicationIds, id],
    }));
  }

  async function saveReseller(event) {
    event.preventDefault();
    setBusy(true);
    setFormMessage("");
    try {
      await api(drawer?.id ? "/api/admin/resellers" : "/api/admin/resellers", {
        method: drawer?.id ? "PATCH" : "POST",
        body: JSON.stringify({
          id: drawer?.id,
          discordId: resellerForm.discordId,
          serviceName: resellerForm.serviceName,
          balance: resellerForm.balance,
          discountPercent: resellerForm.discountPercent,
          applicationIds: resellerForm.applicationIds,
          teamManagement: resellerForm.teamManagement,
        }),
      });
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteReseller() {
    if (!drawer?.id) return;
    if (!window.confirm("Remove this reseller?")) return;
    setBusy(true);
    try {
      await api("/api/admin/resellers", { method: "DELETE", body: JSON.stringify({ id: drawer.id }) });
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openHelper(entry) {
    setHelperForm(
      entry
        ? {
            discordId: entry.discordId,
            applicationIds: entry.applicationIds || [],
            canGenerate: Boolean(entry.canGenerate),
            canResetHwid: Boolean(entry.canResetHwid),
            canBan: Boolean(entry.canBan),
          }
        : { discordId: "", applicationIds: [], canGenerate: false, canResetHwid: false, canBan: false }
    );
    setFormMessage("");
    setFormTone("");
    setDrawer(entry ? { type: "helper", id: entry.id } : { type: "helper" });
  }

  function toggleHelperApp(id) {
    setHelperForm((current) => ({
      ...current,
      applicationIds: current.applicationIds.includes(id)
        ? current.applicationIds.filter((entry) => entry !== id)
        : [...current.applicationIds, id],
    }));
  }

  function toggleHelperPermission(key) {
    setHelperForm((current) => ({ ...current, [key]: !current[key] }));
  }

  async function saveHelper(event) {
    event.preventDefault();
    setBusy(true);
    setFormMessage("");
    try {
      await resellerApi("/api/reseller/team", {
        method: drawer?.id ? "PATCH" : "POST",
        body: JSON.stringify({ id: drawer?.id, ...helperForm }),
      });
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteHelper() {
    if (!drawer?.id) return;
    if (!window.confirm("Remove this helper?")) return;
    setBusy(true);
    try {
      await resellerApi("/api/reseller/team", { method: "DELETE", body: JSON.stringify({ id: drawer.id }) });
      setDrawer(null);
      await load();
    } catch (err) {
      setFormTone("error");
      setFormMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeHelper(entry) {
    if (!entry?.id) return;
    if (!window.confirm("Remove this helper?")) return;
    setBusy(true);
    setError("");
    try {
      await resellerApi("/api/reseller/team", { method: "DELETE", body: JSON.stringify({ id: entry.id }) });
      if (drawer?.id === entry.id) setDrawer(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const searchResults = useMemo(() => {
    const helper = account?.role === "Helper";
    const canSeeLicenses = !helper || account?.permissions?.generate || account?.permissions?.resetHwid || account?.permissions?.ban;
    const needle = searchText.trim().toLowerCase();
    const pages = [
      { id: "page-links", kind: "page", view: "links", label: "Quick Links", hint: "Page", icon: Link2 },
      { id: "page-faq", kind: "page", view: "faq", label: "FAQ", hint: "Page", icon: HelpCircle },
      { id: "page-applications", kind: "page", view: "applications", label: "Applications", hint: "Page", icon: LayoutGrid },
      canSeeLicenses ? { id: "page-licenses", kind: "page", view: "licenses", label: "Licenses", hint: "Page", icon: KeyRound } : null,
      { id: "page-updates", kind: "page", view: "updates", label: "Updates", hint: "Page", icon: Bell },
      reseller ? { id: "page-deposit", kind: "page", view: "deposit", label: "Deposit", hint: "Page", icon: Wallet } : null,
      reseller ? { id: "page-transactions", kind: "page", view: "transactions", label: "Transactions", hint: "Page", icon: ArrowLeftRight } : null,
      !helper ? { id: "page-loader", kind: "page", view: "loader", label: "Loader", hint: "Page", icon: Download } : null,
      reseller && account?.teamManagement && !helper ? { id: "page-team", kind: "page", view: "team", label: "Team", hint: "Page", icon: Users } : null,
      !reseller ? { id: "page-resellers", kind: "page", view: "resellers", label: "Resellers", hint: "Page", icon: Users } : null,
      { id: "page-settings", kind: "page", view: "settings", label: "Settings", hint: "Page", icon: Settings },
    ].filter(Boolean);
    const hits = [];
    for (const page of pages) {
      if (!needle || page.label.toLowerCase().includes(needle)) hits.push(page);
    }
    if (needle) {
      for (const app of applications) {
        if (!app.name?.toLowerCase().includes(needle)) continue;
        hits.push({ id: `app-${app.id}`, kind: "application", label: app.name, hint: "Application", icon: Package });
        if (hits.length >= 14) break;
      }
      if (canSeeLicenses) {
        for (const license of licenses) {
          const hay = `${license.license_key || ""} ${license.status || ""} ${license.variant_label || ""}`.toLowerCase();
          if (!hay.includes(needle)) continue;
          hits.push({
            id: `lic-${license.id}`,
            kind: "license",
            key: license.license_key,
            label: license.license_key,
            hint: `${license.status || "License"} · ${license.variant_label || "key"}`,
            icon: KeyRound,
          });
          if (hits.length >= 14) break;
        }
      }
      if (!reseller) {
        for (const entry of resellers) {
          const hay = `${entry.username || ""} ${entry.serviceName || ""} ${entry.discordId || ""}`.toLowerCase();
          if (!hay.includes(needle)) continue;
          hits.push({
            id: `res-${entry.id}`,
            kind: "reseller",
            resellerId: entry.id,
            label: entry.username || entry.serviceName || entry.discordId,
            hint: entry.serviceName && entry.username ? entry.serviceName : "Reseller",
            icon: Users,
          });
          if (hits.length >= 14) break;
        }
      }
      for (const entry of updates) {
        if (!String(entry.title || "").toLowerCase().includes(needle)) continue;
        hits.push({ id: `upd-${entry.id}`, kind: "update", label: entry.title, hint: "Update", icon: Bell });
        if (hits.length >= 14) break;
      }
    }
    return hits.slice(0, 12);
  }, [account, applications, licenses, reseller, resellers, searchText, updates]);

  useEffect(() => {
    setSearchIndex(0);
  }, [searchText, searchOpen]);

  const scratchKey = account?.id ? `se-scratch:${account.id}` : "";
  useEffect(() => {
    if (!scratchKey) {
      setScratch("");
      return undefined;
    }
    try {
      setScratch(window.localStorage.getItem(scratchKey) || "");
    } catch {
      setScratch("");
    }
    return undefined;
  }, [scratchKey]);

  function writeScratch(value) {
    setScratch(value);
    if (scratchTimer.current) window.clearTimeout(scratchTimer.current);
    scratchTimer.current = window.setTimeout(() => {
      try {
        if (scratchKey) window.localStorage.setItem(scratchKey, value);
        setScratchSaved(Date.now());
      } catch {
        // Notes stay in memory if storage is blocked.
      }
    }, 400);
  }

  if (!ready) {
    return (
      <main className={styles.auth}>
        <Loader2 className={styles.spin} size={22} />
      </main>
    );
  }

  if (!authed) {
    if (reseller) return null;
    return <LoginScreen />;
  }

  const editingApp = drawer?.type === "edit-app" ? applications.find((app) => app.id === drawer.app.id) || drawer.app : null;
  const selectedApp = applications.find((app) => app.id === licenseForm.applicationId);
  const selectedVariants = selectedApp?.variants || [];
  const selectedVariant = selectedVariants.find((variant) => variant.id === licenseForm.variantId);
  const orderCost = Math.round(Number(selectedVariant?.price || 0) * Number(licenseForm.quantity || 0) * 100) / 100;
  const listUnit = Number(selectedVariant?.listPrice);
  const listCost = Number.isFinite(listUnit) ? Math.round(listUnit * Number(licenseForm.quantity || 0) * 100) / 100 : null;
  const buyDiscount = Number(account?.discountPercent) || 0;
  const buySaved = listCost != null && listCost > orderCost + 0.001 ? Math.round((listCost - orderCost) * 100) / 100 : 0;
  const balanceShort = Number(account?.balance || 0) + 0.001 < orderCost;

  const profileName = reseller ? account?.username || account?.discordId || "Reseller" : email || "Admin";
  const accountInitial = (profileName || "A").trim().charAt(0).toUpperCase();
  const isHelper = account?.role === "Helper";
  const showLicenses = !isHelper || account?.permissions?.generate || account?.permissions?.resetHwid || account?.permissions?.ban;
  const allowGenerate = !isHelper || Boolean(account?.permissions?.generate);
  const allowReset = !isHelper || Boolean(account?.permissions?.resetHwid);
  const allowBan = !isHelper || Boolean(account?.permissions?.ban);
  const pulse = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const day = start.getTime();
    const soon = Date.now() + 86400000;
    const buckets = { fresh: 0, active: 0, expired: 0, banned: 0 };
    let createdToday = 0;
    let expiringSoon = 0;
    for (const license of licenses) {
      const created = new Date(license.created_at).getTime();
      if (Number.isFinite(created) && created >= day) createdToday += 1;
      if (license.status === "Banned") buckets.banned += 1;
      else if (license.status === "Expired") buckets.expired += 1;
      else if (license.status === "Active") {
        buckets.active += 1;
        const end = new Date(license.expires_at).getTime();
        if (Number.isFinite(end) && end > Date.now() && end <= soon) expiringSoon += 1;
      } else buckets.fresh += 1;
    }
    const total = Math.max(1, licenses.length);
    return { ...buckets, count: licenses.length, createdToday, expiringSoon, shares: {
      fresh: buckets.fresh / total,
      active: buckets.active / total,
      expired: buckets.expired / total,
      banned: buckets.banned / total,
    } };
  })();

  function openLicensePulse(status) {
    if (!showLicenses) return;
    setAppFilter("all");
    setQuery(status || "");
    setView("licenses");
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchIndex(0);
  }

  function pickSearch(item) {
    if (!item) return;
    playSound("nav");
    setSearchText("");
    closeSearch();
    if (item.kind === "page") {
      if (item.view === "updates") openUpdates();
      else setView(item.view);
      return;
    }
    if (item.kind === "application") {
      setView("applications");
      return;
    }
    if (item.kind === "license") {
      setAppFilter("all");
      setQuery(item.key || "");
      setView("licenses");
      return;
    }
    if (item.kind === "reseller" && item.resellerId) {
      goTo(`/admin/resellers/${item.resellerId}`);
      return;
    }
    if (item.kind === "update") openUpdates();
  }

  const hasUnreadUpdates =
    reseller &&
    view !== "updates" &&
    updates.some((entry) => new Date(entry.createdAt).getTime() > Number(updatesSeen || 0));
  const depositTopups = transactions.filter((entry) => entry.kind === "topup" && Number.isFinite(Number(entry.amount)));
  const depositedTotal = depositTopups.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const tierSince = Date.now() - DEPOSIT_TIER_DAYS * 86400000;
  const tierTotal = depositTopups
    .filter((entry) => entry.viaStripe && new Date(entry.createdAt).getTime() > tierSince)
    .reduce((sum, entry) => sum + Number(entry.paid ?? entry.amount), 0);
  const depositDraftValue = Number(depositDraft);
  const depositDraftOk = Number.isFinite(depositDraftValue) && depositDraftValue >= DEPOSIT_MIN && depositDraftValue <= DEPOSIT_MAX;

  async function startDeposit() {
    // Crypto and the public demo have no checkout yet, so they only show the preview receipt.
    if (demoPanelBase || (depositMethod !== "card" && depositMethod !== "crypto")) {
      setDepositPreview(true);
      return;
    }
    if (depositBusy || !depositDraftOk) return;
    setDepositBusy(true);
    try {
      const result = await resellerApi("/api/reseller/deposit", {
        method: "POST",
        body: JSON.stringify({ amount: depositAmount, method: depositMethod }),
      });
      if (!result.url) throw new Error("Could not open checkout.");
      window.location.href = result.url;
    } catch (err) {
      showError(err.message);
      setDepositBusy(false);
    }
  }

  function commitDeposit(value) {
    const next = clampDeposit(value);
    setDepositAmount(next);
    setDepositDraft(formatDepositDraft(next));
    setDepositPreview(false);
  }

  function addUpdateTag(tag) {
    setUpdateForm((current) => {
      if (current.tags.length >= UPDATE_TAG_MAX) return current;
      if (current.tags.some((entry) => entry.kind === tag.kind && entry.id === tag.id)) return current;
      return { ...current, tags: [...current.tags, tag] };
    });
    setTagQuery("");
    setTagOpen(true);
  }

  function addCustomAffect(rawName) {
    const name = String(rawName ?? customAffect.name).replace(/\s+/g, " ").trim().slice(0, UPDATE_CUSTOM_TAG_MAX_LENGTH);
    if (!name) return;
    const icon = customAffect.icon;
    let duplicate = false;
    let added = false;
    setUpdateForm((current) => {
      if (current.tags.some((entry) => entry.kind === "custom" && entry.name.toLowerCase() === name.toLowerCase())) {
        duplicate = true;
        return current;
      }
      if (current.tags.length >= UPDATE_TAG_MAX) return current;
      added = true;
      return { ...current, tags: [...current.tags, { kind: "custom", id: `custom-${Date.now()}`, name, icon }] };
    });
    if (duplicate) {
      showError("This affect is already added.");
      return;
    }
    if (added) {
      setCustomAffect((current) => ({ ...current, name: "" }));
      setTagQuery("");
    }
  }

  async function openUpdates() {
    setView("updates");
    try {
      const data = reseller ? await resellerApi("/api/reseller/data") : await api("/api/admin/updates");
      setUpdates(data.updates || []);
    } catch (err) {
      if (err.status === 401) {
        if (reseller) window.location.href = "/?error=session";
        return;
      }
      showError(err.message);
    }
  }

  function resetUpdateEditor() {
    setEditingUpdateId("");
    setUpdateForm({ title: "", description: "", badges: [emptyUpdateBadge()], tags: [] });
    setCustomAffect({ name: "", icon: UPDATE_TAG_ICONS[0] });
    setTagQuery("");
    setTagOpen(false);
  }

  function startEditUpdate(entry) {
    setEditingUpdateId(entry.id);
    setUpdateForm(formFromUpdate(entry));
    setCustomAffect({ name: "", icon: UPDATE_TAG_ICONS[0] });
    setTagQuery("");
    setTagOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("update-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function publishUpdate(event) {
    event.preventDefault();
    if (updateBusy) return;
    setUpdateBusy(true);
    try {
      const editing = Boolean(editingUpdateId);
      const data = await api("/api/admin/updates", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          id: editingUpdateId || undefined,
          title: updateForm.title,
          description: updateForm.description,
          badges: updateForm.badges,
          tags: updateForm.tags,
        }),
      });
      if (data.update) {
        setUpdates((current) => (editing
          ? current.map((entry) => (entry.id === data.update.id ? data.update : entry))
          : [data.update, ...current.filter((entry) => entry.id !== data.update.id)]));
      }
      resetUpdateEditor();
      showToast(editing ? "Update saved." : "Update published.", "ok");
    } catch (err) {
      showError(err.message);
    } finally {
      setUpdateBusy(false);
    }
  }

  async function deleteUpdate(id) {
    if (updateBusy) return;
    setUpdateBusy(true);
    try {
      await api("/api/admin/updates", { method: "DELETE", body: JSON.stringify({ id }) });
      setUpdates((current) => current.filter((entry) => entry.id !== id));
      if (editingUpdateId === id) resetUpdateEditor();
    } catch (err) {
      showError(err.message);
    } finally {
      setUpdateBusy(false);
    }
  }

  function setPanelTheme(nextTheme) {
    setTheme(nextTheme);
    window.localStorage.setItem("se-admin-theme", nextTheme);
  }

  function setCompactMode(nextValue) {
    setCompact(nextValue);
    window.localStorage.setItem("se-admin-compact", nextValue ? "1" : "0");
  }

  function pickLoaderFile(file) {
    if (file && !file.name.toLowerCase().endsWith(".exe")) {
      showError("Only .exe files can be uploaded.");
      setLoaderFile(null);
      return false;
    }
    setLoaderFile(file);
    return true;
  }

  function chooseLoaderFile(event) {
    if (!pickLoaderFile(event.target.files?.[0] || null)) event.target.value = "";
  }

  async function saveLoaderStatus(status) {
    setLoaderStatusBusy(true);
    try {
      const data = await api("/api/admin/loader", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setLoaderInfo(data.loader || null);
      const since = licenseFrozenSince || (loaderInfo?.status === "maintenance" ? loaderInfo.statusUpdatedAt : null);
      setLicenseFrozenSince(data.loader?.status === "maintenance" ? data.loader.statusUpdatedAt || new Date().toISOString() : null);
      const shiftMs = Number(data.resumed?.shiftMs) || 0;
      if (shiftMs > 0 && since) {
        const frozenAt = new Date(since).getTime();
        const shiftLicense = (license) => {
          const end = license.activated_at && license.expires_at ? new Date(license.expires_at).getTime() : NaN;
          return end > frozenAt ? { ...license, expires_at: new Date(end + shiftMs).toISOString() } : license;
        };
        setLicenses((current) => current.map(shiftLicense));
        setResellerLicenses((current) => current.map(shiftLicense));
      }
      showToast(
        status === "maintenance"
          ? "Loader set to maintenance. All licenses are frozen."
          : data.resumed?.shifted
            ? `Loader is online. ${data.resumed.shifted} license${data.resumed.shifted === 1 ? "" : "s"} unfrozen.`
            : "Loader is online.",
        "ok"
      );
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderStatusBusy(false);
    }
  }

  async function uploadLoaderFile() {
    if (!loaderFile) {
      showError("Choose a .exe file first.");
      return;
    }
    setLoaderBusy(true);
    try {
      const prepared = await api("/api/admin/loader", {
        method: "POST",
        body: JSON.stringify({ action: "prepare" }),
      });
      const client = browserClient();
      if (!client) throw new Error("Supabase public keys are missing.");
      const sent = await client.storage.from("loader").uploadToSignedUrl(prepared.path, prepared.token, loaderFile, {
        contentType: "application/octet-stream",
      });
      if (sent.error) throw new Error(sent.error.message || "Upload failed.");
      const data = await api("/api/admin/loader", {
        method: "POST",
        body: JSON.stringify({ action: "commit", path: prepared.path, fileName: loaderFile.name }),
      });
      setLoaderInfo(data.loader || null);
      if (data.loader?.version) setLoaderVersion(data.loader.version);
      setLoaderFile(null);
      if (loaderInputRef.current) loaderInputRef.current.value = "";
      showToast("Loader uploaded.", "ok");
    } catch (err) {
      if (err.status === 401) {
        window.localStorage.removeItem(SESSION_KEY);
        setAuthed(false);
        return;
      }
      showError(err.message);
    } finally {
      setLoaderBusy(false);
    }
  }

  async function saveLoaderVersion() {
    const version = loaderVersion.trim();
    if (!version) {
      showError("Enter a version.");
      return;
    }
    setLoaderBusy(true);
    try {
      const data = await api("/api/admin/loader", {
        method: "PATCH",
        body: JSON.stringify({ version }),
      });
      setLoaderInfo(data.loader || null);
      if (data.loader?.version) setLoaderVersion(data.loader.version);
      showToast("Version saved.", "ok");
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderBusy(false);
    }
  }

  async function addLoaderBlacklist() {
    const discordId = blacklistId.trim();
    if (!/^\d{15,22}$/.test(discordId)) {
      showError("Enter a Discord user ID.");
      return;
    }
    setLoaderBusy(true);
    try {
      const data = await api("/api/admin/loader/blacklist", {
        method: "POST",
        body: JSON.stringify({ discordId }),
      });
      setLoaderBlacklist(data.blacklist || []);
      setBlacklistId("");
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderBusy(false);
    }
  }

  async function removeLoaderBlacklist(discordId) {
    setLoaderBusy(true);
    try {
      const data = await api("/api/admin/loader/blacklist", {
        method: "DELETE",
        body: JSON.stringify({ discordId }),
      });
      setLoaderBlacklist(data.blacklist || []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderBusy(false);
    }
  }

  async function saveLoaderDownload(response, started) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not download the loader.");
    }
    const blob = await response.blob();
    const wait = 900 - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    saveBlobFile(blob, filenameFromDisposition(response.headers.get("Content-Disposition")));
  }

  async function downloadAdminLoader() {
    if (loaderDownloading) return;
    setLoaderDownloading(true);
    const started = Date.now();
    try {
      const token = await getAccessToken();
      if (!token) {
        window.localStorage.removeItem(SESSION_KEY);
        setAuthed(false);
        return;
      }
      const response = await fetch("/api/admin/loader/download", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      await saveLoaderDownload(response, started);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderDownloading(false);
    }
  }

  async function downloadCurrentLoader() {
    if (isHelper) return;
    if (!loaderStatusReady || loaderBusy || loaderDownloading) return;
    if (!loaderCurrent.hasBuild) {
      showError("Generate a loader before downloading the current one.");
      return;
    }
    if (!loaderUploaded) {
      showError("No loader has been uploaded yet.");
      return;
    }
    setLoaderDownloading(true);
    const started = Date.now();
    try {
      const response = await fetch("/api/reseller/loader", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadCurrent: true }),
      });
      await saveLoaderDownload(response, started);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoaderDownloading(false);
    }
  }

  async function generateLoader() {
    if (isHelper) return null;
    const primary = loaderPrimary.trim();
    const secondary = loaderSecondary.trim();
    if (!primary) {
      showError("Enter primary text.");
      return null;
    }
    if (!/^#[0-9A-F]{6}$/.test(loaderColor)) {
      showError("Pick a color.");
      return null;
    }
    if (!loaderStatusReady) return null;
    if (!loaderUploaded) {
      showError("No loader has been uploaded yet.");
      return null;
    }
    setLoaderBusy(true);
    const logoAction = loaderLogoCleared ? "clear" : loaderLogoFile ? "replace" : "keep";
    try {
      const body = new FormData();
      body.append("primary", primary);
      body.append("secondary", secondary);
      body.append("color", loaderColor);
      body.append("logoAction", logoAction);
      if (loaderLogoFile) body.append("logo", loaderLogoFile);
      const response = await fetch("/api/reseller/loader", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not generate the loader.");
      }
      const blob = await response.blob();
      const nextHasLogo = logoAction === "clear" ? false : logoAction === "replace" || loaderHasLogo;
      const generatedAt = new Date().toISOString();
      if (loaderLogoPreview.startsWith("blob:")) URL.revokeObjectURL(loaderLogoPreview);
      setLoaderLogoFile(null);
      setLoaderLogoPreview("");
      setLoaderLogoCleared(false);
      setLoaderHasLogo(nextHasLogo);
      setLoaderLogoVersion(generatedAt);
      setLoaderCurrent((current) => ({
        ...current,
        primary,
        secondary,
        color: loaderColor,
        generatedAt,
        hasBuild: true,
        hasLogo: nextHasLogo,
      }));
      return { blob, filename: filenameFromDisposition(response.headers.get("Content-Disposition")) };
    } catch (err) {
      showError(err.message);
      return null;
    } finally {
      setLoaderBusy(false);
    }
  }

  return (
    <LicenseFreezeContext.Provider value={licenseFrozenSince}>
    <div className={`${styles.shell}${theme === "light" ? ` ${styles.themeLight}` : ""}${compact ? ` ${styles.compact}` : ""}${navOpen ? ` ${styles.navOpen}` : ""}`}>
      {infoLicense ? (
        <LicenseInfo
          license={infoLicense}
          appName={appsById.get(infoLicense.application_id)?.name}
          resellerName={infoLicense.reseller_id && resellers.length ? (() => {
            const owner = resellers.find((entry) => entry.id === infoLicense.reseller_id);
            return owner?.username || owner?.service_name || owner?.serviceName || "";
          })() : undefined}
          light={theme === "light"}
          onClose={closeLicenseInfo}
        />
      ) : null}
      <header className={styles.topbar}>
        <button
          className={`${styles.menuBtn}${navOpen ? ` ${styles.menuBtnOn}` : ""}`}
          type="button"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Link href="/" className={styles.brand} aria-label="ScriptEngine">
          <img
            className={styles.brandLogo}
            src={theme === "light" ? "/images/scriptengine-logo-light.png" : "/images/scriptengine-logo.png"}
            alt="ScriptEngine"
          />
        </Link>
        <OmniSearch
          value={searchText}
          open={searchOpen}
          active={searchIndex}
          results={searchResults}
          onChange={setSearchText}
          onOpen={() => setSearchOpen(true)}
          onClose={closeSearch}
          onActive={setSearchIndex}
          onPick={pickSearch}
        />
        <div className={styles.topRight}>
          <time className={styles.topClock} dateTime={clock.toISOString()}>
            {clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
          <span
            className={`${styles.topConn}${connection.online ? (connection.latency > 400 ? ` ${styles.topConnSlow}` : ` ${styles.topConnOn}`) : ` ${styles.topConnOff}`}`}
            title={connection.online ? (connection.latency != null ? `API ${connection.latency} ms` : "Connected") : "No connection"}
          >
            {connection.online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connection.online ? (connection.latency != null ? `${connection.latency} ms` : "Online") : "Offline"}
          </span>
          <a
            className={styles.topSite}
            href="https://scriptengine.gg/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open scriptengine.gg"
          >
            <Globe size={13} />
            <span>scriptengine.gg</span>
          </a>
          <button
            className={`${styles.soundToggle}${soundOn ? "" : ` ${styles.soundToggleOff}`}`}
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? "Mute sounds" : "Turn sounds on"}
            title={soundOn ? "Mute sounds" : "Turn sounds on"}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <div className={styles.topTheme} role="group" aria-label="Theme">
            <span className={`${styles.topThemeThumb}${theme === "light" ? ` ${styles.topThemeThumbLight}` : ""}`} />
            <button
              type="button"
              aria-label="Dark theme"
              aria-pressed={theme === "dark"}
              className={theme === "dark" ? styles.topThemeOn : ""}
              onClick={() => setPanelTheme("dark")}
            >
              <Moon size={13} />
            </button>
            <button
              type="button"
              aria-label="Light theme"
              aria-pressed={theme === "light"}
              className={theme === "light" ? styles.topThemeOn : ""}
              onClick={() => setPanelTheme("light")}
            >
              <Sun size={13} />
            </button>
          </div>
          <button
            className={`${styles.soundToggle} ${styles.topLogout}`}
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
        {loading || loaderBusy || loaderDownloading || loaderStatusBusy ? <span className={styles.topProgress} aria-hidden="true" /> : null}
      </header>
      <div className={styles.body}>
        <button className={styles.navBackdrop} type="button" aria-label="Close menu" tabIndex={navOpen ? 0 : -1} onClick={() => setNavOpen(false)} />
        <aside className={styles.sidebar}>
          <nav
            ref={setNavEl}
            className={`${styles.nav} ${styles.navTracked}`}
            onMouseOver={trackNavHover}
            onMouseLeave={() => setNavHover((current) => (current ? { ...current, on: false } : null))}
          >
            {navMark ? (
              <span
                className={`${styles.navIndicator}${navAnimate ? "" : ` ${styles.navIndicatorInstant}`}`}
                style={{ transform: `translateY(${navMark.y}px)`, height: navMark.h }}
                aria-hidden="true"
              />
            ) : null}
            {navHover ? (
              <span
                className={`${styles.navHover}${navHover.on ? ` ${styles.navHoverOn}` : ""}`}
                style={{ transform: `translateY(${navHover.y}px)`, height: navHover.h }}
                aria-hidden="true"
              />
            ) : null}
            <div className={styles.navGroup}>
              <i className={styles.navGroupIcon} aria-hidden="true"><House size={12} /></i>
              <span className={styles.navGroupLine} aria-hidden="true" />
              <span className={styles.navGroupName}>Main</span>
            </div>
            <button
              className={`${styles.navItem} ${view === "links" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => setView("links")}
            >
              <Link2 size={15} />
              <span className={styles.navItemLabel}>Quick Links</span>
            </button>
            <button
              className={`${styles.navItem} ${view === "faq" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => setView("faq")}
            >
              <HelpCircle size={15} />
              <span className={styles.navItemLabel}>FAQ</span>
            </button>
            <div className={styles.navGroup}>
              <i className={styles.navGroupIcon} aria-hidden="true"><Layers size={12} /></i>
              <span className={styles.navGroupLine} aria-hidden="true" />
              <span className={styles.navGroupName}>Dashboard</span>
            </div>
            <button
              className={`${styles.navItem} ${view === "applications" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => setView("applications")}
            >
              <LayoutGrid size={15} />
              <span className={styles.navItemLabel}>Applications</span>
            </button>
            {showLicenses ? (
            <button
              className={`${styles.navItem} ${view === "licenses" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => setView("licenses")}
            >
              <KeyRound size={15} />
              <span className={styles.navItemLabel}>Licenses</span>
            </button>
            ) : null}
            <div className={styles.navGroup}>
              <i className={styles.navGroupIcon} aria-hidden="true"><Ellipsis size={12} /></i>
              <span className={styles.navGroupLine} aria-hidden="true" />
              <span className={styles.navGroupName}>Other</span>
            </div>
            <button
              className={`${styles.navItem} ${view === "updates" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => openUpdates()}
            >
              <span className={styles.navIconWrap}>
                <Bell size={15} />
                {hasUnreadUpdates ? <span className={styles.navUnreadDot} aria-label="New updates" /> : null}
              </span>
              <span className={styles.navItemLabel}>Updates</span>
            </button>
            {reseller ? (
              <button
                className={`${styles.navItem} ${view === "deposit" ? styles.navItemActive : ""}`}
                type="button"
                onClick={() => setView("deposit")}
              >
                <Wallet size={15} />
                <span className={styles.navItemLabel}>Deposit</span>
              </button>
            ) : (
              <button
                className={`${styles.navItem} ${view === "resellers" || view === "reseller-licenses" ? styles.navItemActive : ""}`}
                type="button"
                onClick={() => setView("resellers")}
              >
                <Users size={15} />
                <span className={styles.navItemLabel}>Resellers</span>
              </button>
            )}
            {reseller ? (
              <button
                className={`${styles.navItem} ${view === "transactions" ? styles.navItemActive : ""}`}
                type="button"
                onClick={() => setView("transactions")}
              >
                <ArrowLeftRight size={15} />
                <span className={styles.navItemLabel}>Transactions</span>
              </button>
            ) : null}
            {reseller && account?.teamManagement ? (
              <button
                className={`${styles.navItem} ${view === "team" ? styles.navItemActive : ""}`}
                type="button"
                onClick={() => setView("team")}
              >
                <Users size={15} />
                <span className={styles.navItemLabel}>Team</span>
              </button>
            ) : null}
            <div className={styles.navGroup}>
              <i className={styles.navGroupIcon} aria-hidden="true"><SlidersHorizontal size={12} /></i>
              <span className={styles.navGroupLine} aria-hidden="true" />
              <span className={styles.navGroupName}>Settings</span>
            </div>
            {reseller && isHelper ? null : (
              <button
                className={`${styles.navItem} ${view === "loader" ? styles.navItemActive : ""}`}
                type="button"
                onClick={() => setView("loader")}
              >
                <Download size={15} />
                <span className={styles.navItemLabel}>Loader</span>
              </button>
            )}
            <button
              className={`${styles.navItem} ${view === "settings" ? styles.navItemActive : ""}`}
              type="button"
              onClick={() => setView("settings")}
            >
              <Settings size={15} />
              <span className={styles.navItemLabel}>Settings</span>
            </button>
          </nav>
          <div className={styles.sidebarFoot}>
            <div className={styles.sidebarUserCard}>
              {account?.avatarUrl ? (
                <img className={styles.sidebarUserAvatar} src={account.avatarUrl} alt="" />
              ) : (
                <span className={styles.sidebarUserAvatar} aria-hidden="true">{accountInitial}</span>
              )}
              <div className={styles.sidebarUserMeta}>
                <strong className={styles.sidebarUserName}>{profileName}</strong>
                <span className={styles.sidebarUserBalance}>
                  {reseller ? (
                    <>
                      Balance: <span className={styles.sidebarUserBalanceValue}>{formatPrice(account?.balance)}</span>
                    </>
                  ) : (
                    "Administrator"
                  )}
                </span>
                {reseller ? (
                  <span className={styles.sidebarUserBalance}>
                    Discount: <span className={styles.sidebarUserBalanceValue}>{Number(account?.discountPercent) || 0}%</span>
                  </span>
                ) : null}
              </div>
              <button className={styles.sidebarUserLogout} type="button" aria-label="Sign out" onClick={signOut}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <main key={view} className={`${styles.content} ${styles.viewEnter}`}>
          {error ? <div className={styles.banner}>{error}</div> : null}

          {view === "links" ? (
            <QuickLinksView
              reseller={reseller}
              isHelper={isHelper}
              showLicenses={showLicenses}
              showTeam={Boolean(reseller && account?.teamManagement)}
              onOpen={(next) => (next === "updates" ? openUpdates() : setView(next))}
            />
          ) : view === "faq" ? (
            <FaqView reseller={reseller} onOpen={(next) => (next === "updates" ? openUpdates() : setView(next))} />
          ) : view === "applications" ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Applications</h1>
                  <p>{reseller ? "Products you are allowed to sell." : "Update the name, version, and status of each product."}</p>
                </div>
              </div>
              {reseller ? null : (
                <>
                  <ApplicationActionDock count={applications.length} onCreate={openCreate} />
                  <ApplicationGuideDock light={theme === "light"} />
                </>
              )}
              <section className={styles.panel}>
                {loading && !applications.length ? <div className={styles.empty}>Loading applications…</div> : null}
                {!loading && !applications.length ? (
                  <div className={styles.empty}>No applications yet. Create the first product to start generating keys.</div>
                ) : null}
                {applications.length ? (
                  <table className={`${styles.table} ${styles.tableApps}${reseller ? ` ${styles.tableReadOnly}` : ""}`}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>APP ID</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Variants</th>
                        <th>Licenses</th>
                        <th>Access</th>
                        <th>Created</th>
                        <th>Pricing</th>
                        {reseller ? null : <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => (
                        <tr key={app.id}>
                          <td>{app.name}</td>
                          <td>
                            <AppIdButton value={app.app_id} />
                          </td>
                          <td className={styles.muted}>{app.version}</td>
                          <td>
                            {licenseFrozenSince ? (
                              <span className={`${styles.status} ${styles.statusFrozen}`} title="Licenses are frozen while the loader is under maintenance">
                                <Snowflake size={11} />
                                Frozen
                              </span>
                            ) : (
                            <span className={`${styles.status} ${statusClass(app.status)}`}>{app.status}</span>
                            )}
                          </td>
                          <td>{app.variants?.length || 0}</td>
                          <td>{licenses.filter((license) => license.application_id === app.id).length}</td>
                          <td>
                            <span className={`${styles.status} ${app.keys_locked ? styles.statusBanned : styles.statusActive}`}>
                              {app.keys_locked ? "Locked" : "Available"}
                            </span>
                          </td>
                          <td className={styles.muted}>{formatDate(app.created_at)}</td>
                          <td>{formatPriceRange(app.variants)}</td>
                          {reseller ? null : (
                            <td className={styles.actionsCell}>
                              <div className={styles.actions}>
                                <button className={styles.secondary} type="button" onClick={() => openEdit(app)}>
                                  <Pencil size={13} />
                                  Edit
                                </button>
                                <a className={styles.secondary} href="https://scriptengine.gg/guide" target="_blank" rel="noopener noreferrer">
                                  <BookOpen size={13} />
                                  Instructions
                                </a>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </section>
            </>
          ) : view === "licenses" ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Licenses</h1>
                  <p>{reseller ? "Buy licenses with your balance. Only keys you bought are listed." : "Keys you generate. Reseller purchases stay on each reseller."}</p>
                </div>
              </div>
              {allowGenerate ? (
                <LicenseActionDock
                  reseller={reseller}
                  balance={account?.balance}
                  disabled={!applications.some((app) => !app.keys_locked)}
                  onBuy={openGenerate}
                />
              ) : null}
              <LicenseMetrics metrics={metrics} />
              <div className={styles.toolbar}>
                <select className={styles.field} value={appFilter} onChange={(event) => setAppFilter(event.target.value)}>
                  <option value="all">All applications</option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
                <input
                  className={`${styles.field} ${styles.search}`}
                  value={query}
                  placeholder="Search key, status, variant"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <section className={styles.panel}>
                {!visibleLicenses.length ? (
                  <div className={styles.empty}>{loading ? "Loading licenses…" : "No licenses match this view."}</div>
                ) : (
                  <table className={`${styles.table} ${styles.tableLicenses}${reseller ? ` ${styles.tableResellerLicenses}` : ""}`}>
                    <thead>
                      <tr>
                        <th>License</th>
                        <th>Application</th>
                        <th>Variant</th>
                        <th>Length</th>
                        <th>Status</th>
                        <th>HWID</th>
                        <th>Expires in</th>
                        <th>Activated at</th>
                        <th>Created</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLicenses.map((license) => {
                        const banned = license.status === "Banned";
                        return (
                          <tr key={license.id}>
                            <td className={styles.key}>{license.license_key}</td>
                            <td>{appsById.get(license.application_id)?.name || "—"}</td>
                            <td>{license.variant_label || "—"}</td>
                            <td className={styles.muted}>{formatDuration(license.duration_value, license.duration_unit)}</td>
                            <td>
                              <span className={`${styles.status} ${statusClass(license.status)}`}>{license.status}</span>
                            </td>
                            <td className={styles.muted}>{license.hwid ? "Locked" : "—"}</td>
                            <td className={styles.muted}><ExpiresIn license={license} /></td>
                            <td className={styles.muted}>{license.activated_at ? formatDate(license.activated_at) : "—"}</td>
                            <td className={styles.muted}>{formatDate(license.created_at)}</td>
                            <td className={styles.actionsCell}>
                              <div className={styles.actions}>
                                <button
                                  className={styles.iconButton}
                                  type="button"
                                  aria-label="Copy key"
                                  onClick={() => copyText(license.license_key, license.id)}
                                >
                                  {copiedId === license.id ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                                </button>
                                <button className={styles.iconButton} type="button" aria-label="License information" onClick={() => setInfoLicenseId(license.id)}>
                                  <Info size={14} />
                                </button>
                                {allowReset ? (
                                <button
                                  className={styles.iconButton}
                                  type="button"
                                  aria-label="Reset HWID"
                                  onClick={() => licenseAction(license.id, "reset_hwid")}
                                >
                                  <RotateCcw size={14} />
                                </button>
                                ) : null}
                                {allowBan ? (
                                <button
                                  className={styles.iconButton}
                                  type="button"
                                  aria-label={banned ? "Unban license" : "Ban license"}
                                  onClick={() => licenseAction(license.id, banned ? "unban" : "ban")}
                                >
                                  <Ban size={14} />
                                </button>
                                ) : null}
                                {reseller ? null : (
                                  <button
                                    className={styles.iconButton}
                                    type="button"
                                    aria-label="Delete license"
                                    onClick={() => licenseAction(license.id, "delete")}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : view === "reseller-licenses" && !reseller && !inspectedReseller ? (
            <div className={styles.empty}>{loading ? "Loading licenses…" : "Reseller not found."}</div>
          ) : view === "reseller-licenses" && inspectedReseller && !reseller ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>{inspectedReseller.username || inspectedReseller.discordId}</h1>
                  <p>Licenses bought by this reseller. Balance {formatPrice(inspectedReseller.balance)}.</p>
                </div>
                <button className={styles.secondary} type="button" onClick={() => setView("resellers")}>
                  Back
                </button>
              </div>
              <LicenseMetrics metrics={resellerMetrics} />
              <div className={styles.toolbar}>
                <select className={styles.field} value={resellerAppFilter} onChange={(event) => setResellerAppFilter(event.target.value)}>
                  <option value="all">All applications</option>
                  {(inspectedReseller.applicationIds || []).map((id) => (
                    <option key={id} value={id}>
                      {appsById.get(id)?.name || id}
                    </option>
                  ))}
                </select>
                <input
                  className={`${styles.field} ${styles.search}`}
                  value={resellerQuery}
                  placeholder="Search key, status, variant"
                  onChange={(event) => setResellerQuery(event.target.value)}
                />
              </div>
              <section className={styles.panel}>
                {!visibleResellerLicenses.length ? (
                  <div className={styles.empty}>{loading ? "Loading licenses…" : "No licenses match this view."}</div>
                ) : (
                  <table className={`${styles.table} ${styles.tableLicenses}`}>
                    <thead>
                      <tr>
                        <th>License</th>
                        <th>Application</th>
                        <th>Variant</th>
                        <th>Length</th>
                        <th>Status</th>
                        <th>HWID</th>
                        <th>Expires in</th>
                        <th>Activated at</th>
                        <th>Created</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResellerLicenses.map((license) => {
                        const banned = license.status === "Banned";
                        return (
                          <tr key={license.id}>
                            <td className={styles.key}>{license.license_key}</td>
                            <td>{appsById.get(license.application_id)?.name || "—"}</td>
                            <td>{license.variant_label || "—"}</td>
                            <td className={styles.muted}>{formatDuration(license.duration_value, license.duration_unit)}</td>
                            <td>
                              <span className={`${styles.status} ${statusClass(license.status)}`}>{license.status}</span>
                            </td>
                            <td className={styles.muted}>{license.hwid ? "Locked" : "—"}</td>
                            <td className={styles.muted}><ExpiresIn license={license} /></td>
                            <td className={styles.muted}>{license.activated_at ? formatDate(license.activated_at) : "—"}</td>
                            <td className={styles.muted}>{formatDate(license.created_at)}</td>
                            <td className={styles.actionsCell}>
                              <div className={styles.actions}>
                                <button className={styles.iconButton} type="button" aria-label="Copy key" onClick={() => copyText(license.license_key, license.id)}>
                                  {copiedId === license.id ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                                </button>
                                <button className={styles.iconButton} type="button" aria-label="License information" onClick={() => setInfoLicenseId(license.id)}>
                                  <Info size={14} />
                                </button>
                                <button className={styles.iconButton} type="button" aria-label="Reset HWID" onClick={() => licenseAction(license.id, "reset_hwid")}>
                                  <RotateCcw size={14} />
                                </button>
                                <button
                                  className={styles.iconButton}
                                  type="button"
                                  aria-label={banned ? "Unban license" : "Ban license"}
                                  onClick={() => licenseAction(license.id, banned ? "unban" : "ban")}
                                >
                                  <Ban size={14} />
                                </button>
                                <button className={styles.iconButton} type="button" aria-label="Delete license" onClick={() => licenseAction(license.id, "delete")}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : view === "updates" ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Updates</h1>
                  <p>{reseller ? "Messages from the administrator." : editingUpdateId ? "Editing an existing message. Resellers will see the new version." : "Publish a message for every reseller."}</p>
                </div>
              </div>
              {reseller ? null : (
                <form id="update-editor" className={`${styles.settingsCard}${editingUpdateId ? ` ${styles.updateEditorOn}` : ""}`} onSubmit={publishUpdate}>
                  <div className={styles.group}>
                    <label htmlFor="update-title">Title</label>
                    <input
                      id="update-title"
                      value={updateForm.title}
                      maxLength={120}
                      disabled={updateBusy}
                      onChange={(event) => setUpdateForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Maintenance tonight"
                      required
                    />
                  </div>
                  <div className={styles.group}>
                    <label htmlFor="update-description">Description</label>
                    <textarea
                      id="update-description"
                      value={updateForm.description}
                      maxLength={4000}
                      disabled={updateBusy}
                      onChange={(event) => setUpdateForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Write the message…"
                      required
                    />
                  </div>
                  <div className={styles.updateBadgeEditor}>
                    <div className={styles.updateRow}>
                      <label>Badges (optional, max {UPDATE_BADGE_MAX})</label>
                      <button
                        className={styles.secondary}
                        type="button"
                        disabled={updateBusy || updateForm.badges.length >= UPDATE_BADGE_MAX}
                        onClick={() =>
                          setUpdateForm((current) => ({
                            ...current,
                            badges: current.badges.length >= UPDATE_BADGE_MAX ? current.badges : [...current.badges, emptyUpdateBadge()],
                          }))
                        }
                      >
                        <Plus size={14} />
                        Add badge
                      </button>
                    </div>
                    {updateForm.badges.map((badge, index) => (
                      <div className={styles.updateBadgeDraft} key={`badge-${index}`}>
                        <div className={styles.group}>
                          <label htmlFor={`update-badge-${index}`}>Badge word</label>
                          <input
                            id={`update-badge-${index}`}
                            value={badge.label}
                            maxLength={24}
                            disabled={updateBusy}
                            placeholder="NEW"
                            onChange={(event) => {
                              const nextLabel = event.target.value;
                              setUpdateForm((current) => ({
                                ...current,
                                badges: current.badges.map((item, itemIndex) => (itemIndex === index ? { ...item, label: nextLabel } : item)),
                              }));
                            }}
                          />
                        </div>
                        <div className={styles.group}>
                          <label>Badge color</label>
                          <div className={styles.updateSwatches}>
                            {UPDATE_BADGE_COLORS.map((color) => (
                              <button
                                key={`${index}-${color.id}`}
                                className={`${styles.updateSwatch}${badge.color === color.value ? ` ${styles.updateSwatchOn}` : ""}`}
                                style={{ background: color.value }}
                                type="button"
                                title={color.label}
                                aria-label={color.label}
                                disabled={updateBusy}
                                onClick={() =>
                                  setUpdateForm((current) => ({
                                    ...current,
                                    badges: current.badges.map((item, itemIndex) => (itemIndex === index ? { ...item, color: color.value } : item)),
                                  }))
                                }
                              />
                            ))}
                          </div>
                        </div>
                        <div className={styles.updateRow}>
                          {badge.label.trim() ? (
                            <span className={styles.updateBadge} style={{ background: badge.color }}>{badge.label.trim()}</span>
                          ) : (
                            <span className={styles.muted}>Empty badge</span>
                          )}
                          {updateForm.badges.length > 1 ? (
                            <button
                              className={styles.secondary}
                              type="button"
                              disabled={updateBusy}
                              onClick={() =>
                                setUpdateForm((current) => ({
                                  ...current,
                                  badges: current.badges.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.group}>
                    <label htmlFor="update-tag">Affects</label>
                    <span className={styles.affectHint}>Tag a product or variant, or add your own affect with an icon.</span>
                    <div className={styles.updateTagField}>
                      <input
                        id="update-tag"
                        value={tagQuery}
                        disabled={updateBusy || updateForm.tags.length >= UPDATE_TAG_MAX}
                        placeholder={updateForm.tags.length >= UPDATE_TAG_MAX ? "Tag limit reached" : "Search products, variants, or type a custom affect"}
                        onFocus={() => setTagOpen(true)}
                        onBlur={() => setTagOpen(false)}
                        onChange={(event) => {
                          setTagQuery(event.target.value);
                          setTagOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const first = tagSuggestions[0];
                          if (!first) return;
                          if (first.kind === "custom") addCustomAffect(first.name);
                          else addUpdateTag(first);
                        }}
                      />
                      {tagOpen && tagSuggestions.length ? (
                        <div className={styles.updateSuggest}>
                          {tagSuggestions.map((tag) => {
                            const Icon = affectIcon(tag);
                            return (
                            <button
                              key={`${tag.kind}:${tag.id}`}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => (tag.kind === "custom" ? addCustomAffect(tag.name) : addUpdateTag(tag))}
                            >
                              <span className={styles.updateSuggestLabel}>
                                <Icon size={13} />
                                {tag.kind === "variant" ? `${tag.applicationName} / ${tag.name}` : tag.name}
                              </span>
                              <span className={styles.updateSuggestKind}>{tag.hint}</span>
                            </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.affectCustom}>
                      <span className={styles.affectCustomTitle}>Custom affect</span>
                      <div className={styles.affectIcons} role="radiogroup" aria-label="Affect icon">
                        {UPDATE_TAG_ICONS.map((iconId) => {
                          const Icon = TAG_ICON_COMPONENTS[iconId] || Tag;
                          const on = customAffect.icon === iconId;
                          return (
                            <button
                              key={iconId}
                              className={`${styles.affectIcon}${on ? ` ${styles.affectIconOn}` : ""}`}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={TAG_ICON_LABELS[iconId] || iconId}
                              title={TAG_ICON_LABELS[iconId] || iconId}
                              disabled={updateBusy}
                              onClick={() => setCustomAffect((current) => ({ ...current, icon: iconId }))}
                            >
                              <Icon size={14} />
                            </button>
                          );
                        })}
                      </div>
                      <div className={styles.affectAddRow}>
                        <span className={styles.affectPreview} aria-hidden="true">
                          {(() => {
                            const Icon = TAG_ICON_COMPONENTS[customAffect.icon] || Tag;
                            return <Icon size={14} />;
                          })()}
                        </span>
                        <input
                          value={customAffect.name}
                          maxLength={UPDATE_CUSTOM_TAG_MAX_LENGTH}
                          disabled={updateBusy || updateForm.tags.length >= UPDATE_TAG_MAX}
                          placeholder={updateForm.tags.length >= UPDATE_TAG_MAX ? "Tag limit reached" : "e.g. Windows 11, Anti-cheat, Overlay"}
                          onChange={(event) => setCustomAffect((current) => ({ ...current, name: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addCustomAffect();
                            }
                          }}
                        />
                        <button
                          className={styles.secondary}
                          type="button"
                          disabled={updateBusy || !customAffect.name.trim() || updateForm.tags.length >= UPDATE_TAG_MAX}
                          onClick={addCustomAffect}
                        >
                          <Plus size={14} />
                          Add
                        </button>
                      </div>
                    </div>
                    {updateForm.tags.length ? (
                      <div className={styles.updateTags}>
                        {updateForm.tags.map((tag) => (
                          <AffectChip tag={tag} key={`${tag.kind}:${tag.id}`}>
                            <button
                              type="button"
                              aria-label="Remove tag"
                              disabled={updateBusy}
                              onClick={() =>
                                setUpdateForm((current) => ({
                                  ...current,
                                  tags: current.tags.filter((entry) => !(entry.kind === tag.kind && entry.id === tag.id)),
                                }))
                              }
                            >
                              <X size={12} />
                            </button>
                          </AffectChip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.updateSaveRow}>
                    {editingUpdateId ? (
                      <button className={styles.secondary} type="button" disabled={updateBusy} onClick={resetUpdateEditor}>
                        Cancel
                      </button>
                    ) : null}
                  <button className={styles.primary} type="submit" disabled={updateBusy || !updateForm.title.trim() || !updateForm.description.trim()}>
                      {updateBusy ? <Loader2 className={styles.spin} size={14} /> : editingUpdateId ? <Pencil size={14} /> : null}
                      {editingUpdateId ? "Save changes" : "Publish update"}
                  </button>
                  </div>
                </form>
              )}
              <UpdateFeed
                updates={updates}
                loading={loading}
                reseller={reseller}
                newSince={updatesNewSince}
                busy={updateBusy}
                editingId={editingUpdateId}
                onEdit={startEditUpdate}
                onDelete={deleteUpdate}
              />
            </>
          ) : view === "deposit" && reseller ? (
            <DepositScreen
              balance={account?.balance}
              amount={depositAmount}
              draft={depositDraft}
              draftOk={depositDraftOk}
              method={depositMethod}
              preview={depositPreview}
              topups={depositTopups}
              depositedTotal={depositedTotal}
              onAmount={commitDeposit}
              onDraft={(value) => {
                setDepositDraft(value);
                const next = Number(value);
                if (Number.isFinite(next) && next >= DEPOSIT_MIN && next <= DEPOSIT_MAX) {
                  setDepositAmount(Math.round(next * 100) / 100);
                  setDepositPreview(false);
                }
              }}
              onCommitDraft={() => commitDeposit(depositDraft)}
              onMethod={(value) => {
                setDepositMethod(value);
                setDepositPreview(false);
              }}
              onPreview={startDeposit}
              busy={depositBusy}
              discount={account?.discountPercent}
              tierTotal={tierTotal}
              onClearPreview={() => setDepositPreview(false)}
            />
          ) : view === "transactions" && reseller ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Transactions</h1>
                  <p>
                    {transactionsReady
                      ? "Licenses bought on this account and balance top-ups."
                      : "Licenses bought on this account. Run supabase/migrate-transactions.sql to store top-ups."}
                  </p>
                </div>
              </div>
              <section className={styles.panel}>
                {!transactions.length ? (
                  <div className={styles.empty}>{loading ? "Loading transactions…" : "No transactions yet."}</div>
                ) : (
                  <table className={`${styles.table} ${styles.tableTransactions} ${styles.tableReadOnly}`}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Details</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((entry) => {
                        const topup = entry.kind === "topup";
                        const detail = [entry.applicationName, entry.variantLabel].filter(Boolean).join(" · ");
                        const amountKnown = entry.amount != null && Number.isFinite(Number(entry.amount));
                        return (
                          <tr key={entry.id}>
                            <td className={styles.muted}>{formatDate(entry.createdAt)}</td>
                            <td>
                              <span className={`${styles.status} ${topup ? styles.statusTopup : styles.statusLicense}`}>
                                {topup ? "Top-up" : "License"}
                              </span>
                            </td>
                            <td>
                              {topup ? (
                                entry.bonus > 0 ? `Account top-up (incl. ${formatPrice(entry.bonus)} crypto bonus)` : "Account top-up"
                              ) : (
                                <div className={styles.txDetail}>
                                  <span>{detail || "License"}</span>
                                  {entry.licenseKey ? <span className={styles.key}>{entry.licenseKey}</span> : null}
                                </div>
                              )}
                            </td>
                            <td className={topup ? styles.amountIn : styles.amountOut}>
                              {amountKnown ? `${topup ? "+" : "−"}${formatPrice(entry.amount)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : view === "loader" && !(reseller && isHelper) ? (
            reseller ? (
              <LoaderResellerScreen
                light={theme === "light"}
                blacklisted={loaderBlacklisted}
                current={loaderCurrent}
                licenses={licenses}
                primary={loaderPrimary}
                secondary={loaderSecondary}
                color={loaderColor}
                logoSrc={loaderLogoPreview || (loaderLogoCleared || !loaderHasLogo ? "/images/loader-mark.png" : `/api/reseller/loader/logo?v=${encodeURIComponent(loaderLogoVersion)}`)}
                savedLogo={loaderCurrent.hasLogo ? `/api/reseller/loader/logo?v=${encodeURIComponent(loaderCurrent.generatedAt || loaderLogoVersion)}` : "/images/loader-mark.png"}
                busy={loaderBusy}
                downloading={loaderDownloading}
                ready={loaderStatusReady}
                onPrimary={setLoaderPrimary}
                onSecondary={setLoaderSecondary}
                onColor={setLoaderColor}
                onLogo={(file) => {
                  if (!file) return;
                  if (file.size > 4 * 1024 * 1024) {
                    showError("Logo must be 4 MB or smaller.");
                    return;
                  }
                  setLoaderLogoPreview((current) => {
                    if (current.startsWith("blob:")) URL.revokeObjectURL(current);
                    return URL.createObjectURL(file);
                  });
                  setLoaderLogoFile(file);
                  setLoaderLogoCleared(false);
                }}
                onLogoClear={() => {
                  setLoaderLogoPreview((current) => {
                    if (current.startsWith("blob:")) URL.revokeObjectURL(current);
                    return "";
                  });
                  setLoaderLogoFile(null);
                  setLoaderLogoCleared(true);
                }}
                onGenerate={generateLoader}
                onDownload={downloadCurrentLoader}
              />
            ) : (
              <LoaderAdminScreen
                info={loaderInfo}
                light={theme === "light"}
                version={loaderVersion}
                blacklist={loaderBlacklist}
                resellers={resellers}
                discordId={blacklistId}
                file={loaderFile}
                busy={loaderBusy}
                statusBusy={loaderStatusBusy}
                downloading={loaderDownloading}
                onDownload={downloadAdminLoader}
                onVersion={setLoaderVersion}
                onSaveVersion={saveLoaderVersion}
                onStatus={saveLoaderStatus}
                onDiscordId={setBlacklistId}
                onFile={{ ref: loaderInputRef, change: chooseLoaderFile, drop: pickLoaderFile }}
                onUpload={uploadLoaderFile}
                onAdd={addLoaderBlacklist}
                onRemove={removeLoaderBlacklist}
              />
            )
          ) : view === "resellers" && !reseller ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Resellers</h1>
                  <p>Add a Discord user ID, choose applications, and set the balance they spend on licenses.</p>
                </div>
                <button className={styles.primary} type="button" onClick={() => openReseller(null)}>
                  <Plus size={14} />
                  Add reseller
                </button>
              </div>
              <section className={styles.panel}>
                {!resellers.length ? (
                  <div className={styles.empty}>{loading ? "Loading resellers…" : "No resellers yet."}</div>
                ) : (
                  <table className={`${styles.table} ${styles.tableResellers}`}>
                    <thead>
                      <tr>
                        <th>Reseller</th>
                        <th>Name</th>
                        <th>Balance</th>
                        <th>Applications</th>
                        <th>Added</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {resellers.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <div className={styles.resellerIdentity}>
                              {entry.avatarUrl ? (
                                <img className={styles.resellerAvatar} src={entry.avatarUrl} alt="" />
                              ) : (
                                <span className={styles.resellerAvatar} aria-hidden="true">
                                  {(entry.username || entry.serviceName || entry.discordId || "R").trim().charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className={styles.resellerNote}>{entry.serviceName || "—"}</span>
                            </div>
                          </td>
                          <td>{entry.username || "—"}</td>
                          <td>{formatPrice(entry.balance)}</td>
                          <td>
                            {entry.applicationIds.filter((id) => appsById.has(id)).length}/{applications.length}
                          </td>
                          <td className={styles.muted}>{formatDate(entry.createdAt)}</td>
                          <td className={styles.actionsCell}>
                            <div className={styles.actions}>
                              <button className={styles.secondary} type="button" onClick={() => openReseller(entry)}>
                                <Pencil size={13} />
                                Edit
                              </button>
                              <button className={styles.secondary} type="button" onClick={() => openBalance(entry)}>
                                <Euro size={13} />
                                Balance
                              </button>
                              <button className={styles.secondary} type="button" onClick={() => openResellerLicenses(entry)}>
                                <KeyRound size={13} />
                                Licenses
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : view === "team" && reseller && account?.teamManagement ? (
            <>
              <div className={styles.viewHead}>
                <div>
                  <h1>Team</h1>
                  <p>Add up to 3 helpers. They sign in with Discord and can open Applications and Updates.</p>
                </div>
                <button className={styles.primary} type="button" onClick={() => openHelper(null)} disabled={helpers.length >= 3 || !applications.length}>
                  <Plus size={14} />
                  Add helper
                </button>
              </div>
              <section className={styles.panel}>
                {!helpers.length ? (
                  <div className={styles.empty}>{loading ? "Loading team…" : "No helpers yet."}</div>
                ) : (
                  <table className={`${styles.table} ${styles.tableTeam}`}>
                    <thead>
                      <tr>
                        <th>Helper</th>
                        <th>Applications</th>
                        <th>Permissions</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {helpers.map((entry) => {
                        const permissions = [
                          entry.canGenerate ? "Generate" : "",
                          entry.canResetHwid ? "Reset HWID" : "",
                          entry.canBan ? "Ban" : "",
                        ].filter(Boolean);
                        return (
                          <tr key={entry.id}>
                            <td>
                              <div className={styles.resellerIdentity}>
                                {entry.avatarUrl ? (
                                  <img className={styles.resellerAvatar} src={entry.avatarUrl} alt="" />
                                ) : (
                                  <span className={styles.resellerAvatar} aria-hidden="true">
                                    {(entry.username || entry.discordId || "H").trim().charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <span>
                                  <span className={styles.resellerNote}>{entry.username || entry.discordId}</span>
                                  {entry.username ? <span className={styles.helperDiscord}>{entry.discordId}</span> : null}
                                </span>
                              </div>
                            </td>
                            <td>{entry.applicationIds.filter((id) => appsById.has(id)).length}/{applications.length}</td>
                            <td className={styles.muted}>{permissions.length ? permissions.join(", ") : "View only"}</td>
                            <td className={styles.actionsCell}>
                              <div className={styles.actions}>
                                <button className={styles.secondary} type="button" onClick={() => openHelper(entry)}>
                                  <Pencil size={13} />
                                  Edit
                                </button>
                                <button className={styles.secondary} type="button" onClick={() => removeHelper(entry)} disabled={busy}>
                                  <Trash2 size={13} />
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : view === "settings" ? (
            <section className={styles.settingsStack}>
              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h1>Account</h1>
                  <p>{reseller ? (isHelper ? "Signed-in helper." : "Signed-in reseller.") : "Signed-in administrator for this panel."}</p>
                </div>
                <div className={styles.accountRow}>
                  {account?.avatarUrl ? (
                    <img className={styles.accountAvatar} src={account.avatarUrl} alt="" />
                  ) : (
                    <span className={styles.accountAvatar} aria-hidden="true">{accountInitial}</span>
                  )}
                  <div>
                    <strong>{account?.email || email || "Admin"}</strong>
                    <span>{account?.role || "Administrator"}</span>
                  </div>
                </div>
                <div className={styles.accountGrid}>
                  {reseller ? (
                    <div>
                      <span>Discord ID</span>
                      <strong className={styles.accountMono}>{account?.discordId || "—"}</strong>
                    </div>
                  ) : (
                    <div>
                      <span>Email</span>
                      <strong>{account?.email || email || "—"}</strong>
                    </div>
                  )}
                  <div>
                    <span>Role</span>
                    <strong>{account?.role || "Administrator"}</strong>
                  </div>
                  {reseller ? (
                    <div>
                      <span>Balance</span>
                      <strong>{formatPrice(account?.balance)}</strong>
                    </div>
                  ) : null}
                  {reseller ? (
                    <div>
                      <span>Discount</span>
                      <strong>{Number(account?.discountPercent) || 0}%</strong>
                    </div>
                  ) : null}
                  <div>
                    <span>User ID</span>
                    <strong className={styles.accountMono}>{account?.id || "—"}</strong>
                  </div>
                  <div>
                    <span>Member since</span>
                    <strong>{formatDate(account?.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Last sign in</span>
                    <strong>{formatDate(account?.lastSignInAt)}</strong>
                  </div>
                  <div>
                    <span>Applications</span>
                    <strong>{applications.length}</strong>
                  </div>
                  <div>
                    <span>Variants</span>
                    <strong>{applications.reduce((sum, app) => sum + (app.variants?.length || 0), 0)}</strong>
                  </div>
                  <div>
                    <span>Licenses</span>
                    <strong>{licenses.length}</strong>
                  </div>
                </div>
              </div>

              {reseller ? null : (
              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h2>License format</h2>
                  <p>Blueprint for every new key. Literals stay as typed. Tokens roll randomly, and $ is a checksum of the characters before it.</p>
                </div>
                <KeyFormatStudio format={keyFormat} onChange={setKeyFormat} />
              </div>
              )}

              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h2>Preferences</h2>
                  <p>Panel appearance.</p>
                </div>
                <div className={styles.themeSwitch} role="group" aria-label="Theme">
                  <span className={`${styles.themeThumb}${theme === "light" ? ` ${styles.themeThumbLight}` : ""}`} />
                  <button
                    type="button"
                    className={`${styles.themeOption}${theme === "dark" ? ` ${styles.themeOptionActive}` : ""}`}
                    aria-pressed={theme === "dark"}
                    onClick={() => setPanelTheme("dark")}
                  >
                    <Moon size={14} />
                    Dark
                  </button>
                  <button
                    type="button"
                    className={`${styles.themeOption}${theme === "light" ? ` ${styles.themeOptionActive}` : ""}`}
                    aria-pressed={theme === "light"}
                    onClick={() => setPanelTheme("light")}
                  >
                    <Sun size={14} />
                    Light
                  </button>
                </div>
                <label className={`${styles.checkRow}${compact ? ` ${styles.checkRowOn}` : ""}`}>
                  <input type="checkbox" checked={compact} onChange={(event) => setCompactMode(event.target.checked)} />
                  <span className={styles.checkBox} aria-hidden="true">{compact ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span>Compact sidebar</span>
                </label>
                <label className={`${styles.checkRow}${soundOn ? ` ${styles.checkRowOn}` : ""}`}>
                  <input type="checkbox" checked={soundOn} onChange={toggleSound} />
                  <span className={styles.checkBox} aria-hidden="true">{soundOn ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span>Interface sounds</span>
                </label>
              </div>

              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h2>Connection</h2>
                  <p>Live status for this panel session.</p>
                </div>
                <div className={styles.accountGrid}>
                  <div>
                    <span>Status</span>
                    <strong>{connection.online ? "Online" : "Offline"}</strong>
                  </div>
                  <div>
                    <span>Latency</span>
                    <strong>{connection.latency != null ? `${connection.latency} ms` : "—"}</strong>
                  </div>
                  <div>
                    <span>Last sync</span>
                    <strong>{lastSync ? formatAgo(lastSync) : "—"}</strong>
                  </div>
                  <div>
                    <span>Session</span>
                    <strong>{formatSession(clock.getTime() - sessionStart.current)}</strong>
                  </div>
                </div>
                <button className={styles.secondary} type="button" onClick={() => load()} disabled={loading}>
                  {loading ? <Loader2 className={styles.spin} size={14} /> : <RefreshCw size={14} />}
                  Refresh data
                </button>
              </div>

              {showLicenses ? (
              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h2>Pulse</h2>
                  <p>Live license health. Click a status to open it in Licenses.</p>
                </div>
                <div className={styles.pulseFacts}>
                  <span><b>{pulse.createdToday}</b> created today</span>
                  <span><b>{pulse.expiringSoon}</b> expire in 24h</span>
                  {licenseFrozenSince ? <span className={styles.pulseFrozen}><Snowflake size={12} /> Time frozen</span> : null}
                </div>
                <div className={styles.reachBar} aria-hidden="true">
                  <i className={styles.reachWaiting} style={{ flexGrow: pulse.shares.fresh }} />
                  <i className={styles.reachActive} style={{ flexGrow: pulse.shares.active }} />
                  <i className={styles.reachExpired} style={{ flexGrow: pulse.shares.expired }} />
                  <i className={styles.reachBanned} style={{ flexGrow: pulse.shares.banned }} />
                </div>
                <div className={styles.pulseGrid}>
                  {[
                    { key: "Fresh", label: "Waiting", status: "Not Activated", value: pulse.fresh },
                    { key: "Active", label: "Active", status: "Active", value: pulse.active },
                    { key: "Expired", label: "Expired", status: "Expired", value: pulse.expired },
                    { key: "Banned", label: "Banned", status: "Banned", value: pulse.banned },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.pulseTile} ${styles[`pulse${item.key}`]}`}
                      onClick={() => openLicensePulse(item.status)}
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <div className={styles.settingsCard}>
                <div className={styles.settingsHead}>
                  <h2>Scratchpad</h2>
                  <p>Private notes on this browser. IDs, keys to check, things to remember.</p>
                </div>
                <textarea
                  className={styles.scratch}
                  value={scratch}
                  maxLength={4000}
                  spellCheck={false}
                  placeholder="Paste Discord IDs, keys, or a reminder…"
                  onChange={(event) => writeScratch(event.target.value)}
                />
                <div className={styles.scratchBar}>
                  <span>{scratchSaved ? `Saved ${formatAgo(scratchSaved).toLowerCase()}` : scratch ? "Typing…" : "Empty"}</span>
                  <em>{scratch.length}/4000</em>
                  <button className={styles.secondary} type="button" disabled={!scratch} onClick={() => { navigator.clipboard.writeText(scratch); showToast("Notes copied.", "ok"); }}>
                    <Copy size={13} />
                    Copy
                  </button>
                  <button className={styles.secondary} type="button" disabled={!scratch} onClick={() => writeScratch("")}>
                    <Trash2 size={13} />
                    Clear
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <></>
          )}
        </main>
      </div>

      {drawer?.type === "create-app" || drawer?.type === "edit-app" ? (
        <Drawer
          title={
            drawer.step === "variant" ? "Add variant" : drawer.step === "delete" ? "Delete application" : drawer.type === "create-app" ? "New application" : "Edit application"
          }
          onClose={() => (drawer.step === "variant" || drawer.step === "delete" ? backToApp() : setDrawer(null))}
          instantClose={drawer.step === "variant" || drawer.step === "delete"}
        >
          {drawer.step === "delete" && editingApp ? (
            <form className={styles.form} onSubmit={deleteApplication}>
              <p className={styles.deleteCopy}>
                This permanently deletes <strong>{editingApp.name}</strong>, its variants, and every license. This cannot be undone.
              </p>
              <div className={styles.group}>
                <label htmlFor="delete-app-name">Type the application name</label>
                <input
                  id="delete-app-name"
                  value={deleteName}
                  onChange={(event) => setDeleteName(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
              <div className={styles.formActions}>
                <button className={styles.secondary} type="button" onClick={backToApp}>
                  Cancel
                </button>
                <button className={styles.danger} type="submit" disabled={busy || deleteName !== editingApp.name}>
                  Delete
                </button>
              </div>
            </form>
          ) : drawer.step === "variant" ? (
            <form className={styles.form} onSubmit={addVariant}>
              <VariantFields
                idPrefix="add-variant"
                variant={variantForm}
                onChange={(patch) => setVariantForm((current) => ({ ...current, ...patch }))}
              />
              <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
              <div className={styles.formActions}>
                <button className={styles.secondary} type="button" onClick={backToApp}>
                  Cancel
                </button>
                <button className={styles.primary} type="submit" disabled={busy}>
                  Add
                </button>
              </div>
            </form>
          ) : (
          <form className={styles.form} onSubmit={saveApplication}>
            {drawer.type === "edit-app" && editingApp?.app_id ? (
              <div className={styles.group}>
                <label>APP ID</label>
                <AppIdButton value={editingApp.app_id} />
              </div>
            ) : null}
            <div className={styles.group}>
              <label htmlFor="app-name">Name</label>
              <input
                id="app-name"
                value={appForm.name}
                onChange={(event) => setAppForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className={styles.row}>
              <div className={styles.group}>
                <label htmlFor="app-version">Version</label>
                <input
                  id="app-version"
                  value={appForm.version}
                  onChange={(event) => setAppForm((current) => ({ ...current, version: event.target.value }))}
                  required
                />
              </div>
              <div className={styles.group}>
                <label htmlFor="app-status">Status</label>
                <select
                  id="app-status"
                  value={appForm.status}
                  onChange={(event) => setAppForm((current) => ({ ...current, status: event.target.value }))}
                >
                  {APP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.draftList}>
              <div className={styles.sectionLabel}>Variants</div>
              <div className={styles.variantList}>
                {drawer.type === "create-app"
                  ? draftVariants.map((variant) => (
                      <div className={styles.variantItem} key={variant.key}>
                        <div>
                          <strong>{variant.label}</strong>
                          <div className={styles.muted}>
                            {formatDuration(variant.durationValue, variant.durationUnit)} · {formatPrice(variant.price)}
                          </div>
                        </div>
                        <button
                          className={styles.danger}
                          type="button"
                          onClick={() => {
                            if (draftVariants.length <= 1) {
                              showError("You can't delete the last variant. An application must keep at least one.");
                              return;
                            }
                            setDraftVariants((current) => current.filter((entry) => entry.key !== variant.key));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  : (editingApp?.variants || []).map((variant) => (
                      <div className={styles.variantItem} key={variant.id}>
                        <div>
                          <strong>{variant.label}</strong>
                          <div className={styles.muted}>
                            {formatDuration(variant.duration_value, variant.duration_unit)} · {formatPrice(variant.price)}
                          </div>
                        </div>
                        <button className={styles.danger} type="button" onClick={() => removeVariant(variant.id)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    ))}
              </div>
              {drawer.type === "create-app" && !draftVariants.length ? <div className={styles.muted}>Add at least one variant.</div> : null}
              {drawer.type === "edit-app" && !editingApp?.variants?.length ? <div className={styles.muted}>No variants yet.</div> : null}
              <button className={`${styles.secondary} ${styles.addVariant}`} type="button" onClick={openAddVariant}>
                <Plus size={14} />
                Add variant
              </button>
              {drawer.type === "edit-app" ? (
                <>
                  <button className={`${styles.secondary} ${styles.addVariant}`} type="button" onClick={toggleKeyLock} disabled={busy}>
                    {editingApp?.keys_locked ? <Unlock size={14} /> : <Lock size={14} />}
                    {editingApp?.keys_locked ? "Unlock" : "Lock"}
                  </button>
                  <button className={`${styles.secondary} ${styles.addVariant}`} type="button" onClick={openDeleteApp}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              ) : null}
              {drawer.type === "edit-app" ? (
                <div className={styles.formActions}>
                  <button className={styles.secondary} type="button" onClick={() => setDrawer(null)}>
                    Cancel
                  </button>
                  <button className={styles.primary} type="submit" disabled={busy}>
                    Save
                  </button>
                </div>
              ) : null}
            </div>
            {formMessage ? (
              <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
            ) : null}
            {drawer.type === "create-app" ? (
              <div className={styles.formActions}>
                <button className={styles.secondary} type="button" onClick={() => setDrawer(null)}>
                  Cancel
                </button>
                <button className={styles.primary} type="submit" disabled={busy}>
                  Save
                </button>
              </div>
            ) : null}
          </form>
          )}
        </Drawer>
      ) : null}

      {drawer?.type === "reseller" ? (
        <Drawer title={drawer.id ? "Edit reseller" : "Add reseller"} onClose={() => setDrawer(null)}>
          <form className={styles.form} onSubmit={saveReseller}>
            <div className={styles.group}>
              <label htmlFor="reseller-service">Service name</label>
              <input
                id="reseller-service"
                value={resellerForm.serviceName}
                onChange={(event) => setResellerForm((current) => ({ ...current, serviceName: event.target.value }))}
                placeholder="Service name"
                maxLength={40}
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.group}>
              <label htmlFor="reseller-discord">Discord user ID</label>
              <input
                id="reseller-discord"
                value={resellerForm.discordId}
                onChange={(event) => setResellerForm((current) => ({ ...current, discordId: event.target.value }))}
                placeholder="123456789012345678"
                inputMode="numeric"
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.group}>
              <label className={styles.priceLabel} htmlFor="reseller-balance">
                Balance
                <Euro size={13} />
              </label>
              <input
                id="reseller-balance"
                type="number"
                min="0"
                step="0.01"
                value={resellerForm.balance}
                onChange={(event) => setResellerForm((current) => ({ ...current, balance: event.target.value }))}
                required
              />
            </div>
            <div className={styles.group}>
              <label htmlFor="reseller-discount">Discount (%)</label>
              <input
                id="reseller-discount"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={resellerForm.discountPercent}
                onChange={(event) => setResellerForm((current) => ({ ...current, discountPercent: event.target.value }))}
                required
              />
              <span className={styles.muted}>Taken off every variant price this reseller sees and pays. 0 means list price.</span>
            </div>
            <div className={styles.group}>
              <span className={styles.sectionLabel}>Applications</span>
              <div className={styles.appChecks}>
                {applications.length ? (
                  applications.map((app) => {
                    const checked = resellerForm.applicationIds.includes(app.id);
                    return (
                      <label key={app.id} className={`${styles.checkRow}${checked ? ` ${styles.checkRowOn}` : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleResellerApp(app.id)} />
                        <span className={styles.checkBox} aria-hidden="true">{checked ? <Check size={14} strokeWidth={3} /> : null}</span>
                        <span>{app.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <div className={styles.muted}>Create an application before adding a reseller.</div>
                )}
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.sectionLabel}>Team</span>
              <label className={`${styles.checkRow}${resellerForm.teamManagement ? ` ${styles.checkRowOn}` : ""}`}>
                <input
                  type="checkbox"
                  checked={resellerForm.teamManagement}
                  onChange={() => setResellerForm((current) => ({ ...current, teamManagement: !current.teamManagement }))}
                />
                <span className={styles.checkBox} aria-hidden="true">{resellerForm.teamManagement ? <Check size={14} strokeWidth={3} /> : null}</span>
                <span>Team management</span>
              </label>
              <span className={styles.muted}>Lets this reseller add up to 3 helpers.</span>
            </div>
            <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
            {drawer.id ? (
              <button className={`${styles.secondary} ${styles.addVariant}`} type="button" onClick={deleteReseller} disabled={busy}>
                <Trash2 size={14} />
                Remove reseller
              </button>
            ) : null}
            <div className={styles.formActions}>
              <button className={styles.secondary} type="button" onClick={() => setDrawer(null)}>
                Cancel
              </button>
              <button className={styles.primary} type="submit" disabled={busy || !applications.length}>
                {drawer.id ? "Save" : "Add reseller"}
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {drawer?.type === "balance" ? (
        <Drawer title="Balance" onClose={() => setDrawer(null)}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <p className={styles.muted}>{drawer.name}</p>
            <p className={styles.balanceNow}>
              Current balance <strong>{formatPrice(drawer.balance)}</strong>
            </p>
            <div className={styles.group}>
              <label className={styles.priceLabel} htmlFor="balance-amount">
                Amount
                <Euro size={13} />
              </label>
              <input
                id="balance-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={balanceAmount}
                onChange={(event) => setBalanceAmount(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
            <div className={styles.formActions}>
              <button className={styles.secondary} type="button" disabled={busy || !balanceAmount} onClick={() => adjustBalance("remove")}>
                Remove
              </button>
              <button className={styles.primary} type="button" disabled={busy || !balanceAmount} onClick={() => adjustBalance("add")}>
                Add
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {drawer?.type === "helper" ? (
        <Drawer title={drawer.id ? "Edit helper" : "Add helper"} onClose={() => setDrawer(null)}>
          <form className={styles.form} onSubmit={saveHelper}>
            <div className={styles.group}>
              <label htmlFor="helper-discord">Discord user ID</label>
              <input
                id="helper-discord"
                value={helperForm.discordId}
                onChange={(event) => setHelperForm((current) => ({ ...current, discordId: event.target.value }))}
                placeholder="123456789012345678"
                inputMode="numeric"
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.group}>
              <span className={styles.sectionLabel}>Applications</span>
              <div className={styles.appChecks}>
                {applications.map((app) => {
                  const checked = helperForm.applicationIds.includes(app.id);
                  return (
                    <label key={app.id} className={`${styles.checkRow}${checked ? ` ${styles.checkRowOn}` : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleHelperApp(app.id)} />
                      <span className={styles.checkBox} aria-hidden="true">{checked ? <Check size={14} strokeWidth={3} /> : null}</span>
                      <span>{app.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.sectionLabel}>Permissions</span>
              <div className={styles.appChecks}>
                <label className={`${styles.checkRow}${helperForm.canGenerate ? ` ${styles.checkRowOn}` : ""}`}>
                  <input type="checkbox" checked={helperForm.canGenerate} onChange={() => toggleHelperPermission("canGenerate")} />
                  <span className={styles.checkBox} aria-hidden="true">{helperForm.canGenerate ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span className={styles.permLabel}>
                    Generate licenses
                    <span className={styles.permWarn} title="Uses your balance">
                      <CircleAlert size={14} />
                    </span>
                  </span>
                </label>
                <label className={`${styles.checkRow}${helperForm.canResetHwid ? ` ${styles.checkRowOn}` : ""}`}>
                  <input type="checkbox" checked={helperForm.canResetHwid} onChange={() => toggleHelperPermission("canResetHwid")} />
                  <span className={styles.checkBox} aria-hidden="true">{helperForm.canResetHwid ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span>Reset HWID</span>
                </label>
                <label className={`${styles.checkRow}${helperForm.canBan ? ` ${styles.checkRowOn}` : ""}`}>
                  <input type="checkbox" checked={helperForm.canBan} onChange={() => toggleHelperPermission("canBan")} />
                  <span className={styles.checkBox} aria-hidden="true">{helperForm.canBan ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <span>Ban license</span>
                </label>
              </div>
            </div>
            <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
            {drawer.id ? (
              <button className={`${styles.danger} ${styles.addVariant}`} type="button" onClick={deleteHelper} disabled={busy}>
                <Trash2 size={14} />
                Remove helper
              </button>
            ) : null}
            <div className={styles.formActions}>
              <button className={styles.secondary} type="button" onClick={() => setDrawer(null)}>
                Cancel
              </button>
              <button className={styles.primary} type="submit" disabled={busy || helpers.length >= 3 && !drawer.id}>
                {drawer.id ? "Save" : "Add helper"}
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {drawer?.type === "generate" ? (
        <Drawer title={reseller ? "Buy licenses" : "Generate licenses"} onClose={() => setDrawer(null)}>
          <form className={styles.form} onSubmit={generateLicenses}>
            <div className={styles.group}>
              <label htmlFor="license-app">Application</label>
              <select
                id="license-app"
                value={licenseForm.applicationId}
                onChange={(event) => {
                  const applicationId = event.target.value;
                  const app = applications.find((entry) => entry.id === applicationId);
                  setLicenseForm((current) => ({
                    ...current,
                    applicationId,
                    variantId: app?.variants?.[0]?.id || "",
                  }));
                }}
              >
                {applications
                  .filter((app) => !app.keys_locked)
                  .map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className={styles.group}>
              <label htmlFor="license-qty">Quantity</label>
              <input
                id="license-qty"
                type="number"
                min="1"
                max="200"
                value={licenseForm.quantity}
                onChange={(event) => setLicenseForm((current) => ({ ...current, quantity: Number(event.target.value || 1) }))}
              />
            </div>
            <div className={styles.group}>
              <label id="license-variant-label">Variant</label>
              <VariantPicker
                variants={selectedVariants}
                value={licenseForm.variantId}
                percent={buyDiscount}
                onChange={(variantId) => setLicenseForm((current) => ({ ...current, variantId }))}
              />
            </div>
            {!selectedVariants.length ? <div className={styles.messageError}>Add a variant to this application first.</div> : null}
            {reseller ? (
              <dl className={styles.buySummary}>
                <div className={balanceShort ? styles.buySummaryShort : ""}>
                  <dt>Balance</dt>
                  <dd>{formatPrice(account?.balance)}</dd>
                </div>
                <div>
                  <dt>Discount</dt>
                  <dd>
                    {buySaved > 0 ? <span>−{formatPrice(buySaved)}</span> : null}
                    <em className={buyDiscount > 0 ? styles.buySummaryOff : ""}>{buyDiscount > 0 ? `−${buyDiscount}%` : "0%"}</em>
                  </dd>
                </div>
                <div className={styles.buySummaryTotal}>
                  <dt>Total</dt>
                  <dd>
                    {buySaved > 0 ? <s>{formatPrice(listCost)}</s> : null}
                    {formatPrice(orderCost)}
                  </dd>
                </div>
              </dl>
            ) : null}
            <div className={`${styles.message} ${formTone === "error" ? styles.messageError : styles.messageOk}`}>{formMessage}</div>
            {generatedKeys.length ? (
              <div className={styles.group}>
                <label htmlFor="generated-keys">Generated keys</label>
                <textarea id="generated-keys" readOnly value={generatedKeys.join("\n")} />
                <button className={styles.secondary} type="button" onClick={() => copyText(generatedKeys.join("\n"), "batch")}>
                  <Copy size={14} />
                  {copiedId === "batch" ? "Copied" : "Copy all"}
                </button>
              </div>
            ) : null}
            <div className={styles.formActions}>
              <button className={styles.secondary} type="button" onClick={() => setDrawer(null)}>
                Close
              </button>
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || !selectedVariants.length || (reseller && orderCost > Number(account?.balance || 0))}
              >
                <KeyRound size={14} />
                {reseller ? "Buy" : "Generate"}
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}
      {toast ? (
        <div key={toast.id} className={`${styles.toast} ${toast.type === "error" ? styles.toastError : ""}`} role="alert">
          <CircleAlert size={18} />
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
    </LicenseFreezeContext.Provider>
  );
}
