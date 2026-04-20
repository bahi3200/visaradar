import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Mock Layout to avoid Navbar/Footer (which depend on Supabase, hooks, etc.)
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock SEO (uses react-helmet-async / document head)
vi.mock("@/components/SEO", () => ({
  default: () => null,
}));

// Mock framer-motion to avoid animation/IntersectionObserver issues in jsdom
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div {...props}>{props.children}</div>,
    }
  ),
}));

import ShortcutsPage from "./Shortcuts";

function renderPage() {
  return render(
    <MemoryRouter>
      <ShortcutsPage />
    </MemoryRouter>
  );
}

describe("ShortcutsPage – search filtering", () => {
  beforeEach(() => {
    // Nothing to reset; component is purely client-state
  });

  it("renders all categories by default (التنقل العام / عارض الوصل / إيماءات اللمس)", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "التنقل العام" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "إيماءات اللمس" })).toBeInTheDocument();
  });

  it("filters shortcuts by Arabic label substring", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole("searchbox", { name: /بحث في الاختصارات/ });
    await user.type(input, "تكبير");

    // The "Receipt Lightbox" category should remain (it has zoom items)
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
    // Both "تكبير الصورة" and "تبديل التكبير" match
    expect(screen.getByText("تكبير الصورة")).toBeInTheDocument();
    expect(screen.getByText(/تبديل التكبير/)).toBeInTheDocument();

    // Unrelated entries should be filtered out
    expect(screen.queryByText("طباعة الوصل")).not.toBeInTheDocument();
    expect(screen.queryByText("إغلاق العارض")).not.toBeInTheDocument();

    // The "التنقل العام" category has no match for "تكبير" → header gone
    expect(
      screen.queryByRole("heading", { name: "التنقل العام" })
    ).not.toBeInTheDocument();
  });

  it("filters by key chip text (case-insensitive)", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole("searchbox", { name: /بحث في الاختصارات/ });
    await user.type(input, "esc");

    expect(screen.getByText("إغلاق العارض")).toBeInTheDocument();
    // Only one match → other categories should not appear
    expect(
      screen.queryByRole("heading", { name: "التنقل العام" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "إيماءات اللمس" })
    ).not.toBeInTheDocument();
  });

  it("matches single-character key like '/' for global search shortcut", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole("searchbox", { name: /بحث في الاختصارات/ });
    await user.type(input, "/");

    expect(screen.getByText("التركيز على شريط البحث")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "التنقل العام" })
    ).toBeInTheDocument();
  });

  it("shows empty-state and a clear button when nothing matches", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole("searchbox", { name: /بحث في الاختصارات/ });
    await user.type(input, "xyzzy-no-match");

    expect(
      screen.getByText(/لم نعثر على اختصار يطابق بحثك/)
    ).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "مسح البحث" });
    await user.click(clearBtn);

    // After clearing, the full list comes back
    expect(input).toHaveValue("");
    expect(screen.getByRole("heading", { name: "التنقل العام" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
  });

  it("displays the result count in the live region", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByRole("searchbox", { name: /بحث في الاختصارات/ });
    await user.type(input, "الذهاب");

    // 6 "الذهاب لـ ..." entries in التنقل العام
    const navSection = screen
      .getByRole("heading", { name: "التنقل العام" })
      .closest("section") as HTMLElement;
    const items = within(navSection).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(6);

    expect(screen.getByText(/نتيجة لـ "الذهاب"/)).toBeInTheDocument();
  });
});