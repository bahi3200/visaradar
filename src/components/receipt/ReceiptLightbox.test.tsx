import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReceiptLightbox } from "./ReceiptLightbox";

// react-zoom-pan-pinch uses ResizeObserver; jsdom doesn't ship one
beforeAll(() => {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const baseProps = {
  open: true,
  onOpenChange: () => {},
  signedUrl: "https://example.com/receipt.jpg",
  downloading: false,
  onDownload: () => {},
};

function renderLightbox(props = {}) {
  return render(
    <MemoryRouter>
      <ReceiptLightbox {...baseProps} {...props} />
    </MemoryRouter>
  );
}

describe("ReceiptLightbox - shortcuts help dialog", () => {
  it("renders the desktop 'دليل كامل' help button", () => {
    renderLightbox();
    expect(
      screen.getByRole("button", { name: "عرض دليل الاختصارات الكامل" })
    ).toBeInTheDocument();
  });

  it("renders the mobile help (?) button", () => {
    renderLightbox();
    expect(screen.getByRole("button", { name: "عرض الاختصارات" })).toBeInTheDocument();
  });

  it("opens the shortcuts dialog when the desktop help button is clicked", () => {
    renderLightbox();
    expect(screen.queryByText("دليل الاختصارات")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "عرض دليل الاختصارات الكامل" })
    );

    const dialog = screen.getByRole("dialog", { name: "دليل الاختصارات" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("تكبير الصورة")).toBeInTheDocument();
    expect(within(dialog).getByText("إغلاق العارض")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /عرض دليل الاختصارات الكامل/ })
    ).toHaveAttribute("href", "/help/shortcuts");
  });

  it("opens the shortcuts dialog when the mobile help (?) button is clicked", () => {
    renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "عرض الاختصارات" }));
    expect(screen.getByRole("dialog", { name: "دليل الاختصارات" })).toBeInTheDocument();
  });
});
