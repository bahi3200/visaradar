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
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PaymentSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, qc };
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

// ============================================================
// 🎯 سيناريوهات التحقق من تطابق شكل البيانات بين useQuery و setQueryData
// ============================================================
describe("PaymentSettings — تطابق شكل cache بين useQuery و setQueryData", () => {
  const QUERY_KEY = ["payment-settings"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "admin-uid", email: "admin@test.com" } } },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it("✅ النجاح: useQuery يكتب كائناً واحداً، وsetQueryData بعد upsert يكتب نفس الشكل", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });

    const updatedRow = {
      id: "row-1",
      ccp_number: "222",
      ccp_key: "22",
      rip_number: "rip-222",
      account_holder: "محمد",
    };
    mockUpsert.mockResolvedValue({ data: [updatedRow], error: null });

    const { qc } = renderPage();

    // 1) شكل cache بعد useQuery (الجلب الأولي) = كائن واحد
    await waitFor(() => {
      const cached = qc.getQueryData(QUERY_KEY);
      expect(cached).toBeTruthy();
      expect(Array.isArray(cached)).toBe(false);
      expect(typeof cached).toBe("object");
      expect(cached).toMatchObject({ id: "row-1", ccp_number: "111" });
    });

    const cachedAfterFetch = qc.getQueryData(QUERY_KEY);
    const fetchKeys = Object.keys(cachedAfterFetch as object).sort();

    // 2) ضغط حفظ
    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());

    // 3) شكل cache بعد setQueryData = كائن واحد بنفس الشكل
    await waitFor(() => {
      const cached = qc.getQueryData(QUERY_KEY);
      expect(cached).toBeTruthy();
      expect(Array.isArray(cached)).toBe(false);
      expect(cached).toMatchObject({ id: "row-1", ccp_number: "222" });
    });

    // 4) ✨ التحقق الحاسم: نفس الحقول الأساسية في كلتا الحالتين
    const cachedAfterSave = qc.getQueryData(QUERY_KEY);
    const saveKeys = Object.keys(cachedAfterSave as object).sort();
    const coreFields = ["id", "ccp_number", "ccp_key", "rip_number", "account_holder"];
    coreFields.forEach((f) => {
      expect(fetchKeys).toContain(f);
      expect(saveKeys).toContain(f);
    });
  });

  it("⛔ رفض RLS (data.length===0): cache لا يتغير بعد فشل upsert", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });
    mockUpsert.mockResolvedValue({ data: [], error: null });

    const { qc } = renderPage();

    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ id: "row-1" });
    });

    const cacheBefore = qc.getQueryData(QUERY_KEY);

    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // ✅ cache بقي بنفس المرجع (لم يُكتب فوقه)
    const cacheAfter = qc.getQueryData(QUERY_KEY);
    expect(cacheAfter).toBe(cacheBefore);
    expect(cacheAfter).toMatchObject({ id: "row-1", ccp_number: "111" });
  });

  it("📭 لا يوجد صف (maybeSingle => null): useQuery يكتب null في cache", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { qc } = renderPage();

    // عند data=null، useQuery يخزّن null (وليس undefined/{}/[])
    await waitFor(() => {
      const cached = qc.getQueryData(QUERY_KEY);
      expect(cached).toBeNull();
    });

    const cached = qc.getQueryData(QUERY_KEY);
    expect(Array.isArray(cached)).toBe(false);
    expect(cached).not.toEqual({});
    expect(cached).not.toEqual([]);
  });

  it("🛡️ EMPTY_SAVED_ROW: upsert يرجع [null] → لا يُستدعى setQueryData ويظهر toast.error", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });
    // ⚠️ مصفوفة غير فارغة لكن العنصر الوحيد null → يجب أن يلتقطها الحارس الثاني
    mockUpsert.mockResolvedValue({ data: [null], error: null });

    const { qc } = renderPage();

    // انتظار اكتمال الجلب الأولي للـ cache
    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ id: "row-1" });
    });

    const cacheBefore = qc.getQueryData(QUERY_KEY);
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");

    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());

    // ✅ 1) toast.error استُدعي برسالة EMPTY_SAVED_ROW الواضحة
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        // 📌 رسالة موحّدة بين سيناريو RLS_REJECT و EMPTY_SAVED_ROW
        expect.stringContaining("لم يتم حفظ التغييرات"),
        expect.objectContaining({
          id: "toast-id",
          // hint موحّد يذكر RLS وuser_roles في كلا السيناريوهين
          description: expect.stringContaining("RLS"),
        })
      );
    });

    // ✅ 2) toast.success لم يُستدعَ
    expect(toast.success).not.toHaveBeenCalled();

    // ✅ 3) setQueryData لم يُستدعَ بعد فشل التطبيع
    expect(setQueryDataSpy).not.toHaveBeenCalled();

    // ✅ 4) cache بقي بنفس المرجع تماماً
    const cacheAfter = qc.getQueryData(QUERY_KEY);
    expect(cacheAfter).toBe(cacheBefore);
    expect(cacheAfter).toMatchObject({ id: "row-1", ccp_number: "111" });

    // ✅ 5) رسالة الخطأ تظهر داخل الواجهة (banner) مع كود EMPTY_SAVED_ROW
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/EMPTY_SAVED_ROW/i)).toBeInTheDocument();
  });

  it("🔑 QUERY_KEY متطابق حرفياً بين useQuery و setQueryData (لا اختلاف array/object key order)", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    const updatedRow = {
      id: "row-1",
      ccp_number: "999",
      ccp_key: "99",
      rip_number: "rip-999",
      account_holder: "محمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });
    mockUpsert.mockResolvedValue({ data: [updatedRow], error: null });

    const { qc } = renderPage();

    // 1) التقاط مفتاح useQuery من cache بعد الجلب الأولي
    await waitFor(() => {
      expect(qc.getQueryData(["payment-settings"])).toBeTruthy();
    });
    const queryCacheKeys = qc
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    const queryUseKey = queryCacheKeys.find(
      (k) => Array.isArray(k) && k[0] === "payment-settings"
    );
    expect(queryUseKey).toBeDefined();

    // 2) مراقبة setQueryData لالتقاط المفتاح الذي يستخدمه handleSave
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");

    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await waitFor(() => expect(setQueryDataSpy).toHaveBeenCalled());

    const setKey = setQueryDataSpy.mock.calls[0]?.[0];

    // ✅ 3) المفتاحان مصفوفتان بنفس الطول والترتيب (لا object key order issues)
    expect(Array.isArray(setKey)).toBe(true);
    expect(Array.isArray(queryUseKey)).toBe(true);
    expect((setKey as unknown[]).length).toBe(
      (queryUseKey as unknown[]).length
    );

    // ✅ 4) تطابق حرفي عنصراً عنصراً (نفس النص "payment-settings" بنفس الموقع)
    (queryUseKey as unknown[]).forEach((segment, idx) => {
      expect((setKey as unknown[])[idx]).toBe(segment);
    });

    // ✅ 5) تطابق عميق (يضمن عدم وجود أي اختلاف هيكلي مخفي)
    expect(setKey).toEqual(queryUseKey);

    // ✅ 6) JSON serialization متطابقة — الحارس النهائي ضد أي ترتيب مفاتيح مختلف
    expect(JSON.stringify(setKey)).toBe(JSON.stringify(queryUseKey));

    // ✅ 7) قراءة cache بنفس المفتاح الحرفي تُرجع الصف المُحدَّث
    const cachedAfter = qc.getQueryData(setKey as readonly unknown[]);
    expect(cachedAfter).toMatchObject({ id: "row-1", ccp_number: "999" });
  });
});
