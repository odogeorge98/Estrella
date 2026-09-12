import { useCallback, useRef } from "react";

/**
 * Live MIC amplitude while YOU are recording.
 *
 * This is safe to use: createMediaStreamSource() taps the microphone stream,
 * which is completely separate from playback. It cannot affect whether
 * Estrella's voice reaches your speakers.
 *
 * Deliberately NOT paired with a playback analyser. Attaching
 * createMediaElementSource() to the <audio> element re-routes her voice
 * through the Web Audio graph, and if that AudioContext isn't running the
 * audio is captured and silently never played - the element reports playing,
 * events fire, and you hear nothing. That is exactly what was breaking her
 * voice. A reactive orb is not worth risking her ability to speak, so
 * playback is left completely untouched and the orb animates from state
 * instead.
 */
export function useMicLevel() {
  const levelRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const start = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      // Intentionally NOT connected to ctx.destination - that would echo your
      // own microphone back at you through the speakers.
      ctxRef.current = ctx;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        levelRef.current += (avg - levelRef.current) * 0.3;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("Mic level unavailable (recording still works):", err);
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    levelRef.current = 0;
  }, []);

  return { levelRef, start, stop };
}
