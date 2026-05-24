import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

const SETTING_KEYS = [
  "antifp_enabled", "antifp_threshold", "antifp_cooldown_minutes",
  "antifp_weight_api", "antifp_weight_dom",
  "antifp_weight_calendar", "antifp_weight_playwright",
  "antifp_fresh_minutes",
];

export default function AdminAntiFalsePositive() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: settings } = useQuery({
    queryKey: ["antifp-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", SETTING_KEYS);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of data || []) map[r.key] = r.value as string;
      return map;
    },
  });

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const { data: decisions, isLoading } = useQuery({
    queryKey: ["alert-decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["antifp-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data } = await supabase
        .from("alert_decisions")
        .select("decision")
        .gte("created_at", since);
      const out = { sent: 0, blocked_low_score: 0, blocked_cooldown: 0, blocked_disabled: 0, error: 0, total: 0 };
      for (const r of data || []) { (out as any)[r.decision]++; out.total++; }
      return out;
    },
    refetchInterval: 60_000,
  });

  const saveSettings = useMutation({
    mutationFn: async () => {
      const updates = SETTING_KEYS.map((k) => ({ key: k, value: form[k] ?? "" }));
      for (const u of updates) {
        const { error } = await supabase.from("site_settings").upsert(u, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["antifp-settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decisionBadge = (d: string) => {
    const m: Record<string, { label: string; cls: string; icon: any }> = {
      sent: { label: "أُرسل", cls: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
      blocked_low_score: { label: "حُجب — نتيجة منخفضة", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: XCircle },
      blocked_cooldown: { label: "حُجب — cooldown", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Clock },
      blocked_disabled: { label: "الطبقة مُعطّلة", cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: AlertCircle },
      error: { label: "خطأ", cls: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
    };
    const x = m[d] || m.error;
    const Icon = x.icon;
    return <Badge variant="outline" className={x.cls}><Icon className="h-3 w-3 mr-1" />{x.label}</Badge>;
  };

  const total = (parseInt(form.antifp_weight_api || "0") || 0) +
                (parseInt(form.antifp_weight_dom || "0") || 0) +
                (parseInt(form.antifp_weight_calendar || "0") || 0) +
                (parseInt(form.antifp_weight_playwright || "0") || 0);

  return (
    <AdminLayout title="Anti False Positive">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Anti False Positive Layer
          </h1>
          <p className="text-muted-foreground mt-1">
            بوابة قرار قبل إرسال أي تنبيه: تجمع 4 طبقات (API + DOM + Calendar + Playwright) وتحسب confidence score
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">إجمالي القرارات (24س)</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-400">{stats.sent}</div><div className="text-xs text-muted-foreground">أُرسلت</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-yellow-400">{stats.blocked_low_score}</div><div className="text-xs text-muted-foreground">حُجبت (score)</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-blue-400">{stats.blocked_cooldown}</div><div className="text-xs text-muted-foreground">حُجبت (cooldown)</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-400">{stats.error}</div><div className="text-xs text-muted-foreground">أخطاء</div></CardContent></Card>
          </div>
        )}

        <Tabs defaultValue="decisions">
          <TabsList>
            <TabsTrigger value="decisions">سجل القرارات</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات والأوزان</TabsTrigger>
          </TabsList>

          <TabsContent value="decisions" className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["alert-decisions"] })}>
                <RefreshCw className="h-4 w-4 mr-1" /> تحديث
              </Button>
            </div>
            {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> :
              !decisions?.length ? <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد قرارات بعد</CardContent></Card> :
              decisions.map((d: any) => {
                const pct = Math.round((d.confidence_score / (d.threshold || 100)) * 100);
                return (
                  <Card key={d.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold">{d.country_code}</span>
                          <Badge variant="secondary">{d.provider}</Badge>
                          {d.category && <Badge variant="outline">{d.category}</Badge>}
                          {decisionBadge(d.decision)}
                          <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString("ar-DZ")}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{d.confidence_score}<span className="text-sm text-muted-foreground">/{d.threshold}</span></div>
                        </div>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-2" />
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="text-center p-2 bg-muted rounded"><div className="text-muted-foreground">API</div><div className="font-bold">{d.api_score}</div></div>
                        <div className="text-center p-2 bg-muted rounded"><div className="text-muted-foreground">DOM</div><div className="font-bold">{d.dom_score}</div></div>
                        <div className="text-center p-2 bg-muted rounded"><div className="text-muted-foreground">Calendar</div><div className="font-bold">{d.calendar_score}</div></div>
                        <div className="text-center p-2 bg-muted rounded"><div className="text-muted-foreground">Playwright</div><div className="font-bold">{d.playwright_score}</div></div>
                      </div>
                      {d.block_reason && <p className="text-xs text-muted-foreground">{d.block_reason}</p>}
                      <details><summary className="text-xs text-muted-foreground cursor-pointer">تفاصيل الطبقات</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-muted rounded overflow-auto max-h-40">{JSON.stringify(d.layer_details, null, 2)}</pre>
                      </details>
                    </CardContent>
                  </Card>
                );
              })
            }
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader><CardTitle>إعدادات الطبقة</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                  <div>
                    <Label>تفعيل الطبقة</Label>
                    <p className="text-xs text-muted-foreground">عند الإيقاف، يتم تجاوز الفحص وإرسال كل التنبيهات مباشرة</p>
                  </div>
                  <Switch
                    checked={form.antifp_enabled === "true"}
                    onCheckedChange={(v) => setForm({ ...form, antifp_enabled: v ? "true" : "false" })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><Label>عتبة الإرسال (threshold)</Label><Input type="number" value={form.antifp_threshold || ""} onChange={(e) => setForm({ ...form, antifp_threshold: e.target.value })} /></div>
                  <div><Label>Cooldown (دقائق)</Label><Input type="number" value={form.antifp_cooldown_minutes || ""} onChange={(e) => setForm({ ...form, antifp_cooldown_minutes: e.target.value })} /></div>
                  <div><Label>نافذة "حديث" (دقائق)</Label><Input type="number" value={form.antifp_fresh_minutes || ""} onChange={(e) => setForm({ ...form, antifp_fresh_minutes: e.target.value })} /></div>
                </div>

                <div>
                  <Label className="mb-2 block">أوزان الطبقات (المجموع = {total})</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><Label className="text-xs">API</Label><Input type="number" value={form.antifp_weight_api || ""} onChange={(e) => setForm({ ...form, antifp_weight_api: e.target.value })} /></div>
                    <div><Label className="text-xs">DOM</Label><Input type="number" value={form.antifp_weight_dom || ""} onChange={(e) => setForm({ ...form, antifp_weight_dom: e.target.value })} /></div>
                    <div><Label className="text-xs">Calendar</Label><Input type="number" value={form.antifp_weight_calendar || ""} onChange={(e) => setForm({ ...form, antifp_weight_calendar: e.target.value })} /></div>
                    <div><Label className="text-xs">Playwright</Label><Input type="number" value={form.antifp_weight_playwright || ""} onChange={(e) => setForm({ ...form, antifp_weight_playwright: e.target.value })} /></div>
                  </div>
                  {total !== 100 && <p className="text-xs text-yellow-400 mt-2">⚠️ المجموع ليس 100 — تأكد أن العتبة مناسبة للمجموع الفعلي</p>}
                </div>

                <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  <Save className="h-4 w-4 mr-1" /> حفظ
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">كيفية الاستخدام</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>بدل استدعاء <code className="bg-muted px-1 rounded">send-visa-notification</code> مباشرة، استدعِ:</p>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">{`supabase.functions.invoke('evaluate-visa-alert', {
  body: {
    country_code: 'FR',
    provider: 'vfs',
    category: 'study',
    title: '...',
    message: '...',
    source_url: '...',
  }
})`}</pre>
                <p>الـ gateway سيحسب الـ score من 4 طبقات، يقارنه بالعتبة، ويرسل (أو يحجب) تلقائياً.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}