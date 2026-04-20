import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReceiptThumbnail } from "./ReceiptThumbnail";

describe("ReceiptThumbnail", () => {
  const baseProps = {
    signedUrl: "https://example.com/receipt.jpg",
    downloading: false,
    onOpen: () => {},
    onDownload: () => {},
  };

  it("forwards ref to the zoom button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ReceiptThumbnail ref={ref} {...baseProps} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.getAttribute("aria-label")).toBe("تكبير صورة الوصل");
  });

  it("allows focusing the button via the forwarded ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ReceiptThumbnail ref={ref} {...baseProps} />);
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it("calls onOpen when zoom button is clicked", () => {
    const onOpen = vi.fn();
    render(<ReceiptThumbnail {...baseProps} onOpen={onOpen} />);
    fireEvent.click(screen.getByLabelText("تكبير صورة الوصل"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onDownload when download button is clicked", () => {
    const onDownload = vi.fn();
    render(<ReceiptThumbnail {...baseProps} onDownload={onDownload} />);
    fireEvent.click(screen.getByText("تنزيل الوصل"));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("disables download button while downloading", () => {
    render(<ReceiptThumbnail {...baseProps} downloading />);
    const btn = screen.getByText("تنزيل الوصل").closest("button");
    expect(btn).toBeDisabled();
  });
});