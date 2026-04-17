import { useState } from "react";
import { motion } from "framer-motion";
import { Database, Download, Loader2, Shield, FileArchive, AlertCircle, CheckCircle2 } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BackupSummaryItem {
  table: string;
  rows: number;
}

export default function Backup() {
  const [loading, setLoading] = useState(false);
  const [lastSummary, setLastSummary] = useState<BackupSummaryItem[] | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);

  const runBackup = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("يجب تسجيل الدخول");
        return;
      }

      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/export-database`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `فشل التصدير (${res.status})`);
      }

      const summaryHeader = res.headers.get("X-Backup-Summary");
      if (summaryHeader) {
        try {
          setLastSummary(JSON.parse(summaryHeader));
        } catch {}
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setLastBackupAt(new Date());
      toast.success("تم تصدير قاعدة البيانات بنجاح");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "حدث خطأ أثناء التصدير");
    } finally {
      setLoading(false);
    }
  };

  const totalRows = lastSummary?.reduce((sum, s) => sum + Math.max(s.rows, 0), 0) ?? 0;
  const totalTables = lastSummary?.length ?? 0;

  return (
    <AdminLayout
      title="نسخ احتياطي لقاعدة البيانات"
      subtitle="تصدير كل بيانات النظام كملف ZIP شامل"
    >
      <div className="space-y-6 max-w-5xl">
        {/* Hero Action Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-8 gradient-card border-primary/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="relative flex flex-col md:flex-row md:items-center gap-6">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shrink-0">
                <Database className="w-8 h-8 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="font-heading text-xl font-bold text-foreground mb-1">
                  تصدير كامل لقاعدة البيانات
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  يقوم بتجميع كل الجداول (21 جدول) في ملف ZIP يحتوي على ملفات CSV منفصلة + ملف JSON موحّد + تقرير ملخّص.
                </p>
              </div>
              <Button
                onClick={runBackup}
                disabled={loading}
                size="lg"
                className="gradient-primary text-primary-foreground shadow-lg gap-2 shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    جارٍ التصدير...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    تصدير الآن
                  </>
                )}
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Info cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5 gradient-card">
            <FileArchive className="w-6 h-6 text-accent mb-3" />
            <p className="font-semibold text-sm text-foreground mb-1">21 جدول</p>
            <p className="text-xs text-muted-foreground">كل البيانات في ملف ZIP واحد</p>
          </Card>
          <Card className="p-5 gradient-card">
            <Shield className="w-6 h-6 text-accent mb-3" />
            <p className="font-semibold text-sm text-foreground mb-1">للأدمن فقط</p>
            <p className="text-xs text-muted-foreground">محمي بصلاحيات الإدارة</p>
          </Card>
          <Card className="p-5 gradient-card">
            <Database className="w-6 h-6 text-accent mb-3" />
            <p className="font-semibold text-sm text-foreground mb-1">CSV + JSON</p>
            <p className="text-xs text-muted-foreground">UTF-8 BOM متوافق مع Excel</p>
          </Card>
        </div>

        {/* Last backup result */}
        {lastSummary && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-6 gradient-card">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-5 h-5 text-accent" />
                <div>
                  <h3 className="font-heading font-bold text-foreground">آخر نسخة احتياطية</h3>
                  {lastBackupAt && (
                    <p className="text-xs text-muted-foreground">
                      {lastBackupAt.toLocaleString("ar-DZ")}
                    </p>
                  )}
                </div>
                <div className="mr-auto flex gap-2">
                  <Badge variant="secondary">{totalTables} جدول</Badge>
                  <Badge className="gradient-primary text-primary-foreground">
                    {totalRows.toLocaleString("ar-DZ")} صف
                  </Badge>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {lastSummary.map((s) => (
                  <div
                    key={s.table}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/30"
                  >
                    <span className="text-xs font-mono text-foreground truncate">
                      {s.table}
                    </span>
                    {s.rows < 0 ? (
                      <Badge variant="destructive" className="text-[10px]">خطأ</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.rows.toLocaleString("ar-DZ")}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Notes */}
        <Card className="p-5 border-accent/30 bg-accent/5">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">ملاحظات مهمة:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>النسخة لا تشمل ملفات Storage (الإيصالات) — تحتاج تنزيل منفصل من قسم Storage.</li>
                <li>لا تشمل بيانات auth.users (كلمات المرور) — هذه تُدار من النظام مباشرة.</li>
                <li>احتفظ بهذه النسخة في مكان آمن (تحتوي على بيانات حساسة).</li>
                <li>الحد الأقصى لكل جدول 50,000 صف لتجنب timeout.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
