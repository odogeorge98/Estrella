# Estrella — React Interface (3D Edition)

Real WebGL now, not SVG: a fluid glowing orb built with React Three Fiber, an
ambient particle "space" field, glassmorphism message bubbles with genuine
Z-axis entrance animation, and code replies rendered as glass terminal blocks
with copy-to-clipboard. Same violet/cyan/magenta palette as before.

## Setup

1. **Run `estrella_v7.ipynb` first**, top to bottom, until Step 10 prints a
   public link like `https://xxxx.gradio.live`.
2. **Install dependencies:** `npm install` (this pulls in `three`,
   `@react-three/fiber`, `@react-three/drei`, and `framer-motion` — new since
   last time, so this install will take a bit longer than before).
3. **Run it:** `npm run dev`, open the printed local URL.
4. **Connect:** paste the gradio.live link into the settings (⚙️) panel.

## What's new in this version

- **Real 3D orb** (`src/Orb.tsx`) — a distorting, glowing sphere (drei's
  `MeshDistortMaterial`) that shifts color, distortion, and pulse speed based
  on her state (idle / listening / thinking / talking), plus an ambient
  particle field (drei's `Sparkles`) around it that livens up while she's
  active.
- **Glass message bubbles** (`src/MessageBubble.tsx`) — animate in with a
  real Z-axis + scale entrance via Framer Motion, not just a fade.
- **Code blocks as glass terminals** — any ` ```lang ... ``` ` in her replies
  renders as its own translucent panel with a working copy button
  (Clipboard API).
- **Session-aware greetings** (backend) — her first reply in a fresh
  conversation opens with an actual time-of-day-appropriate greeting, using
  your name if your voice is verified.
- **Sticky voice verification** (backend, from before) — verify once by
  voice, stays recognized for the rest of that session even through typed
  messages.
- **OCR + real PDF support** (backend) — images get their literal text
  extracted via Tesseract (not just described), and `generate_file` produces
  an actually-formatted, paginated PDF when you ask for one — not a `.txt`
  file wearing a `.pdf` extension.
- **Brain:** still NVIDIA NIM's GLM-5.2 — deliberately kept over an older
  Llama 3.1 70B, since GLM-5.2 benchmarks meaningfully better on the
  tool-use/agentic tasks this whole app depends on.

## Performance note

`Canvas`'s device-pixel-ratio is capped at 1.75 and particle count drops
automatically outside "talking" state, specifically to keep this smooth on
mobile GPUs. If it still feels heavy on an older phone, lowering `count` in
`Orb.tsx`'s `<Sparkles>` call is the first knob to turn.

## Known limitations (honest list)

- Particles ambient-drift in 3D space; they don't literally track where chat
  bubbles sit on screen (that would mean converting DOM layout into 3D world
  coordinates every frame — fragile and expensive for a chat UI that
  constantly reflows). What's built instead responds to *state*, which reads
  as "alive" without that fragility.
- Vision (camera) isn't wired into a dedicated button in this orb interface;
  file upload handles images too, routed through the same analysis path.
- The Colab public link expires when the notebook stops running.


