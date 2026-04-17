import Layout from "@/components/Layout";
import ReferralSection from "@/components/referral/ReferralSection";
import UserStatsDashboard from "@/components/profile/UserStatsDashboard";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { User, Camera, Save, Loader2, Mail, Phone, MessageCircle, Volume2, BarChart3, UserCog, RefreshCw, Calendar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActiveSub = {
  id: string;
  package_id: string;
  service_type: string;
  expires_at: string;
  packages: { name_ar: string; price: number | null } | null;
};

export default function ProfilePage() {
  const { user } = useAuth();

  const { isAdmin } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeSub, setActiveSub] = useState<ActiveSub | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const [{ data: profileData }, { data: prefData }, { data: subData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("notification_preferences").select("sound_enabled").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("id, package_id, service_type, expires_at, packages(name_ar, price)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (profileData) {
        setFullName(profileData.full_name || "");
        setPhone(profileData.phone || "");
        setTelegramId(profileData.telegram_id || "");
        setAvatarUrl(profileData.avatar_url || "");
      }
      if (prefData) {
        setSoundEnabled(prefData.sound_enabled);
      }
      if (subData) {
        setActiveSub(subData as ActiveSub);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن لا يتجاوز 2 ميغابايت");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
    if (error) {
      toast.error("فشل رفع الصورة");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
    const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    setAvatarUrl(newUrl);
    await supabase.from("profiles").update({ avatar_url: newUrl }).eq("user_id", user.id);
    toast.success("تم تحديث الصورة");
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, full_name: fullName, phone, telegram_id: telegramId },
        { onConflict: "user_id" }
      );
    if (error) {
      toast.error("فشل حفظ البيانات");
      console.error("Profile save error:", error);
    } else {
      toast.success("تم حفظ البيانات بنجاح");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-lg py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <h1 className="text-2xl font-heading font-bold text-foreground text-center">
            الملف الشخصي
          </h1>

          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info" className="gap-2">
                <UserCog className="w-4 h-4" />
                البيانات
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                إحصائياتي
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-8 mt-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <Avatar className="w-24 h-24 border-2 border-primary/30">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback className="bg-secondary text-2xl">
                      <User className="w-10 h-10 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">اضغط على الصورة لتغييرها</p>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  البريد الإلكتروني
                </Label>
                <Input value={user?.email || ""} disabled className="text-right opacity-60" />
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  الاسم الكامل
                </Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  className="text-right"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  رقم الهاتف
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="مثال: +213..."
                  className="text-right"
                  dir="ltr"
                />
              </div>

              {/* Telegram */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  معرّف تيليغرام (Chat ID)
                </Label>
                <Input
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="مثال: 1698382532"
                  className="text-right"
                  dir="ltr"
                />
                <div className="rounded-md bg-muted/50 border border-border/50 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    للحصول على Chat ID الخاص بك:
                  </p>
                  <ol className="text-xs text-muted-foreground leading-relaxed list-decimal list-inside space-y-0.5">
                    <li>افتح تيليغرام وابدأ محادثة مع <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" dir="ltr" className="font-mono text-primary underline hover:text-primary/80">@userinfobot</a></li>
                    <li>اضغط <strong>Start</strong> أو أرسل أي رسالة</li>
                    <li>سيرد عليك برقم الـ Chat ID — انسخه وألصقه هنا</li>
                  </ol>
                </div>
              </div>

              {/* Notification Sound */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <Label className="cursor-pointer">صوت التنبيه</Label>
                </div>
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={async (checked) => {
                    setSoundEnabled(checked);
                    if (user) {
                      await supabase.from("notification_preferences").upsert({ user_id: user.id, sound_enabled: checked }, { onConflict: "user_id" });
                    }
                    localStorage.setItem("notif_sound", String(checked));
                    toast.success(checked ? "تم تفعيل صوت التنبيه" : "تم إيقاف صوت التنبيه");
                  }}
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full gradient-primary text-primary-foreground font-bold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                حفظ التغييرات
              </Button>

              {/* Quick Renew - only when user has an active subscription and is not admin */}
              {!isAdmin && activeSub && (() => {
                const daysLeft = Math.max(0, Math.ceil((new Date(activeSub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const urgent = daysLeft <= 7;
                const expiryDate = new Date(activeSub.expires_at).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
                const renewUrl = `/subscribe?renew=true&package=${activeSub.package_id}&service=${activeSub.service_type}`;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border p-5 space-y-3 ${urgent ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${urgent ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                        <RefreshCw className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading font-bold text-foreground text-sm mb-0.5">تجديد سريع</h3>
                        <p className="text-xs text-muted-foreground">
                          باقتك الحالية: <span className="font-bold text-foreground">{activeSub.packages?.name_ar || "—"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                          <Calendar className="w-3 h-3" />
                          تنتهي في {expiryDate}
                          <span className={`font-bold ${urgent ? "text-destructive" : "text-primary"}`}>
                            ({daysLeft === 0 ? "اليوم" : daysLeft === 1 ? "غداً" : `بعد ${daysLeft} يوم`})
                          </span>
                        </p>
                      </div>
                    </div>
                    <Link to={renewUrl} className="block">
                      <Button className={`w-full font-bold ${urgent ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "gradient-primary text-primary-foreground"}`}>
                        <RefreshCw className="w-4 h-4 ml-2" />
                        جدّد نفس الباقة الآن
                      </Button>
                    </Link>
                    {activeSub.packages?.price && (
                      <p className="text-[11px] text-muted-foreground text-center">
                        السعر: <span className="font-bold text-foreground">{activeSub.packages.price.toLocaleString("ar")} د.ج</span>
                      </p>
                    )}
                  </motion.div>
                );
              })()}

              {/* Referral Section - hidden for admins */}
              {!isAdmin && <ReferralSection />}
            </TabsContent>

            <TabsContent value="stats" className="mt-6">
              <UserStatsDashboard />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </Layout>
  );
}
