import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ===== Mocks =====
const mockUpsert = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();
const mockGetSession = vi.fn();
const invalidateSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
      upsert: (payload: any, opts: any) => ({
        select: () => mockUpsert(payload, opts),
      }),
    }),
    rpc: (...args: any[]) => mockRpc(...args),
    auth: { getSession: () => mockGetSession() },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/assets/baridimob-logo.png", () => ({ default: "baridimob.png" }));
vi.mock("@/assets/ccp-logo.png", () => ({ default: "ccp.png" }));

import PaymentSettingsPage from "./PaymentSettings";

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // اعتراض invalidateQueries لمراقبة استدعائها بدون أن تُعيد الجلب فعلاً
  qc.invalidateQueries = invalidateSpy as any;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PaymentSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("PaymentSettings — تحديث فوري بعد upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "admin-uid", email: "admin@test.com" } } },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "row-1",
        ccp_number: "old-ccp",
        ccp_key: "old-key",
        rip_number: "old-rip",
        account_holder: "old-holder",
      },
      error: null,
    });
  });

  it("يحدّث الحقول الأربعة فوراً بعد نجاح upsert قبل اكتمال invalidateQueries", async () => {
    // upsert يُرجع صفاً جديداً
    const newRow = {
      id: "row-1",
      ccp_number: "9999999999",
      ccp_key: "77",
      rip_number: "00799999000123456789",
      account_holder: "محمد الجديد",
    };

    // نجعل invalidateQueries يبقى معلقاً (Promise لا يُحلّ) للتأكد أن الواجهة لا تنتظره
    let resolveInvalidate: () => void;
    const invalidatePending = new Promise<void>((r) => {
      resolveInvalidate = r;
    });
    invalidateSpy.mockReturnValue(invalidatePending);

    mockUpsert.mockResolvedValue({ data: [newRow], error: null });

    renderPage();

    // انتظار تحميل البيانات الأولية
    const ccpInput = await screen.findByDisplayValue("old-ccp");
    const ccpKeyInput = screen.getByDisplayValue("old-key");
    const ripInput = screen.getByDisplayValue("old-rip");
    const holderInput = screen.getByDisplayValue("old-holder");

    // المستخدم يعدّل الحقول
    fireEvent.change(ccpInput, { target: { value: newRow.ccp_number } });
    fireEvent.change(ccpKeyInput, { target: { value: newRow.ccp_key } });
    fireEvent.change(ripInput, { target: { value: newRow.rip_number } });
    fireEvent.change(holderInput, { target: { value: newRow.account_holder } });

    // ضغط زر الحفظ
    const saveBtn = screen.getByRole("button", { name: /حفظ التغييرات/i });
    fireEvent.click(saveBtn);

    // ✅ التأكد أن upsert استُدعي
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());

    // ✅ التأكد أن الحقول تعرض القيم الجديدة (من savedRow) فوراً
    await waitFor(() => {
      expect(screen.getByDisplayValue(newRow.ccp_number)).toBeInTheDocument();
      expect(screen.getByDisplayValue(newRow.ccp_key)).toBeInTheDocument();
      expect(screen.getByDisplayValue(newRow.rip_number)).toBeInTheDocument();
      expect(screen.getByDisplayValue(newRow.account_holder)).toBeInTheDocument();
    });

    // ✅ التأكد أن invalidateQueries استُدعي لكنه لم يكتمل بعد — والواجهة تحدّثت رغم ذلك
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["payment-settings"],
    });

    // تحرير الـ promise المعلّق لتنظيف الاختبار
    resolveInvalidate!();
  });

  it("عند data.length===0: لا تُحدَّث الواجهة، يظهر toast خطأ واضح، ولا تُستدعى invalidateQueries", async () => {
    mockUpsert.mockResolvedValue({ data: [], error: null });

    renderPage();

    // الانتظار حتى تُحمَّل القيم الأصلية في الحقول
    const ccpInput = await screen.findByDisplayValue("old-ccp");
    const ccpKeyInput = screen.getByDisplayValue("old-key");
    const ripInput = screen.getByDisplayValue("old-rip");
    const holderInput = screen.getByDisplayValue("old-holder");

    // المستخدم يُعدّل قيمة في الحقل (لكن الحفظ سيفشل بصمت)
    fireEvent.change(ccpInput, { target: { value: "محاولة-جديدة" } });

    const saveBtn = screen.getByRole("button", { name: /حفظ التغييرات/i });
    fireEvent.click(saveBtn);

    // انتظار اكتمال محاولة الحفظ
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());

    // ✅ 1) toast.error استُدعي برسالة واضحة + description
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("لم يتم حفظ التغييرات"),
        expect.objectContaining({
          id: "toast-id",
          description: expect.stringContaining("RLS"),
        })
      );
    });

    // ✅ 2) toast.success لم يُستدعَ على الإطلاق
    expect(toast.success).not.toHaveBeenCalled();

    // ✅ 3) الحقول الأخرى لم تتغيّر (لم يُطبَّق أي savedRow وهمي)
    expect(ccpKeyInput).toHaveValue("old-key");
    expect(ripInput).toHaveValue("old-rip");
    expect(holderInput).toHaveValue("old-holder");

    // ✅ 4) invalidateQueries لم يُستدعَ — الكود رجع مبكراً
    expect(invalidateSpy).not.toHaveBeenCalled();

    // ✅ 5) رسالة خطأ تظهر داخل الواجهة (banner)
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/فشل الحفظ/i)).toBeInTheDocument();
  });
});
