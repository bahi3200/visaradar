import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { usePersonalPromo, PERSONAL_PROMO } from "./usePersonalPromo";

// --- Mocks ----------------------------------------------------------------

const authState: { user: { id: string; created_at: string } | null } = { user: null };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

const subState: { count: number } = { count: 0 };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: subState.count, error: null }),
      }),
    }),
  },
}));

// --- Helpers --------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  authState.user = null;
  subState.count = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Tests ----------------------------------------------------------------

describe("usePersonalPromo", () => {
  it("returns not eligible for guests", async () => {
    const { result } = renderHook(() => usePersonalPromo(), { wrapper });
    expect(result.current.eligible).toBe(false);
    expect(result.current.discountPct).toBe(PERSONAL_PROMO.discountPct);
  });

  it("is eligible for a fresh signup with no subscriptions", async () => {
    authState.user = { id: "u1", created_at: new Date(Date.now() - 1 * DAY_MS).toISOString() };
    subState.count = 0;
    const { result } = renderHook(() => usePersonalPromo(), { wrapper });
    await waitFor(() => expect(result.current.eligible).toBe(true));
    expect(result.current.remainingMs).toBeGreaterThan(5 * DAY_MS);
    expect(result.current.endsAt).toBeInstanceOf(Date);
  });

  it("is NOT eligible when the 7-day window has passed", async () => {
    authState.user = { id: "u1", created_at: new Date(Date.now() - 8 * DAY_MS).toISOString() };
    subState.count = 0;
    const { result } = renderHook(() => usePersonalPromo(), { wrapper });
    await waitFor(() => expect(result.current.endsAt).not.toBeNull());
    expect(result.current.eligible).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it("is NOT eligible for users that have ever subscribed", async () => {
    authState.user = { id: "u1", created_at: new Date(Date.now() - 1 * DAY_MS).toISOString() };
    subState.count = 1;
    const { result } = renderHook(() => usePersonalPromo(), { wrapper });
    // Wait for query to settle
    await waitFor(() => expect(result.current.eligible).toBe(false));
    expect(result.current.endsAt).toBeNull();
  });
});