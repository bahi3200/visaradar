import { describe, it, expect } from "vitest";
import { extractStoragePath, getReceiptFileKind, getReceiptFilename } from "@/lib/receiptStorage";

describe("extractStoragePath", () => {
  it("returns null for empty string", () => {
    expect(extractStoragePath("")).toBeNull();
  });

  it("strips the 'receipts/' prefix from a direct storage path", () => {
    expect(extractStoragePath("receipts/user-123/abc.jpg")).toBe("user-123/abc.jpg");
  });

  it("extracts path from a legacy public URL", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/public/receipts/user-123/abc.jpg";
    expect(extractStoragePath(url)).toBe("user-123/abc.jpg");
  });

  it("extracts path from a signed URL (with token query)", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/receipts/user-123/abc.jpg?token=eyJhbGciOi.signed";
    expect(extractStoragePath(url)).toBe("user-123/abc.jpg");
  });

  it("extracts path from a generic /object/receipts/ URL (no public/sign segment)", () => {
    const url = "https://xyz.supabase.co/storage/v1/object/receipts/folder/file.png";
    expect(extractStoragePath(url)).toBe("folder/file.png");
  });

  it("decodes URL-encoded characters in the path", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/receipts/user%20123/my%20file.jpg";
    expect(extractStoragePath(url)).toBe("user 123/my file.jpg");
  });

  it("returns null for an unrelated URL", () => {
    expect(extractStoragePath("https://example.com/some/other/path.jpg")).toBeNull();
  });

  it("handles signed URL with multiple query params", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/receipts/nested/path/file.jpg?token=abc&download=true";
    expect(extractStoragePath(url)).toBe("nested/path/file.jpg");
  });

  it("detects receipt filename and kind", () => {
    expect(getReceiptFilename("receipts/user-123/payment.pdf")).toBe("payment.pdf");
    expect(getReceiptFileKind("receipts/user-123/payment.pdf")).toBe("pdf");
    expect(getReceiptFileKind("receipts/user-123/payment.jpeg")).toBe("image");
    expect(getReceiptFileKind("receipts/user-123/payment.bin")).toBe("file");
  });
});
