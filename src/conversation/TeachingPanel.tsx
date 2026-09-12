import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, GraduationCap, X, AlertCircle } from "lucide-react";

export interface TeachingState {
  active: boolean;
  subject: string;
  level: string;
  topic: string;
  step: number;      // 1-based
  total: number;
  current: string;
  plan: string[];
  struggles: string[];
}

/** Circular progress ring — reads faster than a number at a glance. */
function ProgressRing({ step, total }: { step: number; total: number }) {
  const pct = total > 0 ? Math.min(step / total, 1) : 0;
  const r = 20;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="teach-ring" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={total}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--border-hi)" strokeWidth="3" />
        <motion.circle
          cx="24" cy="24" r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          transform="rotate(-90 24 24)"
          style={{ filter: "drop-shadow(0 0 5px rgba(167,139,250,.65))" }}
        />
      </svg>
      <span className="teach-ring-label">
        {step}<span className="teach-ring-total">/{total}</span>
      </span>
    </div>
  );
}

/**
 * The lesson plan as 3D step cards. Seeing the whole path — what's done,
 * what's now, what's coming — is the difference between a student feeling
 * lost in a wall of chat and knowing exactly where they are.
 */
function StepCards({ plan, step }: { plan: string[]; step: number }) {
  return (
    <div className="teach-steps">
      {plan.map((label, i) => {
        const index = i + 1;
        const done = index < step;
        const now = index === step;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14, rotateX: -18 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            className={`teach-step${done ? " teach-step-done" : ""}${now ? " teach-step-now" : ""}`}
          >
            <div className="teach-step-num">
              {done ? <Check size={11} strokeWidth={3} /> : index}
            </div>
            <span className="teach-step-label">{label}</span>
            {now && (
              <motion.div
                className="teach-step-glow"
                layoutId="stepGlow"
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export default function TeachingPanel({
  teaching,
  onExit,
}: {
  teaching: TeachingState;
  onExit: () => void;
}) {
  const levelLabel = useMemo(() => (teaching.level || "").toUpperCase(), [teaching.level]);

  return (
    <AnimatePresence>
      <motion.div
        key="teach-panel"
        initial={{ opacity: 0, y: -22, rotateX: -10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="teach-panel app-gutter"
      >
        <div className="teach-panel-inner">
          <div className="teach-top">
            <div className="teach-identity">
              <div className="teach-icon">
                <GraduationCap size={16} />
              </div>
              <div>
                <div className="teach-title-row">
                  <span className="teach-subject">{teaching.subject}</span>
                  {levelLabel && <span className="teach-badge">{levelLabel}</span>}
                </div>
                {teaching.topic && <div className="teach-topic">{teaching.topic}</div>}
              </div>
            </div>

            <div className="teach-right">
              {teaching.total > 0 && <ProgressRing step={teaching.step} total={teaching.total} />}
              <button onClick={onExit} className="teach-exit" aria-label="Leave teaching mode">
                <X size={15} />
              </button>
            </div>
          </div>

          {teaching.plan.length > 0 && <StepCards plan={teaching.plan} step={teaching.step} />}

          {teaching.current && (
            <motion.div
              key={teaching.current}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="teach-now"
            >
              <span className="teach-now-label">Now covering</span>
              <span className="teach-now-text">{teaching.current}</span>
            </motion.div>
          )}

          {teaching.struggles.length > 0 && (
            <div className="teach-struggles">
              <AlertCircle size={12} />
              <span>Watch: {teaching.struggles.join(" · ")}</span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
