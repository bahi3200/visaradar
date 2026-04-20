import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Global keyboard shortcuts available across the entire site.
 *
 * - "/"           → focus the first visible search input (or [data-global-search])
 * - "?"           → open the shortcuts help page
 * - "g" then "d"  → /dashboard
 * - "g" then "h"  → /
 * - "g" then "j"  → /jobs
 * - "g" then "r"  → /my-requests
 * - "g" then "p"  → /profile
 * - "g" then "s"  → /help/shortcuts
 * - "g" then "v"  → /visa
 *
 * The "g <key>" sequence works like Gmail/GitHub: press g, then within 1.2s
 * press the second key to navigate.
 */
export const NAV_SEQUENCES: Record<string, { path: string; label: string }> = {
  d: { path: "/dashboard", label: "لوحة التحكم" },
  h: { path: "/", label: "الرئيسية" },
  j: { path: "/jobs", label: "الوظائف" },
  r: { path: "/my-requests", label: "طلباتي" },
  p: { path: "/profile", label: "الملف الشخصي" },
  s: { path: "/help/shortcuts", label: "دليل الاختصارات" },
  v: { path: "/visa", label: "دول الفيزا" },
};

const SEQUENCE_TIMEOUT_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // Inside a Radix dialog content we still allow Esc but not letter shortcuts
  if (target.closest("[role='dialog']")) return true;
  return false;
}

function focusGlobalSearch(): boolean {
  const explicit = document.querySelector<HTMLElement>("[data-global-search]");
  if (explicit) {
    explicit.focus();
    return true;
  }
  const search = document.querySelector<HTMLInputElement>("input[type='search']");
  if (search) {
    search.focus();
    search.select?.();
    return true;
  }
  return false;
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const pendingGRef = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      if (pendingGRef.current !== null) {
        window.clearTimeout(pendingGRef.current);
        pendingGRef.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Sequence: "g" then nav key
      if (pendingGRef.current !== null) {
        const key = e.key.toLowerCase();
        const target = NAV_SEQUENCES[key];
        clearPending();
        if (target) {
          e.preventDefault();
          navigate(target.path);
        }
        return;
      }

      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        pendingGRef.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
        return;
      }

      if (e.key === "/") {
        if (focusGlobalSearch()) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        navigate("/help/shortcuts");
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      clearPending();
      window.removeEventListener("keydown", onKey);
    };
  }, [navigate]);
}
