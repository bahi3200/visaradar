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

  it("🚫 فشل RLS لا يُغيّر قيم الحقول المرئية ولا يستدعي toast.success", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });
    // ⛔ محاكاة رفض RLS: upsert ينجح بدون خطأ لكنه يُرجع 0 صفوف
    mockUpsert.mockResolvedValue({ data: [], error: null });

    const { qc } = renderPage();

    // 1) انتظار تحميل الحقول الأربعة بقيمها الأصلية
    const ccpInput = await screen.findByDisplayValue("111");
    const ccpKeyInput = screen.getByDisplayValue("11");
    const ripInput = screen.getByDisplayValue("rip-111");
    const holderInput = screen.getByDisplayValue("أحمد");

    // 2) المستخدم يُعدّل القيم الأربعة قبل الضغط على حفظ
    const userEdits = {
      ccp: "USER-EDIT-CCP",
      key: "USER-EDIT-KEY",
      rip: "USER-EDIT-RIP",
      holder: "USER-EDIT-HOLDER",
    };
    fireEvent.change(ccpInput, { target: { value: userEdits.ccp } });
    fireEvent.change(ccpKeyInput, { target: { value: userEdits.key } });
    fireEvent.change(ripInput, { target: { value: userEdits.rip } });
    fireEvent.change(holderInput, { target: { value: userEdits.holder } });

    // 3) التقاط cache قبل الحفظ + spy على setQueryData
    const cacheBefore = qc.getQueryData(QUERY_KEY);
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");

    // 4) ضغط حفظ — upsert سيُرجع 0 صفوف (RLS_REJECT)
    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // ✅ 1) toast.success لم يُستدعَ مطلقاً
    expect(toast.success).not.toHaveBeenCalled();

    // ✅ 2) setQueryData لم يُستدعَ — لا تحديث متفائل بعد فشل RLS
    expect(setQueryDataSpy).not.toHaveBeenCalled();

    // ✅ 3) cache في React Query بقي بنفس المرجع تماماً (لم يُمَس)
    const cacheAfter = qc.getQueryData(QUERY_KEY);
    expect(cacheAfter).toBe(cacheBefore);

    // ✅ 4) قيم الحقول المرئية لم يُعَد تعيينها — ما زالت تعرض ما كتبه المستخدم
    //    (لا تعود إلى القيم الأصلية ولا تتحوّل إلى أي قيمة وهمية من savedRow)
    expect(ccpInput).toHaveValue(userEdits.ccp);
    expect(ccpKeyInput).toHaveValue(userEdits.key);
    expect(ripInput).toHaveValue(userEdits.rip);
    expect(holderInput).toHaveValue(userEdits.holder);

    // ✅ 5) banner الخطأ يظهر مع كود RLS_REJECT للمستخدم
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/RLS_REJECT/i)).toBeInTheDocument();
  });
});

// ============================================================
// 🔁 سيناريو الضغط المتتالي على "حفظ التغييرات"
// ============================================================
describe("PaymentSettings — ضغط حفظ مرتين متتاليتين", () => {
  const QUERY_KEY = ["payment-settings"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "admin-uid", email: "admin@test.com" } } },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it("🔁 ضغط حفظ مرتين متتاليتين: cache النهائي يطابق آخر upsert بدون تداخل", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    const firstSavedRow = {
      id: "row-1",
      ccp_number: "AAA-1",
      ccp_key: "K1",
      rip_number: "rip-AAA-1",
      account_holder: "حفظ-أول",
    };
    const secondSavedRow = {
      id: "row-1",
      ccp_number: "BBB-2",
      ccp_key: "K2",
      rip_number: "rip-BBB-2",
      account_holder: "حفظ-ثاني",
    };

    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });

    // 🎯 الزر يُعطَّل أثناء الحفظ (saving=true) لمنع overlap بالتصميم.
    //    لذا نحاكي ضغطتين متتاليتين: الأولى تكتمل، ثم الثانية تنطلق.
    //    الهدف: التأكد أن نتيجة الحفظ الثاني تكتب فوق الأول بدون دمج جزئي.
    mockUpsert
      .mockResolvedValueOnce({ data: [firstSavedRow], error: null })
      .mockResolvedValueOnce({ data: [secondSavedRow], error: null });

    const { qc } = renderPage();

    // انتظار اكتمال الجلب الأولي
    const ccpInput = await screen.findByDisplayValue("111");
    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ id: "row-1", ccp_number: "111" });
    });

    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");
    const saveBtn = screen.getByRole("button", { name: /حفظ التغييرات/i });

    // 1) الضغطة الأولى
    fireEvent.change(ccpInput, { target: { value: firstSavedRow.ccp_number } });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ ccp_number: firstSavedRow.ccp_number });
    });

    // 2) الضغطة الثانية مباشرة بعد اكتمال الأولى
    fireEvent.change(ccpInput, { target: { value: secondSavedRow.ccp_number } });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledTimes(2);
    });

    // ✅ 5) cache النهائي يجب أن يكون ثابتاً ومتطابقاً (كائن واحد، نفس الشكل)
    const finalCache = qc.getQueryData(QUERY_KEY);
    expect(finalCache).toBeTruthy();
    expect(Array.isArray(finalCache)).toBe(false);
    expect(typeof finalCache).toBe("object");

    // ✅ 6) نفس الحقول الأساسية موجودة (لا تداخل/دمج جزئي يُنتج شكلاً غريباً)
    const coreFields = ["id", "ccp_number", "ccp_key", "rip_number", "account_holder"];
    const finalKeys = Object.keys(finalCache as object);
    coreFields.forEach((f) => {
      expect(finalKeys).toContain(f);
    });

    // ✅ 7) كلا الكتابتين استخدمتا نفس QUERY_KEY حرفياً (لا يوجد تشتت بين مفاتيح cache)
    const firstKey = setQueryDataSpy.mock.calls[0]?.[0];
    const secondKey = setQueryDataSpy.mock.calls[1]?.[0];
    expect(firstKey).toEqual(secondKey);
    expect(JSON.stringify(firstKey)).toBe(JSON.stringify(secondKey));
    expect(JSON.stringify(firstKey)).toBe(JSON.stringify(QUERY_KEY));

    // ✅ 8) toast.error لم يُستدعَ — كلا الحفظين نجحا
    expect(toast.error).not.toHaveBeenCalled();

    // ✅ 9) toast.success استُدعي مرتين (مرة لكل حفظ ناجح)
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("🔁 ضغطتان ناجحتان متسلسلتان: cache يساوي تماماً نتيجة آخر upsert", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "000",
      ccp_key: "00",
      rip_number: "rip-000",
      account_holder: "بداية",
    };
    const row1 = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أول",
    };
    const row2 = {
      id: "row-1",
      ccp_number: "222",
      ccp_key: "22",
      rip_number: "rip-222",
      account_holder: "ثاني",
    };

    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });
    mockUpsert
      .mockResolvedValueOnce({ data: [row1], error: null })
      .mockResolvedValueOnce({ data: [row2], error: null });

    const { qc } = renderPage();

    const ccpInput = await screen.findByDisplayValue("000");
    const saveBtn = screen.getByRole("button", { name: /حفظ التغييرات/i });

    // الحفظ الأول
    fireEvent.change(ccpInput, { target: { value: row1.ccp_number } });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ ccp_number: "111" });
    });

    // الحفظ الثاني فوراً بعده
    fireEvent.change(ccpInput, { target: { value: row2.ccp_number } });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ ccp_number: "222" });
    });

    // ✅ cache النهائي = آخر upsert بالضبط (لا بقايا من الحفظ الأول)
    const finalCache = qc.getQueryData(QUERY_KEY) as Record<string, unknown>;
    expect(finalCache).toMatchObject(row2);

    // ✅ لا توجد حقول من الحفظ الأول مدموجة بالخطأ
    expect(finalCache.ccp_number).toBe("222");
    expect(finalCache.ccp_key).toBe("22");
    expect(finalCache.rip_number).toBe("rip-222");
    expect(finalCache.account_holder).toBe("ثاني");

    // ✅ upsert استُدعي مرتين بالضبط
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// ============================================================
// 🧪 سيناريو تطبيع الأنواع المختلطة (number/undefined/string رقمي)
// ============================================================
describe("PaymentSettings — تطبيع شكل الصف بعد upsert بأنواع مختلطة", () => {
  const QUERY_KEY = ["payment-settings"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "admin-uid", email: "admin@test.com" } } },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it("🧬 upsert يُرجع حقولاً بأنواع مختلطة → cache يحتفظ بشكل PaymentSettingsRow المُطبَّع", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });

    // ⚠️ صف "خام" يُحاكي ردّاً غير-معياري من Supabase:
    //  - ccp_number كرقم (number) بدلاً من string
    //  - ccp_key undefined
    //  - rip_number كـ string رقمي طويل
    //  - account_holder string عادي
    //  - referrer_bonus_days كرقم صحيح (مسموح)
    //  - referred_bonus_days كـ string رقمي (يجب تجاهله → undefined)
    //  - updated_at كرقم (timestamp) بدلاً من ISO string (يجب تجاهله → undefined)
    const rawMixedRow = {
      id: 12345, // number → سيُحوَّل إلى "12345"
      ccp_number: 9876543210, // number → "9876543210"
      ccp_key: undefined, // undefined → ""
      rip_number: "00799999000123456789", // string رقمي → كما هو
      account_holder: "محمد المختلط",
      referrer_bonus_days: 7, // number صحيح → يُحفظ
      referred_bonus_days: "14", // string → ❌ يجب أن يصبح undefined
      updated_at: 1700000000000, // number → ❌ يجب أن يصبح undefined
      extra_unknown_field: "should-be-stripped", // حقل غريب → لا يجب أن يظهر
    };
    mockUpsert.mockResolvedValue({ data: [rawMixedRow], error: null });

    const { qc } = renderPage();

    await screen.findByDisplayValue("111");
    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());

    // ✅ 1) cache يحتوي صفاً مُطبَّعاً (object واحد، ليس array)
    const cached = await waitFor(() => {
      const v = qc.getQueryData(QUERY_KEY) as Record<string, unknown> | null;
      expect(v).toBeTruthy();
      return v!;
    });
    expect(Array.isArray(cached)).toBe(false);
    expect(typeof cached).toBe("object");

    // ✅ 2) جميع الحقول النصّية الإلزامية أصبحت string فعلاً (لا number)
    expect(typeof cached.id).toBe("string");
    expect(cached.id).toBe("12345");

    expect(typeof cached.ccp_number).toBe("string");
    expect(cached.ccp_number).toBe("9876543210");

    expect(typeof cached.ccp_key).toBe("string");
    expect(cached.ccp_key).toBe(""); // undefined → ""

    expect(typeof cached.rip_number).toBe("string");
    expect(cached.rip_number).toBe("00799999000123456789");

    expect(typeof cached.account_holder).toBe("string");
    expect(cached.account_holder).toBe("محمد المختلط");

    // ✅ 3) referrer_bonus_days كرقم صحيح يُحفظ كما هو
    expect(cached.referrer_bonus_days).toBe(7);
    expect(typeof cached.referrer_bonus_days).toBe("number");

    // ✅ 4) string رقمي في referred_bonus_days → undefined (لم يمرّ التحقق typeof === "number")
    expect(cached.referred_bonus_days).toBeUndefined();

    // ✅ 5) updated_at كرقم → undefined (لم يمرّ التحقق typeof === "string")
    expect(cached.updated_at).toBeUndefined();

    // ✅ 6) الحقل الغريب extra_unknown_field محذوف بالكامل (التطبيع لا ينقله)
    expect(cached).not.toHaveProperty("extra_unknown_field");

    // ✅ 7) المفاتيح الفعلية في cache مطابقة تماماً لشكل PaymentSettingsRow
    const expectedKeys = [
      "id",
      "ccp_number",
      "ccp_key",
      "rip_number",
      "account_holder",
      "referrer_bonus_days",
      "referred_bonus_days",
      "updated_at",
    ].sort();
    expect(Object.keys(cached).sort()).toEqual(expectedKeys);

    // ✅ 8) الحقول المرئية في الواجهة تعرض القيم المُطبَّعة (string)
    expect(screen.getByDisplayValue("9876543210")).toBeInTheDocument();
    expect(screen.getByDisplayValue("00799999000123456789")).toBeInTheDocument();
    expect(screen.getByDisplayValue("محمد المختلط")).toBeInTheDocument();

    // ✅ 9) toast نجاح استُدعي وtoast خطأ لم يُستدعَ
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("🧬 upsert يُرجع كائناً بدون id (نوع صحيح لكن بيانات ناقصة) → التطبيع يرفضه ولا يُكتب cache", async () => {
    const initialRow = {
      id: "row-1",
      ccp_number: "111",
      ccp_key: "11",
      rip_number: "rip-111",
      account_holder: "أحمد",
    };
    mockMaybeSingle.mockResolvedValue({ data: initialRow, error: null });

    // ⚠️ صف بدون id → التطبيع يُرجع null → الحارس يلتقطه (EMPTY_SAVED_ROW)
    mockUpsert.mockResolvedValue({
      data: [{ ccp_number: 999, ccp_key: undefined, account_holder: "بدون id" }],
      error: null,
    });

    const { qc } = renderPage();
    await screen.findByDisplayValue("111");

    const cacheBefore = qc.getQueryData(QUERY_KEY);
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");

    fireEvent.click(screen.getByRole("button", { name: /حفظ التغييرات/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // ✅ cache لم يُمَس + setQueryData لم يُستدعَ
    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(qc.getQueryData(QUERY_KEY)).toBe(cacheBefore);
    expect(qc.getQueryData(QUERY_KEY)).toMatchObject({ id: "row-1", ccp_number: "111" });

    // ✅ toast.success لم يُستدعَ
    expect(toast.success).not.toHaveBeenCalled();
  });
});
