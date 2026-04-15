import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Copy, Check, Users, Gift, Link as LinkIcon, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ReferralSection() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-referral", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*, profiles!referrals_referred_id_fkey(full_name)")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) {
        // Fallback without join if FK not set
        const { data: d2, error: e2 } = await supabase
          .from("referrals")
          .select("*")
          .eq("referrer_id", user!.id)
          .order("created_at", { ascending: false });
        if (e2) throw e2;
        return d2;
      }
      return data;
    },
  });

  const referralCode = profile?.referral_code;
  const referralLink = referralCode
    ? `${window.location.origin}/auth/register?ref=${referralCode}`
    : "";

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("تم نسخ رابط الإحالة!");
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "انضم إلى VisaRadar",
          text: "سجل عبر رابطي واحصل على خصم على اشتراكك!",
          url: referralLink,
        });
      } catch {}
    } else {
      copyLink();
    }
  };

  const rewardedCount = referrals.filter((r: any) => r.referrer_rewarded).length;
  const pendingCount = referrals.filter((r: any) => !r.referrer_rewarded).length;

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Referral Link */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Gift className="w-5 h-5 text-accent" />
            نظام الإحالة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            شارك رابطك الفريد مع أصدقائك. عند تسجيلهم واشتراكهم، تحصل على <strong className="text-accent">تمديد مجاني لاشتراكك</strong>، ويحصلون على <strong className="text-accent">خصم خاص</strong>!
          </p>

          {referralCode ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-foreground truncate font-mono" dir="ltr">
                  {referralLink}
                </div>
                <Button size="icon" variant="outline" onClick={copyLink} className="shrink-0">
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={shareLink} className="shrink-0">
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                رمز الإحالة: <span className="font-mono font-bold text-foreground">{referralCode}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">جاري تحميل رابط الإحالة...</p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <Users className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{referrals.length}</p>
            <p className="text-[11px] text-muted-foreground">إجمالي الإحالات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Gift className="w-5 h-5 text-accent mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{rewardedCount}</p>
            <p className="text-[11px] text-muted-foreground">مكافآت مكتسبة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <LinkIcon className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{pendingCount}</p>
            <p className="text-[11px] text-muted-foreground">بانتظار المكافأة</p>
          </CardContent>
        </Card>
      </div>

      {/* Referral list */}
      {referrals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">قائمة الإحالات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {referrals.map((ref: any) => (
              <div key={ref.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm text-foreground">{ref.profiles?.full_name || "مستخدم"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(ref.created_at).toLocaleDateString("ar-DZ")}</p>
                </div>
                <Badge variant={ref.referrer_rewarded ? "default" : "secondary"} className="text-xs">
                  {ref.referrer_rewarded ? "تم المكافأة" : "بانتظار الاشتراك"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
