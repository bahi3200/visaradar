import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationPermissionBanner from "./NotificationPermissionBanner";

// Mock the auth hook so we can drive `loading` and `user` states deterministically.
const authState: { user: { id: string } | null; loading: boolean } = {
  user: null,
  loading: true,
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

function setupNotification(permission: NotificationPermission = "default") {
  const requestPermission = vi.fn().mockResolvedValue(permission);
  const NotificationStub = function () {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    value: permission,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(NotificationStub, "requestPermission", {
    value: requestPermission,
    configurable: true,
    writable: true,
  });
  (globalThis as { Notification?: typeof Notification }).Notification = NotificationStub;
  return requestPermission;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotificationPermissionBanner />
    </MemoryRouter>
  );
}

describe("NotificationPermissionBanner — requestPermission gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    authState.user = null;
    authState.loading = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    // @ts-expect-error – cleanup stub
    delete globalThis.Notification;
  });

  it("does NOT call requestPermission while auth is still loading", async () => {
    const req = setupNotification("default");
    authState.user = null;
    authState.loading = true;

    renderAt("/dashboard");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(req).not.toHaveBeenCalled();
  });

  it("does NOT call requestPermission on public auth routes (even when authenticated)", async () => {
    const req = setupNotification("default");
    authState.user = { id: "user-1" };
    authState.loading = false;

    renderAt("/auth/login");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(req).not.toHaveBeenCalled();
  });

  it("does NOT call requestPermission on /privacy, /terms, /reset-password, /install, /help", async () => {
    authState.user = { id: "user-1" };
    authState.loading = false;

    for (const path of ["/privacy", "/terms", "/reset-password", "/install", "/help"]) {
      const req = setupNotification("default");
      const view = renderAt(path);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(req, `should not prompt on ${path}`).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("DOES auto-prompt once after auth resolves on a private route", async () => {
    const req = setupNotification("default");
    authState.user = { id: "user-1" };
    authState.loading = false;

    renderAt("/dashboard");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(req).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-prompt if the user was already prompted (per-user flag)", async () => {
    const req = setupNotification("default");
    authState.user = { id: "user-1" };
    authState.loading = false;
    localStorage.setItem("notif_perm_prompted::user-1", "true");

    renderAt("/dashboard");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(req).not.toHaveBeenCalled();
  });
});
