import React, { useState, useCallback, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

/** Renders $...$ and $$...$$ as real maths. She writes LaTeX so students see
 *  the notation exactly as it appears in their textbook and on the exam paper -
 *  "x squared" written out in words looks nothing like what they'll face. */
function MathText({ text }: { text: string }) {
  const html = useMemo(() => {
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let out = escape(text);

    // --- maths first, so markdown can't chew up LaTeX ---
    // Placeholders keep rendered KaTeX out of reach of the markdown pass,
    // which would otherwise mangle things like a^{*} or _subscripts_.
    const mathSlots: string[] = [];
    const stash = (rendered: string) => {
      mathSlots.push(rendered);
      return `\u0000MATH${mathSlots.length - 1}\u0000`;
    };

    out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      try {
        return stash(
          `<div class="math-display">${katex.renderToString(tex.trim(), {
            displayMode: true, throwOnError: false,
          })}</div>`
        );
      } catch { return stash(`<code>${tex}</code>`); }
    });
    out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      try {
        return stash(katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }));
      } catch { return stash(`<code>${tex}</code>`); }
    });

    // --- markdown ---
    // She writes markdown by default; without this it renders as literal
    // **asterisks** and ### hashes, which looks broken and is hard to read.
    out = out.replace(/^###\s+(.+)$/gm, '<span class="md-h3">$1</span>');
    out = out.replace(/^##\s+(.+)$/gm, '<span class="md-h2">$1</span>');
    out = out.replace(/^#\s+(.+)$/gm, '<span class="md-h2">$1</span>');
    out = out.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,)!?]|$)/g, "$1<em>$2</em>");
    // Bullets: "* item" or "- item" at line start
    out = out.replace(/^[\s]*[*-]\s+(.+)$/gm, '<span class="md-li">$1</span>');
    // Numbered items keep their number
    out = out.replace(/^[\s]*(\d+)[.)]\s+(.+)$/gm, '<span class="md-li md-li-num" data-n="$1.">$2</span>');

    // restore maths
    out = out.replace(/\u0000MATH(\d+)\u0000/g, (_, i) => mathSlots[Number(i)]);
    return out;
  }, [text]);

  // Safe: the source is escaped before any HTML is inserted, so nothing the
  // model writes can inject markup - only KaTeX output and our own tags land here.
  return <span className="math-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

function splitCode(text: string): Array<{ type: "text" | "code"; content: string; lang?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", content: m[2].trim(), lang: m[1] || "text" });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return parts.length ? parts : [{ type: "text", content: text }];
}

function CodeBlock({ content, lang }: { content: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  }, [content]);

  return (
    <div className="code-block">
      <div className="code-bar">
        <span className="code-lang">{lang}</span>
        <button onClick={copy} className="code-copy" aria-label={copied ? "Copied" : "Copy code"}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{content}</code></pre>
    </div>
  );
}

/** Subtle line-by-line lift while she's actually speaking this message. */
function SpokenText({ content, active }: { content: string; active: boolean }) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    const ms = Math.min(Math.max(content.length * 71, 1200), 60000);
    const start = performance.now();
    let raf: number;
    const tick = () => {
      const p = Math.min((performance.now() - start) / ms, 1);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, content]);

  if (!active) return <MathText text={content} />;

  const activeLine = Math.floor(progress * lines.length);
  return (
    <>
      {lines.map((line, i) => (
        <span
          key={i}
          className={`line${i === activeLine ? " line-active" : ""}${activeLine > i ? " line-done" : ""}`}
        >
          <MathText text={line} />
          {i < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </>
  );
}

export default function Message({
  role,
  text,
  index,
  isSpeaking,
}: {
  role: "user" | "assistant";
  text: string;
  index: number;
  isSpeaking?: boolean;
}) {
  const segments = useMemo(() => splitCode(text), [text]);
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.015, 0.1), ease: [0.16, 1, 0.3, 1] }}
      className="msg-row"
      style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}
    >
      <div className={isUser ? "msg msg-user" : "msg msg-estrella"}>
        {segments.map((seg, i) =>
          seg.type === "code" ? (
            <CodeBlock key={i} content={seg.content} lang={seg.lang} />
          ) : seg.content.trim() ? (
            <span key={i}>
              {isUser ? seg.content.trim() : <SpokenText content={seg.content.trim()} active={!!isSpeaking} />}
            </span>
          ) : null
        )}
      </div>
    </motion.div>
  );
}
