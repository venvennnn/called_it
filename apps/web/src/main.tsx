import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Radio,
  ChartNoAxesColumnIncreasing,
  Trophy,
  Clock,
  Settings,
  Check,
  ChevronDown,
  ChevronRight,
  Link,
  VolumeX,
  Volume2,
  Info,
  CheckCheck,
  ArrowUpRight,
  Plus,
  X,
  Ban,
  CheckCircle2,
  Mountain,
  LogOut,
  ExternalLink,
  Copy,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Eye,
  Users,
  Send,
  LoaderCircle,
} from "lucide-react";
import { score, type Round } from "../../../packages/shared/src/index.ts";
import "./style.css";
import "./theme.css";
type R = Round & { participantCount: number; distribution: any };
type Snapshot = {
  sessionId: string;
  sessions: { id: string; name: string }[];
  mode: string;
  channel: string;
  connection: string;
  gap: string | null;
  lastMessage: number | null;
  ingestionLagMs: number | null;
  rounds: R[];
  current: R | null;
  leaderboard: any[];
  series: any[];
  calibration: any;
  overlayVisible: boolean;
  authenticated: boolean;
  serverNow: number;
};
const navItems = [
  ["Live room", Radio],
  ["Results", ChartNoAxesColumnIncreasing],
  ["Leaderboard", Trophy],
  ["History", Clock],
  ["Settings", Settings],
] as const;
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={"brand " + (small ? "small" : "")}>
      <span className="brand-symbol">
        <Check size={small ? 16 : 26} strokeWidth={4} />
        <i />
      </span>
      Called It
    </span>
  );
}
async function api(path: string, body?: unknown) {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-Called-It": "owner",
            "Idempotency-Key": crypto.randomUUID(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "Request failed");
  return data;
}
function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [page, setPage] = useState("Live room"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<
      "create" | "obs" | "scoring" | "confirm" | "correct" | "delete" | null
    >(null),
    [outcome, setOutcome] = useState<boolean | null>(null),
    [confirmAction, setConfirmAction] = useState("resolve"),
    [layout, setLayout] = useState("compact"),
    [muted, setMuted] = useState(true),
    [now, setNow] = useState(Date.now()),
    [offline, setOffline] = useState(false),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(""),
    [overlayView] = useState(location.pathname === "/overlay"),
    [overlayError, setOverlayError] = useState("");
  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  const load = useCallback(async () => {
    try {
      if (overlayView && location.hash) {
        const t = location.hash.slice(1);
        const res = await fetch("/api/overlay/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        });
        if (!res.ok)
          throw Error(
            "Overlay link expired. Generate a new link in the dashboard.",
          );
        history.replaceState(null, "", location.pathname + location.search);
      }
      const res = await fetch("/api/state");
      if (res.status === 401) {
        if (!overlayView) {
          location.href = "/auth/demo";
          return;
        }
        throw Error("Authorize this overlay using its OBS link.");
      }
      if (!res.ok) throw Error("Unable to load the room.");
      setData(await res.json());
      setOffline(false);
    } catch (e) {
      if (overlayView) setOverlayError((e as Error).message);
      else setError((e as Error).message);
    }
  }, [overlayView]);
  useEffect(() => {
    load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!data) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let socket: WebSocket;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      socket.onmessage = (e) => {
        const next = JSON.parse(e.data);
        setData(next);
        setOffline(false);
      };
      socket.onclose = () => {
        setOffline(true);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [!!data]);
  async function perform(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const r = data?.current;
  const rounds = data?.rounds || [];
  const seconds = r ? Math.max(0, Math.ceil((r.deadline - now) / 1000)) : 0;
  const crowd = r?.crowd === null ? null : Math.round(r?.crowd || 0);
  const isOpen = r?.state === "open",
    resolved = r?.state === "resolved",
    voided = r?.state === "void";
  async function transition(
    action: string,
    result?: boolean,
    reason?: string,
    acknowledge?: boolean,
  ) {
    if (!r) return;
    await perform(`rounds/${r.id}/${action}`, {
      version: r.version,
      outcome: result,
      reason,
      acknowledge,
    });
    setModal(null);
    setOutcome(null);
    flash(
      action === "resolve"
        ? "Result confirmed. Every call is on the record."
        : action === "void"
          ? "Round voided. No scores were changed."
          : action === "correct"
            ? "Result corrected. Scores recomputed."
            : "Calls locked. You’re ready to play.",
    );
  }
  async function copyObs() {
    try {
      let t = token;
      if (!t) {
        const res = await perform("overlay/rotate", {});
        t = res.token;
        setToken(t);
      }
      await navigator.clipboard.writeText(
        `${location.origin}/overlay?layout=${layout}#${t}`,
      );
      flash("OBS browser source link copied");
    } catch (e) {
      setModal("obs");
    }
  }
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const elements = [
          ...document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled),.modal input,.modal select,.modal textarea,.modal a[href]",
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal]);
  if (overlayView) {
    const params = new URLSearchParams(location.search),
      l = params.get("layout") || "compact";
    return (
      <div className={"obs-root " + l}>
        {overlayError ? (
          <div className="obs-error">{overlayError}</div>
        ) : data && data.overlayVisible && r ? (
          <OverlayCard
            data={data}
            round={r}
            seconds={seconds}
            large={l === "forecast" || l === "results"}
            variant={l}
          />
        ) : null}
      </div>
    );
  }
  if (!data)
    return (
      <div className="loading">
        <Brand />
        <LoaderCircle className="spin" />
        <p>{error || "Opening the live room…"}</p>
        {error && <button onClick={load}>Try again</button>}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar" inert={!!modal}>
        <a href="/" className="brand-link" aria-label="Called It home">
          <Brand />
        </a>
        <div className="nav-caption">LIVE EVENT</div>
        <nav>
          {navItems.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => setPage(label)}
            >
              <Icon size={21} />
              {label}
              {page === label && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Mountain size={148} strokeWidth={0.5} />
          <p>
            Viewers predict.
            <br />
            You play.
            <br />
            Find out together.
          </p>
          <span />
        </div>
        <button className="help-link" onClick={() => setModal("scoring")}>
          <Info size={15} /> How scoring works <ArrowUpRight size={13} />
        </button>
      </aside>
      <div className="workspace" inert={!!modal}>
        <header className="topbar">
          <div className="breadcrumb">
            <b>{data.sessionId}</b>
            <span>/</span>
            {data.channel}
          </div>
          <div className="header-actions">
            <button
              className="demo-badge"
              onClick={() =>
                flash(
                  data.mode === "Demo"
                    ? "Demo fixtures. No live Twitch connection."
                    : "Connected to your authorized Twitch account.",
                )
              }
            >
              <span>
                {data.mode === "Demo" ? "Demo preview" : "Live broadcast"}
              </span>
              <Info size={14} />
            </button>
            <button
              className={
                "connection-badge " +
                (data.connection === "connected" ? "connected" : "")
              }
              onClick={() => setPage("Settings")}
            >
              <i />
              {data.mode === "Demo"
                ? "Demo source"
                : data.connection === "connected"
                  ? "Twitch connected"
                  : "Twitch disconnected"}
            </button>
            <button
              className="twitch-icon"
              title="Twitch connection settings"
              onClick={() => setPage("Settings")}
            >
              <svg
                width="19"
                height="21"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4 2L2 6v16h6v2l4-2h4l6-6V2H4zm16 13l-4 4h-5l-3 3v-3H5V4h15v11zM15 7h2v6h-2zm-5 0h2v6h-2z" />
              </svg>
            </button>
            <button
              className="profile"
              onClick={() => setPage("Settings")}
              aria-label="Open profile settings"
            >
              <span className="avatar">
                <Mountain size={24} />
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>
        {offline && (
          <div className="notice">
            Connection interrupted. Reconnecting to the authoritative server…
          </div>
        )}
        {data.gap && (
          <div className="notice warning">
            {data.gap} Open rounds are marked disrupted.
          </div>
        )}
        <main>
          {page === "Live room" ? (
            <>
              <section
                className="campaign-hero"
                aria-label="Called It introduction"
              >
                <div className="campaign-copy">
                  <span className="graphic-label">THE CONFIDENCE GAME</span>
                  <h2>
                    Chat talks big.
                    <br />
                    <em>Make it count.</em>
                  </h2>
                  <p>
                    Turn the next stream moment into a confidence challenge.
                    Call it in chat. Lock it before the action. See who got it
                    right.
                  </p>
                  <div className="campaign-actions">
                    <a className="primary" href="/auth/twitch">
                      <Radio size={16} /> Connect Twitch
                    </a>
                    <button
                      className="secondary-button"
                      onClick={() => setModal("scoring")}
                    >
                      How it works <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="campaign-steps">
                    <span>
                      <b>01</b> Call it
                    </span>
                    <ChevronRight size={14} />
                    <span>
                      <b>02</b> Lock it
                    </span>
                    <ChevronRight size={14} />
                    <span>
                      <b>03</b> Prove it
                    </span>
                  </div>
                </div>
                <div className="campaign-art" aria-hidden="true">
                  <div className="hero-speedlines" />
                  <span className="hero-spark">✣</span>
                  <div className="hero-call-ticket">
                    <span>ROUND {r?.id || "01"}</span>
                    <div>
                      <strong>YES</strong>
                      <b>
                        80<small>%</small>
                      </b>
                    </div>
                    <p>CONFIDENCE ON THE RECORD</p>
                  </div>
                  <img className="hero-mascot" src="/mascot.png" alt="" />
                  <div className="hero-score-sticker">
                    <CheckCheck size={23} />
                    <span>
                      YES result <b>· 96 points</b>
                    </span>
                  </div>
                  <span className="hero-art-label">
                    ILLUSTRATIVE CALL · DEMO
                  </span>
                </div>
              </section>
              <div className="dashboard-section-label">
                <span>STREAMER DASHBOARD</span>
                <i />
                <b>{data.mode.toUpperCase()} MODE</b>
              </div>
              <div className="room-grid">
                <section className="stage-column">
                  <div className="eyebrow">
                    THE LIVE ROOM <span>•</span> SESSION {data.sessionId}
                  </div>
                  <h1>
                    {!r
                      ? "Let’s put a call on record."
                      : isOpen
                        ? "One attempt. What’s your call?"
                        : resolved
                          ? "The result is in. Who called it?"
                          : voided
                            ? "A fresh start. No scores changed."
                            : "Calls locked. Attempt underway."}
                  </h1>
                  <div className="stage-meta">
                    <span className={"state-tag " + (isOpen ? "open" : "")}>
                      <i />
                      {isOpen
                        ? "CALLS OPEN"
                        : resolved
                          ? "STREAMER CONFIRMED"
                          : voided
                            ? "ROUND VOIDED"
                            : "ATTEMPT IN PROGRESS"}
                    </span>
                    <span>
                      {r
                        ? `Round ${r.id.toString().padStart(2, "0")}`
                        : "Your next great prediction starts here"}
                    </span>
                    <span className="meta-right">
                      {data.mode} gameplay preview <Info size={12} />
                    </span>
                  </div>
                  <div className="game-stage">
                    <img
                      src="/landscape.svg"
                      alt="Illustrated fantasy adventure: a hero jumps between floating stone islands above a misty valley"
                    />
                    <div className="game-vignette" />
                    <div className="game-hud">
                      <div className="hearts">
                        ♥ ♥ ♥ ♥ <span>♥ ♥</span>
                      </div>
                      <div className="stamina">
                        <span>✣</span>
                        <i />
                      </div>
                    </div>
                    {r && data.overlayVisible && (
                      <div className="preview-overlay">
                        <OverlayCard
                          data={data}
                          round={r}
                          seconds={seconds}
                          large={layout === "forecast"}
                          variant={layout}
                        />
                      </div>
                    )}
                    <div className="game-location">
                      <span>THE SKYWARD RUINS</span>
                      <small>Beyond the last checkpoint</small>
                    </div>
                    <div className="webcam">
                      <div className="webcam-art">
                        <img
                          className="streamer-portrait"
                          src="/director.svg"
                          alt="Illustrated demo broadcaster"
                        />
                        <span className="camera-label">
                          <i /> DIRECTOR CAM
                        </span>
                      </div>
                    </div>
                    <div className="game-compass">
                      <span>✧</span>
                      <i />
                      <b>N</b>
                      <small>◆</small>
                    </div>
                    <div className="game-tools">
                      <span>⚔</span>
                      <span>
                        ✣<small>2 / 3</small>
                      </span>
                    </div>
                  </div>
                  <div className="overlay-toolbar">
                    <div className="overlay-toggle">
                      <button
                        role="switch"
                        aria-checked={data.overlayVisible}
                        aria-label="Overlay visible"
                        className={
                          "toggle " + (data.overlayVisible ? "on" : "")
                        }
                        onClick={() =>
                          perform("overlay/visibility", {
                            visible: !data.overlayVisible,
                          }).catch(() => {})
                        }
                      >
                        <span />
                      </button>
                      <div>
                        <b>Overlay visible</b>
                        <small>Show Called It on your stream</small>
                      </div>
                    </div>
                    <label className="layout-select">
                      <span>Overlay layout</span>
                      <select
                        value={layout}
                        onChange={(e) => setLayout(e.target.value)}
                      >
                        <option value="compact">
                          Probability bar (compact)
                        </option>
                        <option value="forecast">Forecast distribution</option>
                        <option value="locked">Locked forecast</option>
                        <option value="results">Results reveal</option>
                        <option value="series">Five-round series</option>
                      </select>
                    </label>
                    <div className="toolbar-buttons">
                      <button className="secondary-button" onClick={copyObs}>
                        <Link size={17} />
                        Copy OBS link
                      </button>
                      <button
                        className="icon-button"
                        aria-label={muted ? "Enable sound" : "Mute sound"}
                        title="Overlay audio preference"
                        onClick={() => {
                          setMuted(!muted);
                          flash(
                            muted
                              ? "Sound enabled for this preview"
                              : "Sound muted",
                          );
                          if (muted) {
                            const ctx = new AudioContext();
                            const o = ctx.createOscillator(),
                              g = ctx.createGain();
                            o.type = "sine";
                            o.frequency.value = 660;
                            g.gain.setValueAtTime(0.04, ctx.currentTime);
                            g.gain.exponentialRampToValueAtTime(
                              0.001,
                              ctx.currentTime + 0.25,
                            );
                            o.connect(g);
                            g.connect(ctx.destination);
                            o.start();
                            o.stop(ctx.currentTime + 0.25);
                            o.onended = () => ctx.close();
                          }
                        }}
                      >
                        {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                      </button>
                    </div>
                  </div>
                  <div className="stage-footnote">
                    <ShieldCheck size={14} /> One viewer, one effective
                    forecast. Confidence makes it interesting.
                  </div>
                </section>
                <aside className="operator-panel">
                  {!r || resolved || voided ? (
                    <>
                      <div className="panel-kicker">
                        {resolved ? "ROUND COMPLETE" : "YOUR NEXT ROUND"}
                      </div>
                      <h2>
                        {resolved
                          ? "Now that’s on record."
                          : "Make the next call."}
                      </h2>
                      <p className="panel-description">
                        {resolved
                          ? "The outcome is confirmed. Here’s how the forecasts measured up."
                          : "A good question has a clear finish line."}
                      </p>
                      {resolved && r && (
                        <>
                          <div
                            className={
                              "outcome-banner " + (r.outcome ? "yes" : "no")
                            }
                          >
                            <CheckCircle2 size={26} />
                            <div>
                              <small>THE OUTCOME</small>
                              <strong>
                                {r.outcome
                                  ? "YES · Confirmed"
                                  : "NO · Confirmed"}
                              </strong>
                            </div>
                          </div>
                          <div className="result-summary">
                            <div>
                              <small>Crowd forecast · Yes</small>
                              <strong>{crowd}%</strong>
                            </div>
                            <div>
                              <small>Crowd score</small>
                              <strong>
                                {r.crowd === null
                                  ? "—"
                                  : (
                                      100 *
                                      (1 -
                                        (r.crowd / 100 - (r.outcome ? 1 : 0)) **
                                          2)
                                    ).toFixed(1)}
                                <span>/100</span>
                              </strong>
                            </div>
                          </div>
                          <p className="quiet">
                            {r.locked.length} forecasts scored.{" "}
                            {r.revision > 1
                              ? "Corrected result."
                              : "Streamer confirmed."}
                          </p>
                        </>
                      )}
                      <button
                        className="primary full"
                        onClick={() => setModal("create")}
                      >
                        <Plus size={18} /> Create a question
                      </button>
                      {resolved && (
                        <button
                          className="text-button full"
                          onClick={() => setPage("Results")}
                        >
                          Explore the results <ArrowRight size={15} />
                        </button>
                      )}
                      <div className="panel-divider" />
                      <h3>Good questions, great calls.</h3>
                      <p className="quiet">
                        Survive an attempt. Beat a time. Reach the next
                        checkpoint. Define Yes before opening the round.
                      </p>
                      {resolved && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setModal("correct");
                            setOutcome(null);
                          }}
                        >
                          Correct this outcome
                        </button>
                      )}
                    </>
                  ) : isOpen ? (
                    <>
                      <div className="panel-kicker">ROUND {r.id} · OPEN</div>
                      <h2>Let the calls come in.</h2>
                      <p className="panel-description">
                        Viewers have until the deadline to put their confidence
                        on record.
                      </p>
                      <div className="countdown">
                        <Clock size={22} />
                        <strong>
                          {seconds}
                          <small>seconds left</small>
                        </strong>
                      </div>
                      <div className="question-criterion">
                        <b>{r.question}</b>
                        <p>{r.criterion}</p>
                      </div>
                      <div className="command-box">
                        <small>VIEWERS TYPE IN TWITCH CHAT</small>
                        <code>!call {r.id} yes 80</code>
                        <span>Choose yes or no. Confidence: 50–100.</span>
                      </div>
                      <div className="participant-row">
                        <Users size={19} />
                        <strong>{r.participantCount}</strong> forecasts received
                      </div>
                      <p className="quiet">
                        {r.publicDistribution
                          ? "Public distribution is enabled for this round."
                          : "Forecasts stay hidden until lock. Chat messages remain public."}
                      </p>
                      <button
                        className="primary full"
                        disabled={busy}
                        onClick={() => transition("lock").catch(() => {})}
                      >
                        <CheckCheck size={18} /> Lock calls & start attempt
                      </button>
                      <button
                        className="text-button full"
                        onClick={() => {
                          setConfirmAction("void");
                          setModal("confirm");
                        }}
                      >
                        Void this round
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="panel-kicker">THE MOMENT OF TRUTH</div>
                      <h2>Confirm the outcome</h2>
                      <p className="panel-description">
                        Select the result for this attempt.
                      </p>
                      <div className="outcome-choices">
                        <button
                          aria-pressed={outcome === true}
                          className={
                            "choice yes " + (outcome === true ? "selected" : "")
                          }
                          onClick={() => setOutcome(true)}
                        >
                          <span>
                            <Check size={22} />
                          </span>
                          <strong>YES</strong>
                          <b>
                            {/surviv/i.test(r.question)
                              ? "Survived"
                              : "Criterion met"}
                          </b>
                          <small>Yes criterion achieved</small>
                        </button>
                        <button
                          aria-pressed={outcome === false}
                          className={
                            "choice no " + (outcome === false ? "selected" : "")
                          }
                          onClick={() => setOutcome(false)}
                        >
                          <span>
                            <X size={22} />
                          </span>
                          <strong>NO</strong>
                          <b>
                            {/surviv/i.test(r.question)
                              ? "Failed"
                              : "Criterion not met"}
                          </b>
                          <small>Yes criterion not achieved</small>
                        </button>
                      </div>
                      <div className="guidance">
                        <Info size={21} />
                        <p>
                          <b>Confirm only after the attempt ends.</b>
                          <span>
                            Each viewer has one effective forecast.
                            <br />
                            Replacements do not add weight.
                          </span>
                        </p>
                      </div>
                      <button
                        className="primary full confirm-result"
                        disabled={outcome === null || busy}
                        onClick={() => {
                          setConfirmAction("resolve");
                          setModal("confirm");
                        }}
                      >
                        Confirm result <ArrowRight size={16} />
                      </button>
                      <div className="void-section">
                        <button
                          className="secondary-button full"
                          onClick={() => {
                            setConfirmAction("void");
                            setModal("confirm");
                          }}
                        >
                          <Ban size={19} /> Void this round
                        </button>
                        <small>
                          Use only for invalid attempts (e.g. technical issue).
                        </small>
                      </div>
                      <div className="round-status">
                        <h3>Round status</h3>
                        <div className="timeline">
                          <div className="done">
                            <span>
                              <Check size={13} />
                            </span>
                            <b>1. Question opened</b>
                            <time>{time(r.openedAt)}</time>
                          </div>
                          <div className="done">
                            <span>
                              <Check size={13} />
                            </span>
                            <b>2. {r.locked.length} forecasts locked</b>
                            <time>{time(r.lockedAt)}</time>
                          </div>
                          <div className="current">
                            <span />
                            <b>3. Waiting for result</b>
                            <time>—</time>
                            <small>Attempt underway…</small>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </aside>
              </div>
              <Series rounds={rounds} />
              <div className="below-stage">
                <div>
                  <span className="eyebrow">THE QUESTION ON RECORD</span>
                  <h3>{r?.question || "Your next question"}</h3>
                  <p>
                    {r?.criterion || "Define the attempt before calls open."}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("scoring")}
                >
                  A little confidence. A lot to learn.{" "}
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </>
          ) : page === "Results" ? (
            <>
              <PageHeading
                eyebrow="THE REVEAL"
                title="Every call tells a story."
                text="The outcome, the confidence, and what it all adds up to."
              />
              <div className="results-grid">
                {rounds
                  .filter((x) => x.state === "resolved")
                  .reverse()
                  .map((round) => (
                    <ResultCard key={round.id} round={round} />
                  ))}
              </div>
              {!rounds.some((x) => x.state === "resolved") && (
                <Empty text="Results arrive after the first confirmed outcome." />
              )}
              <div className="learning-card">
                <div>
                  <span className="eyebrow">CONFIDENCE, MEET REALITY</span>
                  <h2>Good calls deserve good context.</h2>
                  <p>
                    A 50% forecast scores 75 either way. Being confidently wrong
                    costs more.
                    <br />
                    One great round is a good story. A track record is something
                    more.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setModal("scoring")}
                >
                  How scoring works <ArrowUpRight size={16} />
                </button>
              </div>
              <Calibration data={data} />
            </>
          ) : page === "Leaderboard" ? (
            <>
              <PageHeading
                eyebrow="THE PEOPLE WHO CALLED IT"
                title="Confidence on the record."
                text="Mean scores, shared credit, and a little friendly competition."
              />
              <Standings data={data} />
            </>
          ) : page === "History" ? (
            <>
              <PageHeading
                eyebrow="THE SESSION ARCHIVE"
                title="Nothing gets lost in chat."
                text="Frozen questions. Locked forecasts. A transparent record."
              />
              <div className="history-list">
                {[...rounds].reverse().map((round) => (
                  <details key={round.id}>
                    <summary>
                      <span className="round-number">
                        {String(round.id).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{round.question}</strong>
                        <small>
                          {new Date(round.openedAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}{" "}
                          · {round.locked.length || round.participantCount}{" "}
                          forecasts
                        </small>
                      </div>
                      <span className={"history-status " + round.state}>
                        {round.state === "resolved"
                          ? round.outcome
                            ? "YES"
                            : "NO"
                          : round.state.toUpperCase()}
                        {round.revision > 1 ? " · CORRECTED" : ""}
                      </span>
                      <ChevronDown size={18} />
                    </summary>
                    <div className="history-detail">
                      <p>
                        <b>Yes means:</b> {round.criterion}
                      </p>
                      <p>
                        Locked {time(round.lockedAt)} ·{" "}
                        {round.state === "resolved"
                          ? "Streamer confirmed"
                          : "Awaiting outcome"}
                      </p>
                      {round.reason && <p>Revision note: {round.reason}</p>}
                      <div className="forecast-table">
                        <div>
                          <b>Viewer</b>
                          <b>Forecast for Yes</b>
                          <b>Score</b>
                        </div>
                        {round.locked.slice(0, 10).map((c) => (
                          <div key={c.userId}>
                            <span>{c.name}</span>
                            <span>{c.p}%</span>
                            <span>
                              {round.state === "resolved"
                                ? score(c.p, round.outcome!).score.toFixed(1)
                                : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </>
          ) : (
            <>
              <PageHeading
                eyebrow="YOUR BROADCAST, YOUR RULES"
                title="A little setup. A better show."
                text="Manage Twitch, your OBS overlay, and the details that keep forecasts fair."
              />
              <div className="settings-grid">
                <section className="settings-card">
                  <div className="settings-icon">
                    <Radio size={23} />
                  </div>
                  <h2>Twitch connection</h2>
                  <p>
                    Read calls from your own channel using EventSub. Viewers
                    never need a separate login.
                  </p>
                  <div className="setting-line">
                    <span>Source mode</span>
                    <b className="mini-badge">{data.mode}</b>
                  </div>
                  <div className="setting-line">
                    <span>Connection</span>
                    <b>{data.connection}</b>
                  </div>
                  <div className="setting-line">
                    <span>Last chat received</span>
                    <b>
                      {data.lastMessage
                        ? time(data.lastMessage)
                        : "No live messages yet"}
                    </b>
                  </div>
                  {data.mode === "Demo" && (
                    <p className="settings-note">
                      Demo fixtures are isolated from live data. To go live,
                      follow TWITCH_SETUP.md and configure your own Twitch
                      application.
                    </p>
                  )}
                  <a className="primary" href="/auth/twitch">
                    Connect Twitch <ArrowUpRight size={16} />
                  </a>
                  {data.connection === "connected" && (
                    <button
                      className="text-button"
                      onClick={() =>
                        perform("auth/disconnect", {})
                          .then(() => location.reload())
                          .catch(() => {})
                      }
                    >
                      <LogOut size={15} /> Disconnect & remove tokens
                    </button>
                  )}
                </section>
                <section className="settings-card">
                  <div className="settings-icon">
                    <Eye size={23} />
                  </div>
                  <h2>Your OBS overlay</h2>
                  <p>
                    A transparent, read-only browser source. Your next big
                    moment, without covering the action.
                  </p>
                  <div className="setting-line">
                    <span>Canvas</span>
                    <b>1920 × 1080</b>
                  </div>
                  <div className="setting-line">
                    <span>Access</span>
                    <b>Revocable · Read only</b>
                  </div>
                  <button className="primary" onClick={copyObs}>
                    <Link size={17} /> Copy OBS link
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      perform("overlay/rotate", {})
                        .then((res) => {
                          setToken(res.token);
                          flash(
                            "New overlay credential created. Copy the new OBS link.",
                          );
                        })
                        .catch(() => {})
                    }
                  >
                    <RefreshCw size={16} /> Revoke & rotate link
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setModal("obs")}
                  >
                    Browser source setup <ArrowUpRight size={15} />
                  </button>
                </section>
                <section className="settings-card">
                  <div className="settings-icon">
                    <ShieldCheck size={23} />
                  </div>
                  <h2>Fair by design</h2>
                  <p>
                    One effective forecast per Twitch account. Replacements
                    never add weight. No deposits, wagers, or paid influence.
                  </p>
                  <h4>Moderation & privacy</h4>
                  <p className="quiet">
                    Deleting an open call restores the previous valid revision.
                    After lock, moderation hides attribution but preserves the
                    frozen crowd forecast. Void or correct a round to change
                    scored outcomes.
                  </p>
                  <h4>Public confidence, private totals</h4>
                  <p className="quiet">
                    Forecast aggregates are hidden until lock by default. Calls
                    themselves remain visible in Twitch chat.
                  </p>
                </section>
                <section className="settings-card">
                  <div className="settings-icon">
                    <Clock size={23} />
                  </div>
                  <h2>Your session data</h2>
                  <p>
                    Rounds and forecasts persist locally in SQLite. Demo and
                    live databases stay separate.
                  </p>
                  <button
                    className="primary"
                    disabled={r?.state === "open" || r?.state === "locked"}
                    onClick={() =>
                      perform("sessions", {
                        name: `Session ${Number(data.sessionId) + 1}`,
                      })
                        .then(() => {
                          setPage("Live room");
                          flash(
                            "New session started. Previous rounds remain in the archive export.",
                          );
                        })
                        .catch(() => {})
                    }
                  >
                    <Plus size={16} /> Start a new session
                  </button>
                  <a
                    className="secondary-button"
                    href="/api/history"
                    download="called-it-archive.json"
                  >
                    Export complete archive
                  </a>
                  <a
                    className="secondary-button"
                    href="/api/export"
                    download="called-it-session.json"
                  >
                    <ArrowUpRight size={16} /> Export session JSON
                  </a>
                  <button
                    className="danger-outline"
                    onClick={() => setModal("delete")}
                  >
                    Delete all session data
                  </button>
                  <p className="quiet">
                    Deleting data is permanent. Export your record first.
                  </p>
                </section>
              </div>
              {data.mode === "Demo" && (
                <DemoConsole
                  round={r}
                  onSubmit={async (text, name) => {
                    const res = await perform("demo/call", { text, name });
                    flash(
                      res.accepted
                        ? "Demo call accepted."
                        : "Not accepted. Check the round ID, deadline, and command.",
                    );
                  }}
                />
              )}
            </>
          )}
        </main>
        <footer>
          <Brand small />
          <span>Make your prediction. Put your confidence on record.</span>
          <span>Made for the moments before you know.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <Info size={18} />
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "create" ? "Create a question" : "Called It dialog"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={21} />
            </button>
            {modal === "create" ? (
              <CreateRound
                busy={busy}
                onCreate={async (input) => {
                  await perform("rounds/create", input);
                  setModal(null);
                  setPage("Live room");
                  flash("Calls are open. Let chat know the round ID.");
                }}
              />
            ) : modal === "scoring" ? (
              <>
                <span className="eyebrow">HOW SCORING WORKS</span>
                <h2>Confidence has consequences.</h2>
                <p>
                  We use the binary Brier score. Your probability always means
                  the chance that Yes happens.
                </p>
                <div className="formula">
                  Round score = 100 × (1 − (p − y)²)
                </div>
                <p>
                  Here p is your Yes probability (0–1), and y is 1 for Yes or 0
                  for No. Lower Brier is better; higher round score is better.
                </p>
                <div className="scoring-examples">
                  <div>
                    <b>Your call</b>
                    <b>Outcome</b>
                    <b>Score</b>
                  </div>
                  {[
                    ["Yes · 80%", "Yes", "96"],
                    ["Yes · 80%", "No", "36"],
                    ["No · 80%", "No", "96"],
                    ["Yes · 50%", "Either", "75"],
                    ["Yes · 100%", "No", "0"],
                  ].map((x, i) => (
                    <div key={i}>
                      {x.map((v, j) => (
                        <span key={j}>{v}</span>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="quiet">
                  Scores reward honest confidence in expectation. One high score
                  does not establish skill. No money, wagers, or Twitch Channel
                  Points are involved.
                </p>
              </>
            ) : modal === "obs" ? (
              <>
                <span className="eyebrow">MADE FOR YOUR STREAM</span>
                <h2>A clear view of every call.</h2>
                <p>Add a Browser Source in OBS and set these dimensions:</p>
                <div className="formula">
                  1920 × 1080 · Transparent background
                </div>
                <ol>
                  <li>Copy your OBS link from the live room.</li>
                  <li>
                    Paste the entire link, including its fragment, in OBS.
                  </li>
                  <li>Keep “Shutdown source when not visible” unchecked.</li>
                  <li>Refresh once to verify the locked state returns.</li>
                </ol>
                <p className="quiet">
                  Treat the link as a read-only credential. Rotate it in
                  Settings if shared. Refresh restores state without replaying
                  celebrations.
                </p>
                <button className="primary" onClick={copyObs}>
                  <Copy size={16} /> Copy OBS link
                </button>
              </>
            ) : modal === "delete" ? (
              <>
                <span className="eyebrow">PERMANENT ACTION</span>
                <h2>Delete the session record?</h2>
                <p>
                  All rounds, forecasts, scores, and resolution history will be
                  removed. This cannot be undone.
                </p>
                <button
                  className="danger-button full"
                  onClick={() =>
                    perform("data/delete", {})
                      .then(() => {
                        setModal(null);
                        flash("Session data deleted.");
                      })
                      .catch(() => {})
                  }
                >
                  Delete all data
                </button>
              </>
            ) : (
              <ConfirmRound
                round={r!}
                action={modal === "correct" ? "correct" : confirmAction}
                outcome={outcome}
                setOutcome={setOutcome}
                busy={busy}
                onConfirm={transition}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function time(t: number | null | undefined) {
  return t
    ? new Date(t).toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
}
function OverlayCard({
  data,
  round: r,
  seconds,
  large = false,
  variant = "compact",
}: {
  data: Snapshot;
  round: R;
  seconds: number;
  large?: boolean;
  variant?: string;
}) {
  const open = r.state === "open",
    done = r.state === "resolved",
    p = Math.round(r.crowd || 0);
  if (variant === "series")
    return (
      <div className="overlay-card series-overlay">
        <div className="overlay-card-top">
          <Brand small />
          <span>{data.mode.toUpperCase()} · SERIES</span>
        </div>
        <div className="overlay-card-body">
          <h3>Five rounds. Every call counts.</h3>
          <div className="overlay-series-steps">
            {Array.from({ length: 5 }, (_, i) => {
              const x = data.rounds[i];
              return (
                <span
                  key={i}
                  className={
                    x?.state === "resolved" ? (x.outcome ? "win" : "loss") : ""
                  }
                >
                  <b>{i + 1}</b>
                  <small>
                    {x?.state === "resolved"
                      ? x.outcome
                        ? "YES"
                        : "NO"
                      : x?.state === "locked"
                        ? "LOCKED"
                        : "—"}
                  </small>
                </span>
              );
            })}
          </div>
          <p>Provisional · Forecast every nonvoid round to qualify</p>
        </div>
      </div>
    );
  return (
    <div className={"overlay-card " + (large ? "large" : "")}>
      <div className="overlay-card-top">
        <Brand small />
        <span>
          ROUND {r.id} · {r.state.toUpperCase()}
        </span>
      </div>
      <div className="overlay-card-body">
        <h3>
          {r.question.replace(
            "Will I survive the next attempt?",
            "Survive this attempt?",
          )}
        </h3>
        {open ? (
          <>
            <div className="overlay-countdown">
              {seconds}
              <small>seconds to call it</small>
            </div>
            <code>!call {r.id} yes 80</code>
            <p>{r.participantCount} forecasts · One call per viewer</p>
          </>
        ) : done ? (
          <>
            <div className={"overlay-result " + (r.outcome ? "yes" : "no")}>
              {r.outcome ? "YES" : "NO"} <CheckCircle2 size={24} />
            </div>
            <p>Streamer confirmed · {r.locked.length} calls scored</p>
            <div className="overlay-result-foot">
              Crowd forecast: {p}% Yes ·{" "}
              {r.revision > 1 ? "Corrected" : "On the record"}
            </div>
          </>
        ) : r.state === "void" ? (
          <>
            <div className="overlay-result">VOID</div>
            <p>No scores changed · We go again</p>
          </>
        ) : (
          <>
            <div className="crowd-stat">
              <strong>{r.crowd === null ? "—" : `${p}%`}</strong>
              <span>
                Crowd forecast · <b>YES</b>
              </span>
            </div>
            <div className="probability-bar">
              <span style={{ width: `${p}%` }} />
              <i />
            </div>
            <div className="bar-labels">
              <b>
                {p}% <small>YES</small>
              </b>
              <b>
                {100 - p}% <small>NO</small>
              </b>
            </div>
            <p>{r.locked.length} forecasts · Locked before play</p>
            {large && r.distribution && (
              <div className="distribution-bars">
                {r.distribution.bins.map((n: number, i: number) => (
                  <span
                    key={i}
                    style={{ height: `${10 + n * 4}px` }}
                    title={`${i * 10}–${i * 10 + 10}%: ${n} calls`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <img
        className="overlay-mascot"
        src="/mascot.png"
        alt=""
        aria-hidden="true"
      />
      <div className="overlay-mode">
        <i />
        {data.mode.toUpperCase()}{" "}
        {open
          ? "· CALLS OPEN"
          : done
            ? "· RESULT ON RECORD"
            : "· NO MORE CALLS"}
      </div>
    </div>
  );
}
function Series({ rounds }: { rounds: R[] }) {
  return (
    <section className="series-strip">
      <div className="series-description">
        <h3>
          Five-round series <span />{" "}
          <small>
            {rounds.length >= 5 &&
            rounds
              .slice(0, 5)
              .every((r) => r.state === "resolved" || r.state === "void")
              ? rounds.slice(0, 5).filter((r) => r.state === "resolved")
                  .length >= 3
                ? "Series complete"
                : "Insufficient for ranking"
              : "Results provisional"}
          </small>
        </h3>
        <p>The first five rounds form this set. Every nonvoid call counts.</p>
      </div>
      <div className="series-progress">
        {Array.from({ length: 5 }, (_, i) => {
          const r = rounds.slice(0, 5)[i];
          const state =
            r?.state === "resolved"
              ? r.outcome
                ? "yes"
                : "no"
              : r?.state === "locked" || r?.state === "open"
                ? "progress"
                : r?.state === "void"
                  ? "void"
                  : "pending";
          return (
            <div className={"series-step " + state} key={i}>
              <span>{i + 1}</span>
              <b>
                {state === "progress"
                  ? "IN PROGRESS"
                  : state === "yes"
                    ? "YES"
                    : state === "no"
                      ? "NO"
                      : state === "void"
                        ? "VOID"
                        : "PENDING"}
              </b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Clock size={32} />
      <h3>Good things take a round.</h3>
      <p>{text}</p>
    </div>
  );
}
function ResultCard({ round: r }: { round: R }) {
  const sorted = [...r.locked].sort(
    (a, b) => score(b.p, r.outcome!).score - score(a.p, r.outcome!).score,
  );
  return (
    <section className="result-card">
      <div className="result-card-header">
        <span>ROUND {String(r.id).padStart(2, "0")}</span>
        <span className={"result-chip " + (r.outcome ? "yes" : "no")}>
          {r.outcome ? "YES · Confirmed" : "NO · Confirmed"}
        </span>
      </div>
      <h2>{r.question}</h2>
      <p className="quiet">
        {r.locked.length} forecasts · Streamer confirmed{" "}
        {r.revision > 1 ? "· Corrected result" : ""}
      </p>
      <div className="result-crowd">
        <span>Locked crowd forecast</span>
        <strong>
          {Math.round(r.crowd || 0)}
          <small>% Yes</small>
        </strong>
      </div>
      <div className="award">
        <Trophy size={18} />
        <div>
          <small>SHARPEST CALL · TIES SHARE THE AWARD</small>
          <b>
            {sorted
              .filter(
                (c) =>
                  score(c.p, r.outcome!).score ===
                  score(sorted[0].p, r.outcome!).score,
              )
              .slice(0, 3)
              .map((c) => c.name)
              .join(", ")}
          </b>
        </div>
        <strong>
          {sorted.length
            ? score(sorted[0].p, r.outcome!).score.toFixed(0)
            : "—"}
        </strong>
      </div>
      <div className="result-bottom">
        <span>Neutral baseline</span>
        <b>75 / 100</b>
      </div>
    </section>
  );
}
function Standings({ data }: { data: Snapshot }) {
  const [series, setSeries] = useState(false);
  const rows = series ? data.series : data.leaderboard;
  const nonvoid = data.rounds.slice(0, 5).filter((r) => r.state !== "void");
  const final =
    series &&
    data.rounds.length >= 5 &&
    nonvoid.every((r) => r.state === "resolved") &&
    nonvoid.length >= 3;
  return (
    <>
      <div className="tab-row">
        <button
          className={!series ? "selected" : ""}
          onClick={() => setSeries(false)}
        >
          Session standings
        </button>
        <button
          className={series ? "selected" : ""}
          onClick={() => setSeries(true)}
        >
          Five-round series
        </button>
      </div>
      <div className="standings-note">
        <Info size={17} />
        {series
          ? final
            ? "Final standings. Only complete entrants receive a rank."
            : "Provisional. Forecast every nonvoid round to qualify. At least three resolved rounds are required."
          : "Exploratory standings. Viewers may have answered different questions. Ranked by mean, never total score."}
      </div>
      <section className="leaderboard">
        <div className="leaderboard-row heading">
          <span>RANK</span>
          <span>FORECASTER</span>
          <span>ROUNDS</span>
          <span>MEAN SCORE</span>
        </div>
        {rows.length ? (
          rows.map((row, i) => (
            <div className="leaderboard-row" key={row.userId}>
              <span className={i < 3 ? "top-rank" : ""}>
                {series && (!final || !row.eligible)
                  ? "—"
                  : String(
                      rows
                        .filter((x: any) => !series || x.eligible)
                        .findIndex((x: any) => x.mean === row.mean) + 1,
                    ).padStart(2, "0")}
              </span>
              <div className="forecaster">
                <span className={"initial-avatar color-" + (i % 4)}>
                  {row.name.slice(0, 1)}
                </span>
                <div>
                  <b>{row.name}</b>
                  {series && !row.eligible && (
                    <small>Incomplete · no final rank</small>
                  )}
                </div>
              </div>
              <span>{row.count}</span>
              <strong>
                {row.mean.toFixed(1)}
                <small>/100</small>
              </strong>
            </div>
          ))
        ) : (
          <Empty text="Standings appear after a round has been resolved." />
        )}
      </section>
    </>
  );
}
function Calibration({ data }: { data: Snapshot }) {
  return (
    <section className="calibration">
      <div>
        <span className="eyebrow">THE LONG GAME</span>
        <h2>Does confidence match reality?</h2>
        <p>
          One locked crowd forecast per resolved round.
          <br />
          At least 20 rounds overall and 5 observations per bin.
        </p>
      </div>
      {data.calibration.count < 20 ? (
        <div className="calibration-empty">
          <ChartNoAxesColumnIncreasing size={26} />
          <b>Not enough history</b>
          <span>{data.calibration.count} / 20 resolved crowd forecasts</span>
        </div>
      ) : (
        <svg
          viewBox="0 0 300 180"
          role="img"
          aria-label="Crowd calibration: predicted Yes probability against observed Yes frequency"
        >
          <path d="M30 10V150H290M30 150L290 10" stroke="#c9d6d2" fill="none" />
          {data.calibration.bins
            .filter((b: any) => b.visible)
            .map((b: any, i: number) => (
              <g key={i}>
                <circle
                  cx={30 + b.p * 2.6}
                  cy={150 - b.observed * 1.4}
                  r="5"
                  fill="#008c70"
                />
                <text
                  x={30 + b.p * 2.6}
                  y={140 - b.observed * 1.4}
                  fontSize="9"
                >
                  n={b.count}
                </text>
              </g>
            ))}
          <text x="100" y="174" fontSize="10">
            Predicted Yes probability (%)
          </text>
          <text x="2" y="10" fontSize="9">
            Observed %
          </text>
        </svg>
      )}
    </section>
  );
}
function CreateRound({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: any) => Promise<void>;
}) {
  const [question, setQuestion] = useState("Will I survive the next attempt?"),
    [criterion, setCriterion] = useState(
      "Survive the attempt and reach the next checkpoint. Falling or losing all hearts counts as No.",
    ),
    [duration, setDuration] = useState(45),
    [publicDistribution, setPublic] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ question, criterion, duration, publicDistribution }).catch(
          () => {},
        );
      }}
    >
      <span className="eyebrow">PUT IT ON THE RECORD</span>
      <h2>What’s the next call?</h2>
      <p>Make the question binary. Make the finish line clear.</p>
      <div className="preset-row">
        {["Survive", "Complete", "Beat a time"].map((p, i) => (
          <button
            type="button"
            key={p}
            className="preset"
            onClick={() => {
              setQuestion(
                [
                  "Will I survive the next attempt?",
                  "Will I reach the next checkpoint?",
                  "Will I finish in under 60 seconds?",
                ][i],
              );
              setCriterion(
                [
                  "Survive the attempt and reach the next checkpoint. Falling or losing all hearts counts as No.",
                  "Reach the next checkpoint on this attempt without restarting.",
                  "Complete the next attempt in under 60 seconds on the game timer.",
                ][i],
              );
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <label className="field">
        The question
        <input
          required
          minLength={5}
          maxLength={160}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <label className="field">
        Yes means…
        <textarea
          required
          minLength={5}
          maxLength={500}
          value={criterion}
          onChange={(e) => setCriterion(e.target.value)}
        />
      </label>
      <label className="field">
        Call window
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          <option value={15}>15 seconds · quick demo</option>
          <option value={45}>45 seconds · recommended</option>
          <option value={60}>60 seconds</option>
          <option value={120}>2 minutes</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={publicDistribution}
          onChange={(e) => setPublic(e.target.checked)}
        />{" "}
        Show distribution while calls are open
      </label>
      <p className="quiet">
        The question, criterion, and visibility freeze when published. Start the
        attempt only after calls lock.
      </p>
      <button className="primary full" disabled={busy} type="submit">
        <Radio size={17} />
        {busy ? "Opening…" : "Publish & open calls"}
      </button>
    </form>
  );
}
function ConfirmRound({
  round: r,
  action,
  outcome,
  setOutcome,
  busy,
  onConfirm,
}: {
  round: R;
  action: string;
  outcome: boolean | null;
  setOutcome: (v: boolean) => void;
  busy: boolean;
  onConfirm: (
    action: string,
    result?: boolean,
    reason?: string,
    acknowledge?: boolean,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(action, outcome ?? undefined, reason, ack).catch(() => {});
      }}
    >
      <span className="eyebrow">ROUND {r.id} · FINAL CHECK</span>
      <h2>
        {action === "void"
          ? "Void this attempt?"
          : action === "correct"
            ? "Correct the record."
            : `Confirm ${outcome ? "Yes" : "No"}?`}
      </h2>
      <p className="confirm-question">{r.question}</p>
      <div className="criterion-box">
        <small>THE FROZEN YES CRITERION</small>
        <p>{r.criterion}</p>
        <small>
          {r.locked.length} locked forecasts · Locked {time(r.lockedAt)}
        </small>
      </div>
      {action === "correct" && (
        <div className="preset-row">
          <button
            type="button"
            className={"preset " + (outcome === true ? "chosen" : "")}
            onClick={() => setOutcome(true)}
          >
            Yes
          </button>
          <button
            type="button"
            className={"preset " + (outcome === false ? "chosen" : "")}
            onClick={() => setOutcome(false)}
          >
            No
          </button>
        </div>
      )}
      <label className="field">
        {action === "correct"
          ? "Reason for correction (required)"
          : "Evidence or note (optional)"}
        <textarea
          required={action === "correct"}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            action === "void"
              ? "Technical issue, ambiguous result, or early start…"
              : "Add context for the record…"
          }
        />
      </label>
      {r.disrupted && action !== "void" && (
        <label className="checkbox-field warning">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />{" "}
          I reviewed the ingestion gap and can establish fair participation.
          Otherwise void this round.
        </label>
      )}
      <p className="quiet">
        {action === "void"
          ? "Void rounds do not affect scores or eligibility."
          : "This is a streamer-confirmed outcome. Scores are calculated from the immutable locked forecasts."}
      </p>
      <button
        className={(action === "void" ? "danger-button" : "primary") + " full"}
        disabled={
          busy ||
          (action !== "void" && outcome === null) ||
          (r.disrupted && action !== "void" && !ack)
        }
        type="submit"
      >
        {busy
          ? "Saving…"
          : action === "void"
            ? "Void round · no scores"
            : action === "correct"
              ? "Save correction & recompute"
              : "Confirm & reveal result"}
      </button>
    </form>
  );
}
function DemoConsole({
  round,
  onSubmit,
}: {
  round: R | null | undefined;
  onSubmit: (text: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState("You"),
    [text, setText] = useState(`!call ${round?.id || 1} yes 80`);
  return (
    <section className="demo-console">
      <span className="eyebrow">DEMO SANDBOX · SYNTHETIC INPUT</span>
      <h2>Try a call without Twitch.</h2>
      <p>
        Publish an open round first. These messages use the same parser and
        persistence pipeline as chat.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text, name).catch(() => {});
        }}
      >
        <label className="field">
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={30}
          />
        </label>
        <label className="field">
          Chat command
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </label>
        <button className="primary" type="submit">
          <Send size={16} /> Send demo call
        </button>
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
