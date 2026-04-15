import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

export function useReducedMotion() {
  const [shouldReduce, setShouldReduce] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;

    setShouldReduce(prefersReduced.matches || isMobile);

    const onPrefChange = (e: MediaQueryListEvent) => {
      setShouldReduce(e.matches || window.innerWidth < MOBILE_BREAKPOINT);
    };
    const onResize = () => {
      setShouldReduce(prefersReduced.matches || window.innerWidth < MOBILE_BREAKPOINT);
    };

    prefersReduced.addEventListener("change", onPrefChange);
    window.addEventListener("resize", onResize);
    return () => {
      prefersReduced.removeEventListener("change", onPrefChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return shouldReduce;
}
