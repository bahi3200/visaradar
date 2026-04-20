import { useEffect } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

interface UseReceiptShortcutsParams {
  enabled: boolean;
  transformRef: React.MutableRefObject<ReactZoomPanPinchRef | null>;
  onToggleFullscreen: () => void;
  onRotate: () => void;
}

export function useReceiptShortcuts({ enabled, transformRef, onToggleFullscreen, onRotate }: UseReceiptShortcutsParams) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const t = transformRef.current;
      if ((e.key === "+" || e.key === "=") && t) { e.preventDefault(); t.zoomIn(); }
      else if ((e.key === "-" || e.key === "_") && t) { e.preventDefault(); t.zoomOut(); }
      else if (e.key === "0" && t) { e.preventDefault(); t.resetTransform(); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); onToggleFullscreen(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); onRotate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, transformRef, onToggleFullscreen, onRotate]);
}
