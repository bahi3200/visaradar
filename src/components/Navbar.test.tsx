import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

// Mock auth: signed-in user
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "test@example.com",
      user_metadata: { full_name: "Test User" },
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Mock theme
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

// Mock admin status (regular user)
vi.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: () => ({ isAdmin: false, isPrivileged: false, isLoading: false }),
}));

// Mock NotificationsBell to avoid Supabase queries
vi.mock("@/components/NotificationsBell", () => ({
  default: () => <div data-testid="notifications-bell" />,
}));

function renderNavbar() {
  return render(
    <MemoryRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Navbar />
    </MemoryRouter>
  );
}

describe("Navbar — keyboard shortcuts link", () => {
  beforeEach(() => {
    // Reset viewport for each test
    window.innerWidth = 1280;
    window.dispatchEvent(new Event("resize"));
  });

  it("exposes /help/shortcuts inside the user dropdown menu (desktop)", async () => {
    const user = userEvent.setup();
    renderNavbar();

    // Open the user dropdown by clicking the trigger that shows the username
    const trigger = screen.getByRole("button", { name: /Test User/i });
    await user.click(trigger);

    // Radix renders the menu in a portal; query the whole document
    const shortcutsLinks = await screen.findAllByRole("menuitem", {
      name: /اختصارات لوحة المفاتيح/,
    });
    expect(shortcutsLinks.length).toBeGreaterThan(0);

    // With asChild, the menuitem IS the anchor (or wraps one). Find the href either way.
    const item = shortcutsLinks[0];
    const anchor =
      item.tagName.toLowerCase() === "a"
        ? item
        : (item.querySelector("a") as HTMLElement | null);
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute("href", "/help/shortcuts");

    // And display the "?" hint kbd
    expect(within(item).getByText("?")).toBeInTheDocument();
  });

  it("exposes /help/shortcuts inside the mobile menu", async () => {
    const user = userEvent.setup();
    const { container } = renderNavbar();

    // Open the mobile menu — the toggle is the only md:hidden button at top right
    const mobileToggle = container.querySelector("button.md\\:hidden") as HTMLElement;
    expect(mobileToggle).not.toBeNull();
    await user.click(mobileToggle);

    // The mobile menu now contains a direct anchor (no role=menuitem)
    const link = await screen.findByRole("link", {
      name: /اختصارات لوحة المفاتيح/,
    });
    expect(link).toHaveAttribute("href", "/help/shortcuts");
  });
});