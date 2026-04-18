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
import { User, Camera, Save, Loader2, Mail, Phone, MessageCircle, Volume2, BarChart3, UserCog, RefreshCw, Calendar, Send, CheckCircle2, Unlink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLinkedSince, formatFullDateAr } from "@/lib/relativeTime";

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
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLinkedAt, setTelegramLinkedAt] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeSub, setActiveSub] = useState<ActiveSub | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkData, setLinkData] = useState<{ link: string; expires_at: string } | null>(null);
  const [polling, setPolling] = useState(false);

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
        setTelegramUsername(profileData.telegram_username || null);
        setTelegramLinkedAt((profileData as any).telegram_linked_at || null);
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
        { user_id: user.id, full_name: fullName, phone },
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

              {/* Telegram link */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  ربط Telegram لاستلام التنبيهات
                </Label>

                {telegramId ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">حسابك مرتبط</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {telegramUsername ? `@${telegramUsername}` : `Chat ID: ${telegramId}`}
                        </p>
                        {telegramLinkedAt && (
                          <p
                            className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-1"
                            title={formatFullDateAr(telegramLinkedAt)}
                          >
                            <Calendar className="w-3 h-3" />
                            {formatLinkedSince(telegramLinkedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!user) return;
                        if (!confirm("هل تريد فك الربط؟ لن تستلم تنبيهات Telegram بعدها.")) return;
                        const { error } = await supabase
                          .from("profiles")
                          .update({ telegram_id: null, telegram_username: null })
                          .eq("user_id", user.id);
                        if (error) {
                          toast.error("فشل فك الربط");
                        } else {
                          setTelegramId("");
                          setTelegramUsername(null);
                          setTelegramLinkedAt(null);
                          toast.success("تم فك الربط");
                        }
                      }}
                      className="w-full gap-2"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      فك الربط
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                    {!linkData ? (
                      <>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          اضغط الزر أدناه لتوليد رابط ربط آمن. عند فتحه ستُحوَّل تلقائياً لـ Telegram، اضغط <strong>Start</strong>، وسيتم ربط حسابك فوراً.
                        </p>
                        <Button
                          onClick={async () => {
                            setLinkLoading(true);
                            const { data, error } = await supabase.functions.invoke("telegram-generate-link");
                            setLinkLoading(false);
                            if (error || !data?.link) {
                              toast.error("فشل توليد الرابط");
                              return;
                            }
                            setLinkData({ link: data.link, expires_at: data.expires_at });
                            window.open(data.link, "_blank");
                          }}
                          disabled={linkLoading}
                          className="w-full gradient-primary text-primary-foreground font-bold gap-2"
                        >
                          {linkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          ربط Telegram تلقائياً
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-foreground leading-relaxed">
                          تم فتح Telegram في تبويب جديد. اضغط <strong>Start</strong> هناك ثم ارجع واضغط <strong>«تحقّقت من الرسالة»</strong>.
                        </p>
                        <a
                          href={linkData.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          className="block text-xs font-mono text-primary underline break-all"
                        >
                          {linkData.link}
                        </a>
                        <Button
                          onClick={async () => {
                            if (!user) return;
                            setPolling(true);
                            const { data, error } = await supabase.functions.invoke("telegram-poll");
                            if (error) {
                              setPolling(false);
                              toast.error("فشل التحقق");
                              return;
                            }
                            // Re-fetch profile
                            const { data: p } = await supabase
                              .from("profiles")
                              .select("telegram_id, telegram_username, telegram_linked_at")
                              .eq("user_id", user.id)
                              .single();
                            setPolling(false);
                            if (p?.telegram_id) {
                              setTelegramId(p.telegram_id);
                              setTelegramUsername(p.telegram_username);
                              setTelegramLinkedAt((p as any).telegram_linked_at || null);
                              setLinkData(null);
                              toast.success("✅ تم ربط حسابك بنجاح!");
                            } else {
                              toast.error("لم نستلم /start بعد. تأكد أنك ضغطت Start في Telegram ثم حاول مجدداً.");
                              console.log("poll result:", data);
                            }
                          }}
                          disabled={polling}
                          className="w-full font-bold gap-2"
                          variant="default"
                        >
                          {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          تحقّقت من الرسالة
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLinkData(null)}
                          className="w-full text-xs"
                        >
                          إلغاء
                        </Button>
                      </>
                    )}
                  </div>
                )}
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

              {/* Chat history shortcut */}
              <Link to="/profile/conversations" className="block">
                <div className="flex items-center justify-between rounded-xl border border-border bg-card hover:border-accent/40 hover:bg-accent/5 transition-colors p-4 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-foreground text-sm group-hover:text-accent transition-colors">
                        سجل محادثات المساعد
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        تصفح، أعد فتح، أو احذف محادثاتك السابقة
                      </p>
                    </div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-accent transition-colors">←</span>
                </div>
              </Link>

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
