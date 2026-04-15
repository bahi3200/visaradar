import AdminLayout from "@/components/AdminLayout";
import { useJobs } from "@/hooks/useJobs";
import type { Job } from "@/components/JobCard";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Save, Briefcase, Star, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const emptyForm: Omit<Job, "id"> = {
  titleAr: "",
  titleFr: "",
  countryCode: "FR",
  contractType: "CDI",
  salaryText: "",
  detailsUrl: "",
  sourceName: "",
  isFeatured: false,
  descriptionAr: "",
  requirementsAr: [],
  benefitsAr: [],
};

const countryOptions = [
  { code: "CA", label: "كندا 🇨🇦" },
  { code: "FR", label: "فرنسا 🇫🇷" },
  { code: "DE", label: "ألمانيا 🇩🇪" },
  { code: "US", label: "أمريكا 🇺🇸" },
  { code: "AU", label: "أستراليا 🇦🇺" },
  { code: "GB", label: "بريطانيا 🇬🇧" },
];

export default function ManageJobsPage() {
  const navigate = useNavigate();
  const { jobs, addJob, updateJob, deleteJob } = useJobs();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [reqText, setReqText] = useState("");
  const [benText, setBenText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("vr_auth");
    if (!raw) navigate("/auth/login");
  }, [navigate]);

  function openAdd() {
    setForm(emptyForm);
    setReqText("");
    setBenText("");
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(job: Job) {
    setForm({ ...job });
    setReqText((job.requirementsAr || []).join("\n"));
    setBenText((job.benefitsAr || []).join("\n"));
    setEditingId(job.id);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.titleAr.trim() || !form.sourceName.trim()) {
      toast.error("يرجى ملء الحقول المطلوبة");
      return;
    }
    const data = {
      ...form,
      requirementsAr: reqText.split("\n").map((s) => s.trim()).filter(Boolean),
      benefitsAr: benText.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (editingId) {
      updateJob(editingId, data);
      toast.success("تم تحديث الوظيفة");
    } else {
      addJob(data);
      toast.success("تمت إضافة الوظيفة");
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    deleteJob(id);
    setDeleteConfirm(null);
    toast.success("تم حذف الوظيفة");
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition";

  return (
    <AdminLayout title="إدارة الوظائف" subtitle={`${jobs.length} وظيفة مسجّلة`}>
      <div className="max-w-4xl">
        {/* Header Actions */}
        <div className="flex justify-end mb-6">
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة وظيفة
          </Button>
        </div>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg max-h-[85vh] overflow-y-auto gradient-card rounded-2xl border border-border/50 shadow-xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-heading text-lg font-bold text-foreground">
                    {editingId ? "تعديل الوظيفة" : "إضافة وظيفة جديدة"}
                  </h2>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">العنوان بالعربية *</label>
                    <input className={inputCls} value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} placeholder="مثال: مطوّر ويب" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">العنوان بالفرنسية</label>
                    <input className={inputCls} value={form.titleFr} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} placeholder="Ex: Développeur Web" dir="ltr" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">الدولة</label>
                      <select className={inputCls} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}>
                        {countryOptions.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">نوع العقد</label>
                      <input className={inputCls} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} placeholder="CDI, CDD, LMIA..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">الراتب</label>
                      <input className={inputCls} value={form.salaryText || ""} onChange={(e) => setForm({ ...form, salaryText: e.target.value })} placeholder="2,500 EUR" dir="ltr" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">المصدر *</label>
                      <input className={inputCls} value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} placeholder="EURES, Job Bank..." />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">رابط خارجي</label>
                    <input className={inputCls} value={form.detailsUrl || ""} onChange={(e) => setForm({ ...form, detailsUrl: e.target.value })} placeholder="https://..." dir="ltr" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">الوصف</label>
                    <textarea className={`${inputCls} min-h-[80px]`} value={form.descriptionAr || ""} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} placeholder="وصف تفصيلي للوظيفة..." />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">المتطلبات (سطر لكل متطلب)</label>
                    <textarea className={`${inputCls} min-h-[70px]`} value={reqText} onChange={(e) => setReqText(e.target.value)} placeholder="خبرة 3 سنوات&#10;إتقان اللغة الفرنسية" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">المزايا (سطر لكل ميزة)</label>
                    <textarea className={`${inputCls} min-h-[70px]`} value={benText} onChange={(e) => setBenText(e.target.value)} placeholder="تأمين صحي&#10;سكن مجاني" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} className="rounded border-border" />
                    <Star className="w-4 h-4 text-accent" />
                    <span className="text-sm text-foreground">وظيفة مميّزة</span>
                  </label>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button onClick={handleSave} className="flex-1">
                    <Save className="w-4 h-4 ml-1" />
                    {editingId ? "حفظ التعديلات" : "إضافة"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Jobs List */}
        <div className="space-y-3">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="gradient-card rounded-xl border border-border/50 shadow-card p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading font-bold text-foreground truncate">{job.titleAr}</h3>
                  {job.isFeatured && (
                    <span className="gradient-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <Star className="w-3 h-3" />
                      مميّز
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {job.sourceName} • {job.contractType} • {job.salaryText || "—"}
                </p>
              </div>

              {deleteConfirm === job.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-destructive font-medium">تأكيد؟</span>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(job.id)}>
                    حذف
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>
                    لا
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(job)} title="تعديل">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(job.id)} title="حذف" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </motion.div>
          ))}

          {jobs.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد وظائف بعد</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
