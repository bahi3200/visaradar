import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

function ShortcutsHost() {
  useGlobalShortcuts();
  return null;
}

function LocationProbe({ onLocation }: { onLocation: (path: string) => void }) {
  const loc = useLocation();
  onLocation(loc.pathname);
  return null;
}

function setup(initialPath = "/") {
  const visits: string[] = [];
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ShortcutsHost />
      <LocationProbe onLocation={(p) => visits.push(p)} />
      <Routes>
        <Route path="*" element={<div data-testid="page" />} />
      </Routes>
    </MemoryRouter>
  );
  return { ...utils, visits };
}

describe("useGlobalShortcuts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("navigates to /dashboard on g then d", () => {
    const { visits } = setup("/");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    expect(visits).toContain("/dashboard");
  });

  it("navigates to /jobs on g then j", () => {
    const { visits } = setup("/");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "j" });
    expect(visits).toContain("/jobs");
  });

  it("opens /help/shortcuts when ? is pressed", () => {
    const { visits } = setup("/");
    fireEvent.keyDown(window, { key: "?" });
    expect(visits).toContain("/help/shortcuts");
  });

  it("focuses an input[type=search] when / is pressed", () => {
    const input = document.createElement("input");
    input.type = "search";
    document.body.appendChild(input);
    setup("/");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
    document.body.removeChild(input);
  });

  it("ignores shortcuts while typing in an input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const { visits } = setup("/");
    const before = visits.length;
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "d" });
    expect(visits.length).toBe(before);
    document.body.removeChild(input);
  });

  it("aborts the g-sequence after timeout", () => {
    const { visits } = setup("/");
    const before = visits.length;
    fireEvent.keyDown(window, { key: "g" });
    vi.advanceTimersByTime(1500);
    fireEvent.keyDown(window, { key: "d" });
    expect(visits.length).toBe(before);
  });
});
