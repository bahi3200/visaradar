import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTelegramLinkPolling } from "./useTelegramLinkPolling";

// --- Mocks ---
const maybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: (...args: unknown[]) => maybeSingle(...args),
        })),
      })),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
  maybeSingle.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useTelegramLinkPolling", () => {
  it("polls profile every interval while enabled and userId is set", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    renderHook(
      () =>
        useTelegramLinkPolling({
          userId: "user-1",
          enabled: true,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper }
    );

    expect(maybeSingle).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("stops polling immediately when userId becomes null (sign-out)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        useTelegramLinkPolling({
          userId,
          enabled: true,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper, initialProps: { userId: "user-1" as string | null } }
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    // Sign out
    rerender({ userId: null });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // No further polls should occur after sign-out
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("stops polling immediately when userId changes (account switch) and ignores stale in-flight responses", async () => {
    // Pending promise we control manually for the FIRST user
    let resolveStale: (v: unknown) => void = () => {};
    const stalePromise = new Promise((res) => {
      resolveStale = res;
    });

    // First call hangs; subsequent calls (after switch) resolve normally.
    maybeSingle
      .mockImplementationOnce(() => stalePromise)
      .mockResolvedValue({ data: null, error: null });

    const onLinked = vi.fn();

    const { rerender } = renderHook(
      ({ userId }: { userId: string }) =>
        useTelegramLinkPolling({
          userId,
          enabled: true,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper, initialProps: { userId: "user-1" } }
    );

    // Trigger the first (hanging) request
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    // Switch to a different user BEFORE first request resolves
    rerender({ userId: "user-2" });

    // Now stale request resolves with a linked telegram_id for the OLD user.
    await act(async () => {
      resolveStale({ data: { telegram_id: "stale-old-tg" }, error: null });
      await Promise.resolve();
    });

    // onLinked must NOT have been called — that result belonged to user-1.
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("does not poll when enabled is false", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    renderHook(
      () =>
        useTelegramLinkPolling({
          userId: "user-1",
          enabled: false,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper }
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("calls onLinked when profile returns telegram_id", async () => {
    maybeSingle.mockResolvedValue({
      data: { telegram_id: "12345" },
      error: null,
    });
    const onLinked = vi.fn();

    renderHook(
      () =>
        useTelegramLinkPolling({
          userId: "user-1",
          enabled: true,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper }
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      // Flush the maybeSingle().then() microtask chain
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onLinked).toHaveBeenCalledTimes(1);
  });

  it("never registers a setInterval when enabled=false from the start (showTelegramCTA=false)", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    const { unmount } = renderHook(
      () =>
        useTelegramLinkPolling({
          userId: "user-1",
          enabled: false,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper }
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();

    unmount();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("does not register setInterval when userId is null even if enabled=true", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    renderHook(
      () =>
        useTelegramLinkPolling({
          userId: null,
          enabled: true,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper }
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(maybeSingle).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });

  it("registers setInterval only after enabled flips from false to true", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const onLinked = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useTelegramLinkPolling({
          userId: "user-1",
          enabled,
          intervalMs: 1000,
          onLinked,
        }),
      { wrapper, initialProps: { enabled: false } }
    );

    expect(setIntervalSpy).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });
});
