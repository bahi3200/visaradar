/**
 * Extracts the storage path from a receipt URL.
 * Supports legacy public URLs, signed URLs, and direct "receipts/..." paths.
 * Returns null if no storage path can be extracted (caller may fall back to the URL as-is).
 */
export const extractStoragePath = (receiptUrl: string): string | null => {
  if (!receiptUrl) return null;
  if (receiptUrl.startsWith("receipts/")) {
    return receiptUrl.replace(/^receipts\//, "");
  }
  // Match both public and signed URLs
  const match = receiptUrl.match(/\/object\/(?:public\/|sign\/)?receipts\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
};

export type ReceiptFileKind = "image" | "pdf" | "file";

export const getReceiptFilename = (receiptUrl: string): string => {
  const clean = receiptUrl.split("?")[0];
  const path = extractStoragePath(clean) || clean;
  return decodeURIComponent(path.split("/").pop() || "receipt");
};

export const getReceiptFileKind = (receiptUrl: string): ReceiptFileKind => {
  const filename = getReceiptFilename(receiptUrl).toLowerCase();
  if (filename.endsWith(".pdf")) return "pdf";
  if (/\.(avif|gif|jpe?g|png|webp)$/i.test(filename)) return "image";
  return "file";
};
