import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Gift, Check, Users, Award, Settings2, UserPlus, History, Undo2, CalendarPlus, CalendarMinus, CheckCircle2, XCircle, Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
interface AuditLog {
  id: string;
  old_referrer_days: number | null;
  new_referrer_days: number | null;
  old_referred_days: number | null;
  new_referred_days: number | null;
  created_at: string;
  changer_name?: string;
  changed_by: string;
}

interface RewardLog {
  id: string;
  referral_id: string;
  action: string;
  reward_type: string;
  bonus_days: number;
  target_user_id: string;
  performed_by: string;
  extension_applied: boolean;
  created_at: string;
  performer_name?: string;
  target_name?: string;
}

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  referrer_rewarded: boolean;
  referred_rewarded: boolean;
  referrer_bonus_days: number;
  referred_bonus_days: number;
  created_at: string;
  referrer_name?: string;
  referred_name?: string;
}

export default function ManageReferrals() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewarding, setRewarding] = useState<string | null>(null);
  const [referrerDays, setReferrerDays] = useState(7);
  const [referredDays, setReferredDays] = useState(7);
  const [savingDays, setSavingDays] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [rewardLogs, setRewardLogs] = useState<RewardLog[]>([]);
  const [savedReferrerDays, setSavedReferrerDays] = useState(7);
  const [savedReferredDays, setSavedReferredDays] = useState(7);
  // Custom days per referral (keyed by referral_id + reward_type)
  const [customDays, setCustomDays] = useState<Record<string, number>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; id: string; field: "referrer_rewarded" | "referred_rewarded"; days: number; name: string } | null>(null);
  const [revokeDialog, setRevokeDialog] = useState<{ open: boolean; id: string; field: "referrer_rewarded" | "referred_rewarded"; days: number; name: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { user } = useAuth();

  // Load sound preference
  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("sound_enabled").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setSoundEnabled(data.sound_enabled);
      });
  }, [user]);

  // Load bonus days from DB
  useEffect(() => {
    supabase.from("payment_settings").select("referrer_bonus_days, referred_bonus_days").limit(1).single()
      .then(({ data }) => {
        if (data) {
          if (data.referrer_bonus_days) { setReferrerDays(data.referrer_bonus_days); setSavedReferrerDays(data.referrer_bonus_days); }
          if (data.referred_bonus_days) { setReferredDays(data.referred_bonus_days); setSavedReferredDays(data.referred_bonus_days); }
        }
      });
    fetchAuditLogs();
    fetchRewardLogs();
  }, []);

  const fetchAuditLogs = async () => {
    const { data } = await supabase
      .from("settings_audit_log")
      .select("*")
      .eq("setting_name", "referral_bonus_days")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(l => l.changed_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      setAuditLogs(data.map(l => ({ ...l, changer_name: profileMap.get(l.changed_by) || "مدير" })));
    } else {
      setAuditLogs([]);
    }
  };

  const fetchRewardLogs = async () => {
    const { data } = await supabase
      .from("referral_reward_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data && data.length > 0) {
      const userIds = [...new Set((data as any[]).flatMap((l: any) => [l.performed_by, l.target_user_id]))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      setRewardLogs((data as any[]).map((l: any) => ({
        ...l,
        performer_name: profileMap.get(l.performed_by) || "مدير",
        target_name: profileMap.get(l.target_user_id) || "—",
      })));
    } else {
      setRewardLogs([]);
    }
  };

  const saveBonusDays = async () => {
    setSavingDays(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("payment_settings")
      .update({ referrer_bonus_days: referrerDays, referred_bonus_days: referredDays } as any)
      .not("id", "is", null);
    if (error) {
      toast.error("فشل حفظ الإعداد");
    } else {
      // Log the change
      if (user) {
        await supabase.from("settings_audit_log").insert({
          changed_by: user.id,
          setting_name: "referral_bonus_days",
          old_referrer_days: savedReferrerDays,
          new_referrer_days: referrerDays,
          old_referred_days: savedReferredDays,
          new_referred_days: referredDays,
        } as any);
        fetchAuditLogs();
      }
      setSavedReferrerDays(referrerDays);
      setSavedReferredDays(referredDays);
      toast.success(`تم حفظ: المُحيل ${referrerDays} يوم، المُحال ${referredDays} يوم`);
    }
    setSavingDays(false);
  };

  const fetchReferrals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("فشل تحميل الإحالات");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setReferrals([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data.flatMap(r => [r.referrer_id, r.referred_id]))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

    const enriched: ReferralRow[] = data.map(r => ({
      ...r,
      referrer_name: profileMap.get(r.referrer_id) || "—",
      referred_name: profileMap.get(r.referred_id) || "—",
    }));

    setReferrals(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchReferrals(); }, []);

  const openRewardConfirm = (id: string, field: "referrer_rewarded" | "referred_rewarded", name: string) => {
    const rewardType = field === "referrer_rewarded" ? "referrer" : "referred";
    const customKey = `${id}_${rewardType}`;
    const days = customDays[customKey] ?? (rewardType === "referrer" ? referrerDays : referredDays);
    setConfirmDialog({ open: true, id, field, days, name });
  };

  const playSound = useCallback((type: "success" | "error") => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = "square";
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {}
  }, [soundEnabled]);

  const handleReward = async () => {
    if (!confirmDialog) return;
    const { id, field } = confirmDialog;
    setRewarding(id + field);
    setConfirmDialog(null);
    const rewardType = field === "referrer_rewarded" ? "referrer" : "referred";
    const customKey = `${id}_${rewardType}`;
    const days = customDays[customKey] ?? (rewardType === "referrer" ? referrerDays : referredDays);

    const { data, error } = await supabase.functions.invoke("grant-referral-reward", {
      body: { referral_id: id, reward_type: rewardType, bonus_days: days },
    });

    if (error || !data?.success) {
      playSound("error");
      toast.error(data?.error || "فشل منح المكافأة");
    } else {
      playSound("success");
      toast.success(data.message || "تم منح المكافأة بنجاح");
      fetchReferrals();
      fetchRewardLogs();
    }
    setRewarding(null);
  };

  const openRevokeConfirm = (id: string, field: "referrer_rewarded" | "referred_rewarded", days: number, name: string) => {
    setRevokeDialog({ open: true, id, field, days, name });
  };

  const handleRevoke = async () => {
    if (!revokeDialog) return;
    const { id, field } = revokeDialog;
    const rewardType = field === "referrer_rewarded" ? "referrer" : "referred";
    setRevoking(id + field);
    setRevokeDialog(null);

    const { data, error } = await supabase.functions.invoke("grant-referral-reward", {
      body: { referral_id: id, reward_type: rewardType, action: "revoke" },
    });

    if (error || !data?.success) {
      playSound("error");
      toast.error(data?.error || "فشل سحب المكافأة");
    } else {
      playSound("success");
      toast.success(data.message || "تم سحب المكافأة");
      fetchReferrals();
      fetchRewardLogs();
    }
    setRevoking(null);
  };

  const stats = {
    total: referrals.length,
    rewarded: referrals.filter(r => r.referrer_rewarded).length,
    pending: referrals.filter(r => !r.referrer_rewarded).length,
  };

  return (
    <AdminLayout title="إدارة الإحالات" subtitle="عرض جميع الإحالات ومنح المكافآت">
      {/* Sound toggle */}
      <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${soundEnabled ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/30 bg-destructive/10'} transition-colors`}>
        {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-500" /> : <VolumeX className="w-4 h-4 text-destructive" />}
        <span className="text-xs font-medium text-foreground">
          {soundEnabled ? 'صوت التنبيه مفعّل' : 'صوت التنبيه معطّل'}
        </span>
        <Switch
          checked={soundEnabled}
          onCheckedChange={async (checked) => {
            setSoundEnabled(checked);
            if (user) {
              await supabase.from("notification_preferences").upsert({ user_id: user.id, sound_enabled: checked }, { onConflict: "user_id" });
            }
            toast.success(checked ? "تم تفعيل صوت التنبيه" : "تم إيقاف صوت التنبيه");
          }}
          className="mr-auto"
        />
      </div>
      {/* Bonus days config */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-5 h-5 text-primary" />
          <p className="text-sm font-semibold text-foreground">إعدادات أيام المكافأة</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">المُحيل:</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={referrerDays}
              onChange={(e) => setReferrerDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-8 w-20 text-center font-bold"
            />
            <span className="text-xs text-muted-foreground">يوم</span>
          </div>
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">المُحال:</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={referredDays}
              onChange={(e) => setReferredDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-8 w-20 text-center font-bold"
            />
            <span className="text-xs text-muted-foreground">يوم</span>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={savingDays}
            onClick={saveBonusDays}
          >
            {savingDays ? "..." : "حفظ"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "إجمالي الإحالات", value: stats.total, icon: Users, color: "text-primary" },
          { label: "مكافآت ممنوحة", value: stats.rewarded, icon: Award, color: "text-green-500" },
          { label: "في الانتظار", value: stats.pending, icon: Gift, color: "text-amber-500" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/30 bg-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table - Desktop */}
      <div className="rounded-xl border border-border/30 bg-card overflow-hidden hidden sm:block">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
        ) : referrals.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">لا توجد إحالات بعد</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المُحيل</TableHead>
                <TableHead className="text-right">المُحال</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">مكافأة المُحيل</TableHead>
                <TableHead className="text-right">مكافأة المُحال</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-right font-medium">{r.referrer_name}</TableCell>
                  <TableCell className="text-right">{r.referred_name}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {new Date(r.created_at).toLocaleDateString("ar-DZ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.referrer_rewarded ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                          <Check className="w-3 h-3 ml-1" /> {r.referrer_bonus_days > 0 ? `+${r.referrer_bonus_days} يوم` : "ممنوحة"}
                        </Badge>
                        <Button size="sm" variant="ghost" disabled={revoking === r.id + "referrer_rewarded"} onClick={() => openRevokeConfirm(r.id, "referrer_rewarded", r.referrer_bonus_days, r.referrer_name || "—")} className="text-xs h-7 text-destructive hover:text-destructive"><Undo2 className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input type="number" min={1} max={365} value={customDays[`${r.id}_referrer`] ?? referrerDays} onChange={(e) => setCustomDays(prev => ({ ...prev, [`${r.id}_referrer`]: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-7 w-14 text-center text-xs" />
                        <Button size="sm" variant="outline" disabled={rewarding === r.id + "referrer_rewarded"} onClick={() => openRewardConfirm(r.id, "referrer_rewarded", r.referrer_name || "—")} className="text-xs h-7"><Gift className="w-3 h-3 ml-1" /> منح</Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.referred_rewarded ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                          <Check className="w-3 h-3 ml-1" /> {r.referred_bonus_days > 0 ? `+${r.referred_bonus_days} يوم` : "ممنوحة"}
                        </Badge>
                        <Button size="sm" variant="ghost" disabled={revoking === r.id + "referred_rewarded"} onClick={() => openRevokeConfirm(r.id, "referred_rewarded", r.referred_bonus_days, r.referred_name || "—")} className="text-xs h-7 text-destructive hover:text-destructive"><Undo2 className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input type="number" min={1} max={365} value={customDays[`${r.id}_referred`] ?? referredDays} onChange={(e) => setCustomDays(prev => ({ ...prev, [`${r.id}_referred`]: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-7 w-14 text-center text-xs" />
                        <Button size="sm" variant="outline" disabled={rewarding === r.id + "referred_rewarded"} onClick={() => openRewardConfirm(r.id, "referred_rewarded", r.referred_name || "—")} className="text-xs h-7"><Gift className="w-3 h-3 ml-1" /> منح</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Cards - Mobile */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
        ) : referrals.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">لا توجد إحالات بعد</div>
        ) : referrals.map(r => (
          <div key={r.id} className="rounded-xl border border-border/30 bg-card p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{r.referrer_name}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-sm text-foreground">{r.referred_name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-DZ")}</span>
            </div>

            {/* Referrer reward */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">مكافأة المُحيل</p>
              {r.referrer_rewarded ? (
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Check className="w-3 h-3 ml-1" /> {r.referrer_bonus_days > 0 ? `+${r.referrer_bonus_days} يوم` : "ممنوحة"}
                  </Badge>
                  <Button size="sm" variant="ghost" disabled={revoking === r.id + "referrer_rewarded"} onClick={() => openRevokeConfirm(r.id, "referrer_rewarded", r.referrer_bonus_days, r.referrer_name || "—")} className="text-xs h-7 text-destructive hover:text-destructive"><Undo2 className="w-3 h-3 ml-1" /> سحب</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} value={customDays[`${r.id}_referrer`] ?? referrerDays} onChange={(e) => setCustomDays(prev => ({ ...prev, [`${r.id}_referrer`]: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-8 w-16 text-center text-xs" />
                  <span className="text-xs text-muted-foreground">يوم</span>
                  <Button size="sm" variant="outline" disabled={rewarding === r.id + "referrer_rewarded"} onClick={() => openRewardConfirm(r.id, "referrer_rewarded", r.referrer_name || "—")} className="text-xs h-8"><Gift className="w-3 h-3 ml-1" /> منح</Button>
                </div>
              )}
            </div>

            {/* Referred reward */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">مكافأة المُحال</p>
              {r.referred_rewarded ? (
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Check className="w-3 h-3 ml-1" /> {r.referred_bonus_days > 0 ? `+${r.referred_bonus_days} يوم` : "ممنوحة"}
                  </Badge>
                  <Button size="sm" variant="ghost" disabled={revoking === r.id + "referred_rewarded"} onClick={() => openRevokeConfirm(r.id, "referred_rewarded", r.referred_bonus_days, r.referred_name || "—")} className="text-xs h-7 text-destructive hover:text-destructive"><Undo2 className="w-3 h-3 ml-1" /> سحب</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} value={customDays[`${r.id}_referred`] ?? referredDays} onChange={(e) => setCustomDays(prev => ({ ...prev, [`${r.id}_referred`]: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-8 w-16 text-center text-xs" />
                  <span className="text-xs text-muted-foreground">يوم</span>
                  <Button size="sm" variant="outline" disabled={rewarding === r.id + "referred_rewarded"} onClick={() => openRewardConfirm(r.id, "referred_rewarded", r.referred_name || "—")} className="text-xs h-8"><Gift className="w-3 h-3 ml-1" /> منح</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reward Actions Log */}
      {rewardLogs.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card overflow-hidden mt-6">
          <div className="p-4 border-b border-border/30 flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">سجل عمليات المكافآت</h3>
            <Badge variant="secondary" className="text-[10px]">{rewardLogs.length}</Badge>
          </div>
          <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
            {rewardLogs.map(log => (
              <div key={log.id} className="p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.action === "grant" ? "default" : "destructive"} className="text-[10px]">
                      {log.action === "grant" ? "منح" : "سحب"}
                    </Badge>
                    <span className="font-medium text-foreground">{log.target_name}</span>
                    <span className="text-muted-foreground">({log.reward_type === "referrer" ? "مُحيل" : "مُحال"})</span>
                  </div>
                  <span className="text-[10px]">{new Date(log.created_at).toLocaleString("ar-DZ")}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>{log.bonus_days} يوم</span>
                  {log.extension_applied ? (
                    <span className="text-green-400">✅ تم تعديل الاشتراك</span>
                  ) : (
                    <span className="text-amber-400">⚠️ لا اشتراك نشط</span>
                  )}
                  <span>بواسطة: {log.performer_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Log */}
      {auditLogs.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card overflow-hidden mt-6">
          <div className="p-4 border-b border-border/30 flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">سجل التغييرات</h3>
          </div>
          <div className="divide-y divide-border/20">
            {auditLogs.map(log => (
              <div key={log.id} className="p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{log.changer_name}</span>
                  <span>{new Date(log.created_at).toLocaleString("ar-DZ")}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {log.old_referrer_days !== log.new_referrer_days && (
                    <span>المُحيل: <span className="text-destructive">{log.old_referrer_days}</span> → <span className="text-primary font-bold">{log.new_referrer_days}</span></span>
                  )}
                  {log.old_referred_days !== log.new_referred_days && (
                    <span>المُحال: <span className="text-destructive">{log.old_referred_days}</span> → <span className="text-primary font-bold">{log.new_referred_days}</span></span>
                  )}
                  {log.old_referrer_days === log.new_referrer_days && log.old_referred_days === log.new_referred_days && (
                    <span>لم تتغير القيم</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm reward dialog */}
      <Dialog open={!!confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="max-w-sm text-center animate-[dialog-pop_0.3s_ease-out]">
          <DialogHeader className="flex flex-col items-center gap-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 animate-[icon-bounce_0.5s_ease-out_0.1s_both]">
              <Gift className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-xl">تأكيد منح المكافأة</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              هل تريد منح <span className="font-bold text-foreground">{confirmDialog?.name}</span> مكافأة{" "}
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">
                <CalendarPlus className="h-4 w-4" />
                {confirmDialog?.days} يوم
              </span>
              ؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" className="transition-transform active:scale-95" onClick={() => setConfirmDialog(null)}>إلغاء</Button>
            <Button className="gap-2 transition-all active:scale-95 hover:shadow-lg hover:shadow-primary/25" onClick={handleReward}>
              <CheckCircle2 className="h-4 w-4" />
              تأكيد المنح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke reward dialog */}
      <Dialog open={!!revokeDialog?.open} onOpenChange={(open) => !open && setRevokeDialog(null)}>
        <DialogContent className="max-w-sm text-center animate-[dialog-pop_0.3s_ease-out]">
          <DialogHeader className="flex flex-col items-center gap-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 animate-[icon-shake_0.5s_ease-out_0.1s_both]">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
            <DialogTitle className="text-xl">تأكيد سحب المكافأة</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              هل تريد سحب المكافأة من <span className="font-bold text-foreground">{revokeDialog?.name}</span>
              {revokeDialog?.days && revokeDialog.days > 0 ? (
                <>
                  {" "}وإزالة{" "}
                  <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 font-bold text-destructive">
                    <CalendarMinus className="h-4 w-4" />
                    {revokeDialog.days} يوم
                  </span>
                  {" "}من اشتراكه؟
                </>
              ) : "؟"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" className="transition-transform active:scale-95" onClick={() => setRevokeDialog(null)}>إلغاء</Button>
            <Button variant="destructive" className="gap-2 transition-all active:scale-95 hover:shadow-lg hover:shadow-destructive/25" onClick={handleRevoke}>
              <XCircle className="h-4 w-4" />
              تأكيد السحب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
