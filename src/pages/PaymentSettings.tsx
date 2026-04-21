import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CreditCard } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import baridimobLogo from "@/assets/baridimob-logo.png";
import ccpLogo from "@/assets/ccp-logo.png";

export default function PaymentSettingsPage() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [ccpNumber, setCcpNumber] = useState("");
  const [ccpKey, setCcpKey] = useState("");
  const [ripNumber, setRipNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setCcpNumber(settings.ccp_number || "");
      setCcpKey(settings.ccp_key || "");
      setRipNumber(settings.rip_number || "");
      setAccountHolder(settings.account_holder || "");
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        ccp_number: ccpNumber.trim(),
        ccp_key: ccpKey.trim(),
        rip_number: ripNumber.trim(),
        account_holder: accountHolder.trim(),
        updated_at: new Date().toISOString(),
      };
      if (settings?.id) {
        payload.id = settings.id;
      }
      const { data, error } = await supabase
        .from("payment_settings")
        .upsert(payload, { onConflict: "id" })
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("لم يتم حفظ التغييرات. تحقق من صلاحياتك.");
      }
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
      toast.success("تم حفظ معلومات الدفع بنجاح");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono tracking-wider";

  return (
    <AdminLayout title="إعدادات الدفع" subtitle="إدارة أرقام CCP و BaridiMob المعروضة للمشتركين">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* CCP Section */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <img src={ccpLogo} alt="CCP" className="h-10 w-auto" />
              <div>
                <h3 className="font-heading font-bold text-foreground">حساب CCP</h3>
                <p className="text-xs text-muted-foreground">بريد الجزائر</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">رقم الحساب CCP</label>
                <input
                  type="text"
                  value={ccpNumber}
                  onChange={(e) => setCcpNumber(e.target.value)}
                  placeholder="مثال: 1234567890"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">المفتاح (Clé)</label>
                <input
                  type="text"
                  value={ccpKey}
                  onChange={(e) => setCcpKey(e.target.value)}
                  placeholder="مثال: 42"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* BaridiMob Section */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <img src={baridimobLogo} alt="BaridiMob" className="h-10 w-auto" />
              <div>
                <h3 className="font-heading font-bold text-foreground">BaridiMob</h3>
                <p className="text-xs text-muted-foreground">التحويل عبر التطبيق</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">رقم RIP</label>
              <input
                type="text"
                value={ripNumber}
                onChange={(e) => setRipNumber(e.target.value)}
                placeholder="مثال: 00799999000123456789"
                className={inputClass}
                dir="ltr"
              />
            </div>
          </div>

          {/* Account Holder */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <CreditCard className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-heading font-bold text-foreground">صاحب الحساب</h3>
                <p className="text-xs text-muted-foreground">الاسم المعروض للمشتركين</p>
              </div>
            </div>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="مثال: محمد أحمد"
              className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-xl font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
