import React, { useState, useEffect, useRef, useCallback } from "react";
import { Client } from "@gradio/client";
import { Mic, Square, ArrowUp, Settings, UserCheck, Paperclip, X, Play, Camera, Download, Plus, GraduationCap } from "lucide-react";

import PresenceMark, { PresenceState } from "./estrella/PresenceMark";
import Message from "./conversation/Message";
import TeachingPanel, { TeachingState } from "./conversation/TeachingPanel";
import { useMicLevel } from "./hooks/useAudioLevels";
import { useViewport } from "./hooks/useViewport";

// Backend contract UNCHANGED from the v8 notebook:
//   /chat  in:  [text, mic, image, files[], history, cloned_voice, session_verified, guest_name]
//          out: [history, audio, cleared, nav_url, verify_json, file, session_verified, guest_name]
//   /enroll · /save_voice_sample unchanged

type ChatMessage = { role: "user" | "assistant"; content: string | { type: string; text: string } | Array<{ type: string; text: string }> };
type VerifyInfo = { verified: boolean; similarity: number; freshCheck: boolean };

const STORAGE_KEY = "estrella_backend_url";
const GUEST_NAME_KEY = "estrella_guest_name";

function extractText(c: ChatMessage["content"]): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => x.text || "").join(" ");
  if (c && typeof c === "object" && "text" in c) return c.text;
  return "";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = () => setReduced(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return reduced;
}

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [urlDraft, setUrlDraft] = useState(backendUrl);
  const [showSettings, setShowSettings] = useState(!backendUrl);
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageAudio, setMessageAudio] = useState<Record<number, string>>({});
  const [messageFile, setMessageFile] = useState<Record<number, { url: string; name: string }>>({});
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [verifyInfo, setVerifyInfo] = useState<VerifyInfo | null>(null);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [guestName, setGuestName] = useState(() => localStorage.getItem(GUEST_NAME_KEY) || "");
  // Server-owned session id. Null until the first message creates one.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState(() => localStorage.getItem("estrella_recovery_code") || "");
  const [showCode, setShowCode] = useState("");
  const [teaching, setTeaching] = useState<TeachingState | null>(null);
  const [showTeachSetup, setShowTeachSetup] = useState(false);
  const [teachSubject, setTeachSubject] = useState("Mathematics");
  const [teachLevel, setTeachLevel] = useState("waec");
  const [teachTopic, setTeachTopic] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const [showVoice, setShowVoice] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState("");
  const [isEnrolling, setIsEnrolling] = useState<0 | 1 | 2>(0);
  const [s1, setS1] = useState<Blob | null>(null);
  const [s2, setS2] = useState<Blob | null>(null);
  const [cloneStatus, setCloneStatus] = useState("");
  const [isCloneRec, setIsCloneRec] = useState(false);
  const [useClonedVoice, setUseClonedVoice] = useState(false);

  const clientRef = useRef<Client | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const genChunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendToBackendRef = useRef<typeof send | null>(null);

  const reducedMotion = useReducedMotion();
  // Mic level only. Her PLAYBACK is never routed through Web Audio - see the
  // comment in useAudioLevels.ts for why that silenced her.
  const { levelRef, start: startMicLevel, stop: stopMicLevel } = useMicLevel();
  const vp = useViewport();

  const state: PresenceState = hasError
    ? "error"
    : isTalking
    ? "speaking"
    : isThinking
    ? "thinking"
    : isRecording
    ? "listening"
    : "idle";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!backendUrl) return;
    let cancelled = false;
    setConnectError("");
    setConnected(false);
    Client.connect(backendUrl)
      .then((c) => { if (!cancelled) { clientRef.current = c; setConnected(true); } })
      .catch((err) => {
        if (cancelled) return;
        setConnectError("Couldn't connect. Check the link is current and Colab is still running.");
        console.error(err);
      });
    return () => { cancelled = true; };
  }, [backendUrl]);

  const send = useCallback(
    async (text: string, audioBlob: Blob | null, files: File[], image: File | null) => {
      if (!clientRef.current) { setConnectError("Not connected yet."); return; }
      setIsThinking(true);
      try {
        const audioFile = audioBlob ? new File([audioBlob], "input.wav", { type: audioBlob.type }) : null;
        const res: any = await clientRef.current.predict("/chat", [
          text, audioFile, image, files.length ? files : null,
          messages, useClonedVoice, sessionVerified, guestName, sessionId,
        ]);
        const [history, audioReply, , navUrl, verifyJson, genFile, newVerified, newName, newSessionId, teachJson, newCode] = res.data;

        if (typeof newSessionId === "string" && newSessionId) setSessionId(newSessionId);
        if (typeof newCode === "string" && newCode) {
          setRecoveryCode(newCode);
          setShowCode(newCode);
          localStorage.setItem("estrella_recovery_code", newCode);
        }
        if (typeof teachJson === "string") {
          try {
            const t = JSON.parse(teachJson);
            setTeaching(t?.active ? t : null);
          } catch { /* ignore malformed teaching state */ }
        }

        if (Array.isArray(history)) setMessages(history as ChatMessage[]);
        if (typeof newVerified === "boolean") setSessionVerified(newVerified);
        if (typeof newName === "string" && newName && newName !== guestName) {
          setGuestName(newName);
          localStorage.setItem(GUEST_NAME_KEY, newName);
        }
        if (verifyJson) {
          try {
            const p = JSON.parse(verifyJson);
            setVerifyInfo({ verified: !!p.verified, similarity: p.similarity || 0, freshCheck: !!p.fresh_check });
          } catch { /* ignore malformed badge */ }
        }
        const lastIndex = Array.isArray(history) ? history.length - 1 : null;
        if (genFile) {
          const url = typeof genFile === "string" ? genFile : genFile.url;
          const name = typeof genFile === "object" ? genFile.orig_name || "download" : "download";
          if (url && lastIndex !== null) setMessageFile((p) => ({ ...p, [lastIndex]: { url, name } }));
        }
        if (navUrl) window.open(navUrl, "_blank");
        if (audioReply) {
          const src = typeof audioReply === "string" ? audioReply : audioReply.url;
          if (src && lastIndex !== null) setMessageAudio((p) => ({ ...p, [lastIndex]: src }));
          if (src && audioRef.current) {
            // NOTE: isTalking is NOT set here. It's driven entirely by the
            // audio element's real `playing` event below. Setting it
            // optimistically was the bug that left her stuck showing
            // "speaking" whenever the audio failed to load — no `ended` or
            // `pause` event ever fires in that case, so it never cleared.
            audioRef.current.src = src;
            setSpeakingIndex(lastIndex);
            audioRef.current.play().catch((e) => {
              console.warn("Autoplay blocked — use the play button on the message:", e);
              setSpeakingIndex(null);
            });
          }
        }
      } catch (err: any) {
        // Gradio errors arrive as a status object, not an Error, so a bare
        // console.error(err) just shows "{type: 'status', ...}" with the
        // actual reason buried. Dig the real message out and show it.
        const detail =
          err?.message ||
          err?.error ||
          (Array.isArray(err?.detail) ? err.detail.join(" ") : err?.detail) ||
          (typeof err === "string" ? err : "") ||
          JSON.stringify(err)?.slice(0, 300);
        console.error("Estrella /chat failed:", detail, err);
        setConnectError(`Estrella hit an error: ${detail}`);
        setHasError(true);
        window.setTimeout(() => setHasError(false), 2200);
      } finally {
        setIsThinking(false);
        setPendingFiles([]);
        setPendingImage(null);
      }
    },
    [messages, useClonedVoice, sessionVerified, guestName, sessionId, recoveryCode]
  );

  sendToBackendRef.current = send;

  /** Explicit teaching on/off. Keyword detection is a nicety; this button is
   *  the control that actually decides, so it can't silently fail to fire. */
  const toggleTeaching = useCallback(
    async (on: boolean, subject = "", level = "waec", topic = "") => {
      if (!clientRef.current) return;
      try {
        const res: any = await clientRef.current.predict("/set_teaching", [on, subject, level, topic]);
        const raw = res.data?.[0];
        if (typeof raw === "string") {
          const t = JSON.parse(raw || "{}");
          setTeaching(t?.active ? t : null);
        }
        setShowTeachSetup(false);
        if (on && topic) {
          send(`Start teaching me ${topic}`, null, [], null);
        }
      } catch (err) {
        console.error("teaching toggle failed:", err);
        setConnectError("Couldn't switch teaching mode — check the console.");
      }
    },
    [send]
  );

  const replay = useCallback((url: string, i: number) => {
    if (!audioRef.current) return;
    audioRef.current.src = url;
    setSpeakingIndex(i);
    audioRef.current.play().catch(() => setSpeakingIndex(null));
  }, []);

  const sendText = useCallback(() => {
    const t = input.trim();
    if (!t && !pendingFiles.length && !pendingImage) return;
    setInput("");
    send(t, null, pendingFiles, pendingImage);
  }, [input, pendingFiles, pendingImage, send]);

  const toggleMic = useCallback(async () => {
    if (isRecording) { recorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startMicLevel(stream);
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stopMicLevel();
        stream.getTracks().forEach((t) => t.stop());
        send("", new Blob(chunksRef.current, { type: "audio/webm" }), pendingFiles, pendingImage);
      };
      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setConnectError("Microphone access was blocked or unavailable.");
    }
  }, [isRecording, send, pendingFiles, pendingImage, startMicLevel, stopMicLevel]);

  const recordFor = useCallback((ms: number, done: (b: Blob) => void, fail: () => void) => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const rec = new MediaRecorder(stream);
      genChunksRef.current = [];
      rec.ondataavailable = (e) => genChunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        done(new Blob(genChunksRef.current, { type: "audio/webm" }));
      };
      rec.start();
      window.setTimeout(() => rec.stop(), ms);
    }).catch((e) => { console.error(e); fail(); });
  }, []);

  const recordEnroll = useCallback((n: 1 | 2) => {
    setIsEnrolling(n);
    setEnrollStatus(`Recording sample ${n} — speak naturally for ~15 seconds.`);
    recordFor(15000, (b) => {
      n === 1 ? setS1(b) : setS2(b);
      setEnrollStatus(`Sample ${n} captured.` + (n === 1 ? " Record sample 2, or save." : ""));
      setIsEnrolling(0);
    }, () => { setEnrollStatus("Microphone blocked or unavailable."); setIsEnrolling(0); });
  }, [recordFor]);

  const saveVoiceprint = useCallback(async () => {
    if (!clientRef.current || !s1) return;
    setEnrollStatus("Saving voiceprint...");
    try {
      const f1 = new File([s1], "s1.wav", { type: s1.type });
      const f2 = s2 ? new File([s2], "s2.wav", { type: s2.type }) : null;
      const r: any = await clientRef.current.predict("/enroll", [f1, f2]);
      setEnrollStatus(r.data?.[0] || "Voiceprint saved.");
    } catch (e) { console.error(e); setEnrollStatus("Couldn't save — check the console."); }
  }, [s1, s2]);

  const recordClone = useCallback(() => {
    setIsCloneRec(true);
    setCloneStatus("Recording — speak naturally for ~20 seconds.");
    recordFor(20000, async (b) => {
      setIsCloneRec(false);
      if (!clientRef.current) return;
      setCloneStatus("Saving...");
      try {
        const r: any = await clientRef.current.predict("/save_voice_sample", [new File([b], "clone.wav", { type: b.type })]);
        setCloneStatus(r.data?.[0] || "Voice sample saved.");
      } catch (e) { console.error(e); setCloneStatus("Couldn't save — check the console."); }
    }, () => { setCloneStatus("Microphone blocked or unavailable."); setIsCloneRec(false); });
  }, [recordFor]);

  /** Starts a genuinely separate conversation - the backend creates a fresh
   *  session on the next message, so this one never inherits the old thread. */
  const newConversation = useCallback(() => {
    setMessages([]);
    setMessageAudio({});
    setMessageFile({});
    setSpeakingIndex(null);
    setSessionId(null);
  }, []);

  const hasChat = messages.length > 0;
  const statusText = !connected ? "offline"
    : state === "error" ? "error"
    : state === "speaking" ? "speaking"
    : state === "thinking" ? "thinking"
    : state === "listening" ? "listening"
    : verifyInfo?.verified ? "george" : "ready";

  return (
    <div className={`page-bg app-shell relative w-full flex flex-col${teaching ? " teaching-active" : ""}`}>
      {/* Single persistent WebGL context. It never unmounts - it just moves
          and resizes between the hero position and the header slot, because
          mounting/unmounting a Canvas churns through WebGL contexts until the
          browser starts dropping them ("THREE.WebGLRenderer: Context Lost"). */}
      <div className={`mark-layer ${hasChat ? "mark-layer-header" : "mark-layer-hero"}`}>
        <PresenceMark
          state={state}
          levelRef={levelRef}
          size={hasChat ? vp.headerMarkSize : vp.markSize}
          reducedMotion={reducedMotion}
        />
      </div>
      <audio
        ref={audioRef}
        // isTalking is driven ONLY by real playback events, so a failed or
        // blocked audio load can never leave the UI stuck on "speaking".
        onPlaying={() => setIsTalking(true)}
        onEnded={() => { setIsTalking(false); setSpeakingIndex(null); }}
        onPause={() => { setIsTalking(false); setSpeakingIndex(null); }}
        onError={() => {
          setIsTalking(false);
          setSpeakingIndex(null);
          // Say so out loud instead of silently pretending she spoke.
          setVoiceNotice("Her reply came through, but the audio for it didn't load.");
          window.setTimeout(() => setVoiceNotice(""), 5000);
          console.warn("Estrella's audio failed to load.");
        }}
        hidden
      />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between app-gutter app-header flex-shrink-0"
        style={{ borderBottom: hasChat ? "1px solid var(--border)" : "none" }}>
        <div className="flex items-center gap-2.5">
          <div className="header-mark-slot" aria-hidden="true" />
          <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Estrella</span>
          <span style={{
            color: verifyInfo?.verified ? "#4ade80" : "var(--text-dim)",
            fontSize: 11, fontWeight: 500,
            padding: "2px 8px", borderRadius: 999,
            background: verifyInfo?.verified ? "rgba(74,222,128,.1)" : "rgba(255,255,255,.04)",
            border: `1px solid ${verifyInfo?.verified ? "rgba(74,222,128,.25)" : "var(--border)"}`,
          }}>{statusText}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {hasChat && (
            <button onClick={newConversation} className="icon-btn" style={{ width: vp.isTouch ? 40 : 32, height: vp.isTouch ? 40 : 32 }} aria-label="New conversation">
              <Plus size={16} />
            </button>
          )}
          <button
            onClick={() => (teaching ? toggleTeaching(false) : setShowTeachSetup((v) => !v))}
            className={`icon-btn${teaching ? " icon-btn-active" : ""}`}
            style={{ width: vp.isTouch ? 40 : 32, height: vp.isTouch ? 40 : 32 }}
            aria-label={teaching ? "Leave teaching mode" : "Start teaching mode"}
            title={teaching ? "Leave teaching mode" : "Start teaching mode"}
          >
            <GraduationCap size={16} />
          </button>
          <button onClick={() => setShowVoice((s) => !s)} className="icon-btn" style={{ width: vp.isTouch ? 40 : 32, height: vp.isTouch ? 40 : 32 }} aria-label="Voice setup">
            <UserCheck size={16} />
          </button>
          <button onClick={() => setShowSettings((s) => !s)} className="icon-btn" style={{ width: vp.isTouch ? 40 : 32, height: vp.isTouch ? 40 : 32 }} aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {connectError && (
        <div className="notice relative z-10 mx-auto mt-3 rounded-xl text-xs flex justify-between items-center gap-3"
          style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.3)", color: "#fca5b1" }}>
          <span>{connectError}</span>
          <button onClick={() => setConnectError("")} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {voiceNotice && (
        <div className="notice relative z-10 mx-auto mt-3 rounded-xl text-xs flex justify-between items-center gap-3"
          style={{ background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.28)", color: "#fcd34d" }}>
          <span>{voiceNotice}</span>
          <button onClick={() => setVoiceNotice("")} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {showSettings && (
        <div className="panel sheet relative z-20 mx-auto mt-3">
          <p style={{ color: "var(--text-dim)", fontSize: 13 }} className="mb-2.5">Colab gradio.live link</p>
          <div className="flex gap-2">
            <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://xxxx.gradio.live"
              className="flex-1 bg-transparent px-3 py-2 rounded-lg text-sm"
              style={{ color: "var(--text)", border: "1px solid var(--border)" }} />
            <button onClick={() => { const t = urlDraft.trim(); if (!t) return; localStorage.setItem(STORAGE_KEY, t); setBackendUrl(t); setShowSettings(false); }}
              className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--text)", color: "var(--bg)" }}>
              Connect
            </button>
          </div>
          {connected && <p style={{ color: "#4ade80", fontSize: 12 }} className="mt-2.5">Connected</p>}
          <p style={{ color: "var(--text-dim)", fontSize: 13 }} className="mt-4 mb-2">Recovery code (restores a previous session)</p>
          <input
            value={recoveryCode}
            onChange={(e) => {
              setRecoveryCode(e.target.value.toUpperCase());
              localStorage.setItem("estrella_recovery_code", e.target.value.toUpperCase());
            }}
            placeholder="ABCD-2345"
            aria-label="Recovery code"
            className="w-full bg-transparent px-3 py-2 rounded-lg text-sm"
            style={{ color: "var(--text)", border: "1px solid var(--border)", letterSpacing: "0.1em" }}
          />
        </div>
      )}

      {showVoice && (
        <div className="panel sheet relative z-20 mx-auto mt-3 flex flex-col gap-4 overflow-y-auto scroll-thin">
          <div>
            <p style={{ color: "var(--text)", fontSize: 13, fontWeight: 500 }} className="mb-1">Recognize my voice</p>
            <p style={{ color: "var(--text-dim)", fontSize: 12 }} className="mb-2.5">Two samples give a steadier voiceprint.</p>
            <div className="flex gap-2 mb-2">
              {([1, 2] as const).map((n) => {
                const got = n === 1 ? s1 : s2;
                return (
                  <button key={n} onClick={() => recordEnroll(n)} disabled={isEnrolling !== 0}
                    className="flex-1 px-3 py-2 rounded-lg text-xs disabled:opacity-40"
                    style={{ background: got ? "rgba(74,222,128,.08)" : "var(--surface-hi)",
                      border: `1px solid ${got ? "rgba(74,222,128,.3)" : "var(--border)"}`,
                      color: got ? "#4ade80" : "var(--text)" }}>
                    {isEnrolling === n ? "Recording..." : got ? `Sample ${n} ✓` : `Record ${n}`}
                  </button>
                );
              })}
            </div>
            <button onClick={saveVoiceprint} disabled={!s1 || !connected}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30"
              style={{ background: "var(--text)", color: "var(--bg)" }}>Save voiceprint</button>
            {enrollStatus && <p style={{ color: "var(--text-dim)", fontSize: 12 }} className="mt-2">{enrollStatus}</p>}
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} className="pt-3.5">
            <p style={{ color: "var(--text)", fontSize: 13, fontWeight: 500 }} className="mb-2">Speak in my voice</p>
            <button onClick={recordClone} disabled={isCloneRec || !connected}
              className="w-full px-3 py-2 rounded-lg text-xs disabled:opacity-40 mb-2"
              style={{ background: "var(--surface-hi)", border: "1px solid var(--border)", color: "var(--text)" }}>
              {isCloneRec ? "Recording..." : "Record ~20s sample"}
            </button>
            {cloneStatus && <p style={{ color: "var(--text-dim)", fontSize: 12 }} className="mb-2">{cloneStatus}</p>}
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
              <input type="checkbox" checked={useClonedVoice} onChange={(e) => setUseClonedVoice(e.target.checked)} />
              Reply in my cloned voice
            </label>
          </div>
        </div>
      )}

      {/* empty state — the mark is the hero here, but small and calm */}
      {!hasChat && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 sm:gap-5 app-gutter">
          <div className="hero-mark-slot" aria-hidden="true" />
          <div className="text-center">
            <p className="hero-title" style={{ color: "var(--text)", fontWeight: 500, letterSpacing: "-0.02em" }}>
              {connected ? "What can I help with?" : "Connect to begin"}
            </p>
            {verifyInfo?.verified && (
              <p style={{ color: "#4ade80", fontSize: 12.5, marginTop: 7 }}>
                {verifyInfo.freshCheck ? `Voice verified · ${Math.round(verifyInfo.similarity * 100)}% match` : "Voice verified"}
              </p>
            )}
          </div>
        </div>
      )}

      {showCode && (
        <div className="code-banner app-gutter">
          <div>
            <div className="code-banner-label">Your recovery code — write this down</div>
            <div className="code-banner-code">{showCode}</div>
            <div className="code-banner-hint">Enter it in settings on any device to get this conversation and your progress back.</div>
          </div>
          <button onClick={() => setShowCode("")} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {showTeachSetup && !teaching && (
        <div className="panel sheet relative z-20 mx-auto mt-3">
          <p className="teach-setup-title">Start a lesson</p>

          <label className="teach-field-label">Subject</label>
          <select value={teachSubject} onChange={(e) => setTeachSubject(e.target.value)} className="teach-select" aria-label="Subject">
            {["Mathematics","English Language","Physics","Chemistry","Biology","Economics",
              "Government","Literature-in-English","Geography","Commerce","Accounting",
              "Further Mathematics","Agricultural Science","Civic Education"].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>

          <label className="teach-field-label">Level</label>
          <div className="teach-levels">
            {[["jamb","JAMB"],["waec","WAEC"],["university","University"]].map(([v,label]) => (
              <button key={v} onClick={() => setTeachLevel(v)}
                className={`teach-level${teachLevel === v ? " teach-level-on" : ""}`}>
                {label}
              </button>
            ))}
          </div>

          <label className="teach-field-label">Topic</label>
          <input value={teachTopic} onChange={(e) => setTeachTopic(e.target.value)}
            placeholder="e.g. quadratic equations" aria-label="Topic"
            onKeyDown={(e) => e.key === "Enter" && teachTopic.trim() && toggleTeaching(true, teachSubject, teachLevel, teachTopic)}
            className="teach-input" />

          <div className="teach-setup-actions">
            <button onClick={() => setShowTeachSetup(false)} className="teach-cancel">Cancel</button>
            <button onClick={() => toggleTeaching(true, teachSubject, teachLevel, teachTopic)}
              disabled={!teachTopic.trim() || !connected} className="teach-start">
              Start lesson
            </button>
          </div>
        </div>
      )}

      {teaching && (
        <TeachingPanel
          teaching={teaching}
          onExit={() => toggleTeaching(false)}
        />
      )}

      {hasChat && (
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scroll-thin">
          <div className="thread max-w-2xl mx-auto app-gutter flex flex-col">
            {messages.map((m, i) => (
              <div key={i} className="flex items-end gap-1.5" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <Message role={m.role} text={extractText(m.content)} index={i} isSpeaking={speakingIndex === i} />
                {m.role === "assistant" && messageAudio[i] && (
                  <button onClick={() => replay(messageAudio[i], i)} className="icon-btn flex-shrink-0"
                    style={{ width: 22, height: 22 }} aria-label="Play again"><Play size={10} /></button>
                )}
                {m.role === "assistant" && messageFile[i] && (
                  <a href={messageFile[i].url} download={messageFile[i].name} target="_blank" rel="noreferrer"
                    className="icon-btn flex-shrink-0" style={{ width: 22, height: 22, color: "var(--cyan)" }}
                    aria-label={`Download ${messageFile[i].name}`}><Download size={10} /></a>
                )}
              </div>
            ))}

          </div>
        </div>
      )}

      {/* Thinking indicator sits directly above the composer and is always
          mounted — it used to live inside the message list, which meant it
          never appeared at all on the very first question (no list yet) and
          could be scrolled out of view on later ones. */}
      {isThinking && (
        <div className="relative z-10 w-full max-w-2xl mx-auto app-gutter flex-shrink-0">
          <div className="thinking-row thinking-card">
            <span className="thinking-spinner" aria-hidden="true" />
            <span className="thinking-text">Estrella is thinking</span>
            <span className="thinking-dots">
              {[0, 1, 2].map((i) => (
                <span key={i} className="thinking-dot" style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </span>
          </div>
        </div>
      )}

      {/* composer */}
      <div className="composer-wrap relative z-10 w-full max-w-2xl mx-auto app-gutter flex-shrink-0">
        {(pendingFiles.length > 0 || pendingImage) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="chip">{f.name}
                <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={11} /></button>
              </div>
            ))}
            {pendingImage && (
              <div className="chip" style={{ color: "var(--cyan)" }}>{pendingImage.name}
                <button onClick={() => setPendingImage(null)} aria-label="Remove image"><X size={11} /></button>
              </div>
            )}
          </div>
        )}
        <div className="composer px-2.5 py-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder={!connected ? "Connect a backend first" : isRecording ? "Listening..." : "Message Estrella"}
            disabled={!connected || isRecording} aria-label="Message Estrella"
            className="composer-input w-full bg-transparent px-2 py-1.5" style={{ color: "var(--text)" }} />
          <div className="flex items-center justify-between pt-1.5">
            <div className="flex items-center gap-0.5">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && setPendingFiles((p) => [...p, ...Array.from(e.target.files!)])} />
              <button onClick={() => fileRef.current?.click()} disabled={!connected} className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Attach files"><Paperclip size={15} /></button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && setPendingImage(e.target.files[0])} />
              <button onClick={() => photoRef.current?.click()} disabled={!connected} className="icon-btn" style={{ width: vp.isTouch ? 38 : 30, height: vp.isTouch ? 38 : 30, color: pendingImage ? "var(--cyan)" : undefined }} aria-label="Add image"><Camera size={15} /></button>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleMic} disabled={!connected} aria-label={isRecording ? "Stop recording" : "Speak"}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 disabled:opacity-30"
                style={{ background: isRecording ? "rgba(244,63,94,.12)" : "transparent",
                  border: `1px solid ${isRecording ? "rgba(244,63,94,.4)" : "var(--border)"}`,
                  color: isRecording ? "#fca5b1" : "var(--text-dim)", cursor: "pointer" }}>
                {isRecording ? <Square size={12} /> : <Mic size={13} />}
                <span style={{ fontSize: 12, fontWeight: 500 }}>{isRecording ? "Stop" : "Speak"}</span>
              </button>
              <button onClick={sendText} disabled={!connected || (!input.trim() && !pendingFiles.length && !pendingImage)}
                className="send-btn" aria-label="Send"><ArrowUp size={15} /></button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes blink { 0%,100% { opacity:.25 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
