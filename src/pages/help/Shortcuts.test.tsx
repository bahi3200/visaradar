import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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
    <MemoryRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ShortcutsPage />
    </MemoryRouter>
  );
}

function getSearchInput(): HTMLInputElement {
  return screen.getByRole("searchbox", {
    name: /بحث في الاختصارات/,
  }) as HTMLInputElement;
}

function typeQuery(value: string) {
  fireEvent.change(getSearchInput(), { target: { value } });
}

/**
 * Matches text content even if highlight wraps part of it in <mark>/<span>.
 * Test passes if any element's combined textContent equals `expected`.
 */
function hasTextContent(expected: string) {
  return (_content: string, node: Element | null): boolean => {
    if (!node) return false;
    const text = node.textContent ?? "";
    if (text !== expected) return false;
    // Avoid matching ancestors that also contain the same text via children
    const childMatches = Array.from(node.children).some(
      (c) => (c.textContent ?? "") === expected
    );
    return !childMatches;
  };
}

describe("ShortcutsPage – search filtering", () => {
  it("renders all categories by default (التنقل العام / عارض الوصل / إيماءات اللمس)", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "التنقل العام" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "إيماءات اللمس" })).toBeInTheDocument();
  });

  it("filters shortcuts by Arabic label substring", () => {
    renderPage();
    typeQuery("طباعة");

    // Only one shortcut matches: "طباعة الوصل" inside Receipt Lightbox
    // (text may be split across <mark>/<span> due to highlight)
    expect(screen.getByText(hasTextContent("طباعة الوصل"))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();

    // Unrelated entries removed
    expect(screen.queryByText(hasTextContent("إغلاق العارض"))).not.toBeInTheDocument();
    expect(screen.queryByText(hasTextContent("تكبير الصورة"))).not.toBeInTheDocument();

    // Other categories should disappear entirely
    expect(
      screen.queryByRole("heading", { name: "التنقل العام" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "إيماءات اللمس" })
    ).not.toBeInTheDocument();
  });

  it("filters by key chip text (case-insensitive)", () => {
    renderPage();
    // Use the lightbox-specific label so we don't also match the new
    // global "Esc → clear search" shortcut in التنقل العام.
    typeQuery("إغلاق العارض");

    expect(screen.getByText(hasTextContent("إغلاق العارض"))).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "التنقل العام" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "إيماءات اللمس" })
    ).not.toBeInTheDocument();
  });

  it("matches single-character key like '/' for global search shortcut", () => {
    renderPage();
    typeQuery("/");

    expect(screen.getByText(hasTextContent("التركيز على شريط البحث"))).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /التنقل العام/ })
    ).toBeInTheDocument();
  });

  it("shows empty-state and a clear button when nothing matches", () => {
    renderPage();
    typeQuery("xyzzy-no-match");

    expect(
      screen.getByText(/لم نعثر على اختصار يطابق بحثك/)
    ).toBeInTheDocument();

    // There are 2 buttons labeled "مسح البحث" (input clear + empty state CTA).
    // Click the empty-state one (the visible text-button, not the icon-only one).
    const clearButtons = screen.getAllByRole("button", { name: "مسح البحث" });
    const ctaButton = clearButtons.find((b) => b.textContent?.includes("مسح البحث"));
    expect(ctaButton).toBeDefined();
    fireEvent.click(ctaButton!);

    expect(getSearchInput().value).toBe("");
    expect(screen.getByRole("heading", { name: "التنقل العام" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
  });

  it("displays the result count in the live region", () => {
    renderPage();
    typeQuery("الذهاب");

    const navSection = screen
      .getByRole("heading", { name: /التنقل العام/ })
      .closest("section") as HTMLElement;
    const items = within(navSection).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(6);

    expect(screen.getByText(/نتيجة لـ "الذهاب"/)).toBeInTheDocument();

    // Per-section count chip: "6 نتائج"
    expect(
      within(navSection).getByText(/6\s*نتائج/)
    ).toBeInTheDocument();
  });

  it("clears the search query when Esc is pressed inside the input", () => {
    renderPage();
    typeQuery("إغلاق العارض");

    // Filtered – touch-gestures category should be hidden
    expect(
      screen.queryByRole("heading", { name: "إيماءات اللمس" })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(getSearchInput(), { key: "Escape" });

    expect(getSearchInput().value).toBe("");
    expect(screen.getByRole("heading", { name: "التنقل العام" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /عارض الوصل/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "إيماءات اللمس" })).toBeInTheDocument();
  });
});