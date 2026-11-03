import { useEffect, useRef } from "react";

export default function useEdgeBounce() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let lastBounce = -Infinity;
    const bounce = (event: WheelEvent) => {
      if (
        motion.matches ||
        event.ctrlKey ||
        Math.abs(event.deltaY) < 2 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return;
      const root = document.scrollingElement;
      if (!root || root.scrollHeight <= root.clientHeight) return;
      const top = event.deltaY < 0 && root.scrollTop <= 0;
      const bottom =
        event.deltaY > 0 &&
        root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
      if ((!top && !bottom) || performance.now() - lastBounce < 450) return;
      // Leave independently scrolling tables, feeds and controls to the browser.
      for (
        let el = event.target instanceof Element ? event.target : null;
        el && el !== document.body;
        el = el.parentElement
      ) {
        if (
          el.matches("input, select, textarea") ||
          (el.scrollHeight > el.clientHeight &&
            /auto|scroll/.test(getComputedStyle(el).overflowY))
        )
          return;
      }
      if (!ref.current) return;
      lastBounce = performance.now();
      const distance =
        Math.min(7, Math.abs(event.deltaY) * 0.15) * (top ? 1 : -1);
      animation?.cancel();
      animation = ref.current.animate(
        [
          { translate: "0 0", offset: 0 },
          { translate: `0 ${distance}px`, offset: 0.3 },
          { translate: `0 ${-distance * 0.12}px`, offset: 0.7 },
          { translate: "0 0", offset: 1 },
        ],
        { duration: 400, easing: "ease-out" },
      );
    };
    window.addEventListener("wheel", bounce, { passive: true });
    return () => {
      window.removeEventListener("wheel", bounce);
      animation?.cancel();
    };
  }, []);
  return ref;
}
