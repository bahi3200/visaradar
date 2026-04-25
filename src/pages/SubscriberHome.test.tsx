import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SubscriberHome from "./SubscriberHome";

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

const toastError = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

const authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

// Disable polling side-effects entirely for these tests; we only care about
// the manual verify button lifecycle.
vi.mock("@/hooks/useTelegramLinkPolling", () => ({
  useTelegramLinkPolling: () => undefined,
}));

// Stub heavy child components that aren't relevant to the verify button.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/subscriber/SubscriberHero", () => ({ default: () => null }));
vi.mock("@/components/subscriber/VisaAlertBanner", () => ({ default: () => null }));
vi.mock("@/components/subscriber/QuickStats", () => ({ default: () => null }));
vi.mock("@/components/subscriber/CityGallery", () => ({ default: () => null }));
vi.mock("@/components/subscriber/QuickLinks", () => ({ default: () => null }));
vi.mock("@/components/subscriber/VisaTips", () => ({ default: () => null }));
vi.mock("@/components/subscriber/RecentAlerts", () => ({ default: () => null }));
vi.mock("@/components/subscriber/AdminStats", () => ({ default: () => null }));
vi.mock("@/components/home/SocialMediaSection", () => ({ default: () => null }));

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SubscriberHome
          subscription={null}
          fullName="Test User"
          isAdmin={false}
          isLoading={false}
          telegramLinked={false}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}

beforeEach(() => {
  vi.useFakeTimers();
  maybeSingle.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  toastSuccess.mockReset();
  authState.user = { id: "user-1" };
  authState.loading = false;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SubscriberHome — verify button resilience", () => {
  it("re-enables the verify button when the network request rejects", async () => {
    maybeSingle.mockRejectedValueOnce(new Error("Network error"));

    renderHome();
    const btn = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(btn);
    });
    // After the rejection settles, the button must be enabled again.
    await act(async () => {
      await Promise.resolve();
    });

    const btnAfter = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;
    expect(btnAfter.disabled).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Network error");
  });

  it("re-enables the verify button after the 10s safety timeout fires", async () => {
    // Never resolve — simulate a hung network request.
    maybeSingle.mockReturnValue(new Promise(() => {}));

    renderHome();
    const btn = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(btn);
    });
    // Mid-flight: button is disabled.
    expect((screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement).disabled).toBe(true);

    // Advance past the 10s safety timeout.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    const btnAfter = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;
    expect(btnAfter.disabled).toBe(false);
    expect(toastError).toHaveBeenCalledWith("انتهت مهلة التحقق. حاول مرة أخرى.");
  });

  it("cancel button aborts an in-flight check and re-enables verify", async () => {
    maybeSingle.mockReturnValue(new Promise(() => {}));

    renderHome();
    const btn = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(btn);
    });
    expect((screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement).disabled).toBe(true);

    const cancel = screen.getByLabelText("إلغاء التحقق");
    await act(async () => {
      fireEvent.click(cancel);
    });

    const btnAfter = screen.getByLabelText("تحقق فوري من حالة الربط") as HTMLButtonElement;
    expect(btnAfter.disabled).toBe(false);
    expect(toastInfo).toHaveBeenCalledWith("تم إلغاء عملية التحقق.");

    // Even if the safety timeout fires later, no extra error toast should appear.
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});