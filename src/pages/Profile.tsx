import Layout from "@/components/Layout";
import ReferralSection from "@/components/referral/ReferralSection";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { User, Camera, Save, Loader2, Mail, Phone, MessageCircle, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const [{ data: profileData }, { data: prefData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("notification_preferences").select("sound_enabled").eq("user_id", user.id).maybeSingle(),
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
          className="space-y-8"
        >
          <h1 className="text-2xl font-heading font-bold text-foreground text-center">
            الملف الشخصي
          </h1>

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

          {/* Referral Section */}
          <ReferralSection />
        </motion.div>
      </div>
    </Layout>
  );
}
