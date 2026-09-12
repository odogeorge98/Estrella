import { useState, useEffect } from "react";

export interface Viewport {
  width: number;
  isMobile: boolean;
  isSmall: boolean;   // very narrow phones (<=360px)
  isTouch: boolean;
  markSize: number;   // hero PresenceMark size
  headerMarkSize: number;
}

/**
 * A few sizing decisions can't live in CSS because they're React props
 * (the 3D canvas needs a real pixel size, not a class). Everything else
 * stays in CSS where it belongs.
 *
 * Listens to resize AND orientationchange — rotating a phone doesn't always
 * fire resize reliably on iOS Safari.
 */
export function useViewport(): Viewport {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );
  const [isTouch, setIsTouch] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(pointer: coarse)").matches
  );

  /**
   * Belt-and-braces for in-app browsers (Instagram, WhatsApp, X) whose
   * floating toolbars overlay the page. CSS `svh` handles this on modern
   * browsers; older in-app webviews don't support it, so we also measure the
   * genuinely visible area with the visualViewport API and expose it as a
   * --app-height custom property the shell can fall back to.
   */
  useEffect(() => {
    const setHeight = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    };
    setHeight();
    window.visualViewport?.addEventListener("resize", setHeight);
    window.addEventListener("resize", setHeight);
    window.addEventListener("orientationchange", setHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", setHeight);
      window.removeEventListener("resize", setHeight);
      window.removeEventListener("orientationchange", setHeight);
    };
  }, []);

  useEffect(() => {
    let frame: number;
    const update = () => {
      cancelAnimationFrame(frame);
      // Debounce to a frame so dragging a desktop window doesn't thrash React
      frame = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    const mq = window.matchMedia("(pointer: coarse)");
    const onPointer = () => setIsTouch(mq.matches);
    mq.addEventListener("change", onPointer);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mq.removeEventListener("change", onPointer);
    };
  }, []);

  const isMobile = width <= 640;
  const isSmall = width <= 360;

  return {
    width,
    isMobile,
    isSmall,
    isTouch,
    markSize: isSmall ? 64 : isMobile ? 76 : 92,
    headerMarkSize: isMobile ? 26 : 30,
  };
}
