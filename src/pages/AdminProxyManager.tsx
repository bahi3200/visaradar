import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Play, Trash2, RefreshCw, CheckCircle2, XCircle, Clock as ClockIcon, Zap, Activity, Heart, AlertTriangle, Skull } from "lucide-react";

type Pool = {
  id: string;
  name: string;
  provider: string | null;
  pool_type: string;
  rotation_strategy: string;
  is_active: boolean;
  target_countries: string[] | null;
};

type Endpoint = {
  id: string;
  pool_id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  geo_country: string | null;
  status: string;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  avg_latency_ms: number | null;
  cooldown_until: string | null;
  last_used_at: string | null;
  last_error: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-600 border-green-500/30",
  banned: "bg-red-500/15 text-red-600 border-red-500/30",
  cooldown: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  disabled: "bg-muted text-muted-foreground",
  testing: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

export default function AdminProxyManager() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [epDialogOpen, setEpDialogOpen] = useState(false);
  const [decodoDialogOpen, setDecodoDialogOpen] = useState(false);

  // Health checker state
  const [healthRunning, setHealthRunning] = useState(false);
  const [healthResults, setHealthResults] = useState<any[]>([]);
  const [healthSummary, setHealthSummary] = useState<{healthy:number;slow:number;blocked:number;dead:number} | null>(null);
  const [healthDirectIp, setHealthDirectIp] = useState<string | null>(null);
  const [autoDisable, setAutoDisable] = useState(true);

  // Decodo quick-setup form (gateway-style residential rotating)
  const [decodoForm, setDecodoForm] = useState({
    username: "",
    password: "",
    host: "gate.decodo.com",
    port: "7000",
    sessions: "10",
    geo_country: "",
  });

  // Pool form
  const [poolForm, setPoolForm] = useState({ name: "", provider: "", pool_type: "residential", rotation_strategy: "round_robin" });

  // Endpoint form
  const [epForm, setEpForm] = useState({ protocol: "http", host: "", port: "8080", username: "", password: "", geo_country: "" });

  // Bulk import textarea
  const [bulkText, setBulkText] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from("proxy_pools").select("*").order("created_at", { ascending: false }),
      supabase.from("proxy_endpoints").select("*").order("last_used_at", { ascending: false, nullsFirst: true }),
    ]);
    setPools((p as Pool[]) || []);
    setEndpoints((e as Endpoint[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("proxy-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "proxy_endpoints" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "proxy_pools" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const createPool = async () => {
    if (!poolForm.name.trim()) { toast.error("اسم الـ pool مطلوب"); return; }
    const { error } = await supabase.from("proxy_pools").insert({
      name: poolForm.name.trim(),
      provider: poolForm.provider || null,
      pool_type: poolForm.pool_type,
      rotation_strategy: poolForm.rotation_strategy,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الـ pool");
    setPoolDialogOpen(false);
    setPoolForm({ name: "", provider: "", pool_type: "residential", rotation_strategy: "round_robin" });
    load();
  };

  const deletePool = async (id: string) => {
    if (!confirm("حذف الـ pool وكل proxies بداخله؟")) return;
    const { error } = await supabase.from("proxy_pools").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    if (selectedPool === id) setSelectedPool(null);
  };

  const togglePool = async (p: Pool) => {
    await supabase.from("proxy_pools").update({ is_active: !p.is_active }).eq("id", p.id);
  };

  const createEndpoint = async () => {
    if (!selectedPool) { toast.error("اختر pool أولاً"); return; }
    if (!epForm.host || !epForm.port) { toast.error("الـ host و port مطلوبان"); return; }
    const { error } = await supabase.from("proxy_endpoints").insert({
      pool_id: selectedPool,
      protocol: epForm.protocol,
      host: epForm.host.trim(),
      port: parseInt(epForm.port),
      username: epForm.username || null,
      password: epForm.password || null,
      geo_country: epForm.geo_country || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة الـ proxy");
    setEpDialogOpen(false);
    setEpForm({ protocol: "http", host: "", port: "8080", username: "", password: "", geo_country: "" });
  };

  // Bulk import: lines like "host:port:user:pass" or "protocol://user:pass@host:port"
  const bulkImport = async () => {
    if (!selectedPool) { toast.error("اختر pool أولاً"); return; }
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const rows: any[] = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const u = new URL(line);
          rows.push({
            pool_id: selectedPool,
            protocol: u.protocol.replace(":", "") || "http",
            host: u.hostname,
            port: parseInt(u.port) || 8080,
            username: decodeURIComponent(u.username) || null,
            password: decodeURIComponent(u.password) || null,
          });
        } else {
          const [host, port, user, pass] = line.split(":");
          if (!host || !port) continue;
          rows.push({
            pool_id: selectedPool,
            protocol: "http",
            host,
            port: parseInt(port),
            username: user || null,
            password: pass || null,
          });
        }
      } catch { /* skip */ }
    }
    if (!rows.length) { toast.error("لم يتم تحليل أي سطر"); return; }
    const { error } = await supabase.from("proxy_endpoints").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم استيراد ${rows.length} proxy`);
    setBulkText("");
  };

  // Provision Decodo Residential Rotating: creates a pool + N session endpoints.
  // Decodo gateway uses username modifiers like `user-session-XXXX` for sticky
  // sessions; a single rotating endpoint also works. We create one rotating
  // endpoint + N sticky sessions for parallel scans.
  const setupDecodo = async () => {
    if (!decodoForm.username || !decodoForm.password || !decodoForm.host || !decodoForm.port) {
      toast.error("املأ كل الحقول المطلوبة"); return;
    }
    const port = parseInt(decodoForm.port);
    if (!Number.isFinite(port)) { toast.error("port غير صالح"); return; }
    const sessions = Math.min(50, Math.max(1, parseInt(decodoForm.sessions) || 1));
    const geo = decodoForm.geo_country.trim().toUpperCase() || null;

    // 1. Find or create the Decodo pool
    let poolId: string | null = pools.find(p => p.name === "decodo-residential")?.id ?? null;
    if (!poolId) {
      const { data: poolData, error: poolErr } = await supabase.from("proxy_pools").insert({
        name: "decodo-residential",
        provider: "Decodo",
        pool_type: "residential",
        rotation_strategy: "least_used",
        target_countries: geo ? [geo] : [],
      }).select("id").single();
      if (poolErr) { toast.error(poolErr.message); return; }
      poolId = poolData!.id;
    }

    // 2. Build endpoints: 1 rotating + N sticky sessions
    const rows: any[] = [{
      pool_id: poolId,
      protocol: "http",
      host: decodoForm.host.trim(),
      port,
      username: decodoForm.username.trim(),
      password: decodoForm.password,
      geo_country: geo,
      notes: "Decodo rotating gateway",
    }];
    for (let i = 1; i <= sessions; i++) {
      const sessionId = `${Date.now().toString(36)}${i}`;
      // Decodo session-username convention: user-session-XXXX[-country-XX]
      const sessionUser = geo
        ? `${decodoForm.username.trim()}-session-${sessionId}-country-${geo.toLowerCase()}`
        : `${decodoForm.username.trim()}-session-${sessionId}`;
      rows.push({
        pool_id: poolId,
        protocol: "http",
        host: decodoForm.host.trim(),
        port,
        username: sessionUser,
        password: decodoForm.password,
        geo_country: geo,
        notes: `Decodo sticky session #${i}`,
      });
    }
    const { error } = await supabase.from("proxy_endpoints").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم إعداد Decodo: ${rows.length} endpoints`);
    setDecodoDialogOpen(false);
    setSelectedPool(poolId);
  };

  const deleteEndpoint = async (id: string) => {
    if (!confirm("حذف هذا الـ proxy؟")) return;
    await supabase.from("proxy_endpoints").delete().eq("id", id);
  };

  const resetCooldown = async (id: string) => {
    await supabase.from("proxy_endpoints").update({
      status: "active",
      cooldown_until: null,
      consecutive_failures: 0,
    }).eq("id", id);
    toast.success("تم إعادة التفعيل");
  };

  const testProxy = async (proxy_id?: string, pool_id?: string) => {
    const t = toast.loading("جاري الاختبار...");
    try {
      const { data, error } = await supabase.functions.invoke("test-proxy", {
        body: { proxy_id, pool_id },
      });
      toast.dismiss(t);
      if (error) { toast.error(error.message); return; }
      const results = (data as any)?.results || [];
      if (!results.length) {
        toast.info((data as any)?.message || "لا يوجد proxies للاختبار");
        return;
      }
      const ok = results.filter((r: any) => r.ok).length;
      toast.success(`${ok}/${results.length} نجحت`);
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  };

  const runHealthCheck = async () => {
    if (!selectedPool && !endpoints.length) {
      toast.error("اختر pool أو أضف proxies");
      return;
    }
    setHealthRunning(true);
    const t = toast.loading("جاري الفحص الشامل...");
    try {
      const body: any = { auto_disable: autoDisable };
      if (selectedPool) body.pool_id = selectedPool;
      else if (pools[0]) body.pool_id = pools[0].id;
      const { data, error } = await supabase.functions.invoke("proxy-health-check", { body });
      toast.dismiss(t);
      if (error) { toast.error(error.message); return; }
      const res = (data as any)?.results || [];
      setHealthResults(res);
      setHealthSummary((data as any)?.summary || null);
      setHealthDirectIp((data as any)?.direct_ip || null);
      if (!res.length) {
        toast.info((data as any)?.message || "لا يوجد proxies للفحص");
        return;
      }
      const s = (data as any).summary;
      toast.success(`Healthy: ${s.healthy} · Slow: ${s.slow} · Blocked: ${s.blocked} · Dead: ${s.dead}`);
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    } finally {
      setHealthRunning(false);
    }
  };

  const HEALTH_STYLES: Record<string, { cls: string; icon: any; label: string }> = {
    healthy: { cls: "bg-green-500/15 text-green-600 border-green-500/30", icon: Heart,         label: "Healthy" },
    slow:    { cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", icon: ClockIcon,  label: "Slow" },
    blocked: { cls: "bg-orange-500/15 text-orange-600 border-orange-500/30", icon: AlertTriangle, label: "Blocked" },
    dead:    { cls: "bg-red-500/15 text-red-600 border-red-500/30", icon: Skull,              label: "Dead" },
  };

  const filteredEndpoints = selectedPool
    ? endpoints.filter(e => e.pool_id === selectedPool)
    : endpoints;

  const stats = {
    total: endpoints.length,
    active: endpoints.filter(e => e.status === "active").length,
    banned: endpoints.filter(e => e.status === "banned").length,
    cooldown: endpoints.filter(e => e.cooldown_until && new Date(e.cooldown_until) > new Date()).length,
  };

  return (
    <AdminLayout title="إدارة الـ Proxies" subtitle="Residential / Datacenter Pools + Health Monitoring">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">إجمالي</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-600">{stats.active}</div><div className="text-xs text-muted-foreground">نشط</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-yellow-600">{stats.cooldown}</div><div className="text-xs text-muted-foreground">في cooldown</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-600">{stats.banned}</div><div className="text-xs text-muted-foreground">محظور</div></CardContent></Card>
      </div>

      <Tabs defaultValue="pools" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pools">المجمّعات (Pools)</TabsTrigger>
          <TabsTrigger value="endpoints">العناوين (Endpoints)</TabsTrigger>
          <TabsTrigger value="bulk">استيراد جماعي</TabsTrigger>
          <TabsTrigger value="decodo">Decodo</TabsTrigger>
          <TabsTrigger value="health"><Activity className="w-3.5 h-3.5 ml-1" />Health Checker</TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">إنشاء مجمّعات منطقية للـ proxies حسب المزوّد أو المنطقة الجغرافية.</p>
            <Dialog open={poolDialogOpen} onOpenChange={setPoolDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 ml-1" /> Pool جديد</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>إنشاء Pool جديد</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>الاسم *</Label><Input value={poolForm.name} onChange={e => setPoolForm({ ...poolForm, name: e.target.value })} placeholder="مثال: bright-data-eu" /></div>
                  <div><Label>المزوّد</Label><Input value={poolForm.provider} onChange={e => setPoolForm({ ...poolForm, provider: e.target.value })} placeholder="Bright Data / Oxylabs / Smartproxy..." /></div>
                  <div><Label>النوع</Label>
                    <Select value={poolForm.pool_type} onValueChange={v => setPoolForm({ ...poolForm, pool_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">Residential</SelectItem>
                        <SelectItem value="datacenter">Datacenter</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="isp">ISP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>استراتيجية التدوير</Label>
                    <Select value={poolForm.rotation_strategy} onValueChange={v => setPoolForm({ ...poolForm, rotation_strategy: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round_robin">Round Robin</SelectItem>
                        <SelectItem value="random">عشوائي</SelectItem>
                        <SelectItem value="least_used">الأقل استخداماً</SelectItem>
                        <SelectItem value="sticky">ثابت (Sticky)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createPool} className="w-full">إنشاء</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3">
            {pools.map(p => (
              <Card key={p.id} className={selectedPool === p.id ? "ring-2 ring-primary" : ""}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex-1 cursor-pointer" onClick={() => setSelectedPool(p.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold">{p.name}</h3>
                      <Badge variant="outline" className="text-xs">{p.pool_type}</Badge>
                      <Badge variant="outline" className="text-xs">{p.rotation_strategy}</Badge>
                      {!p.is_active && <Badge variant="destructive" className="text-xs">معطّل</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.provider || "—"} · {endpoints.filter(e => e.pool_id === p.id).length} proxies</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => testProxy(undefined, p.id)}><Play className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => togglePool(p)}>{p.is_active ? "تعطيل" : "تفعيل"}</Button>
                  <Button size="sm" variant="destructive" onClick={() => deletePool(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </CardContent>
              </Card>
            ))}
            {!pools.length && <p className="text-center text-muted-foreground py-8">لا يوجد pools. أنشئ واحداً للبدء.</p>}
          </div>
        </TabsContent>

        <TabsContent value="endpoints">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="text-sm text-muted-foreground">
              {selectedPool ? `العناوين في: ${pools.find(p => p.id === selectedPool)?.name}` : "جميع العناوين"}
              {selectedPool && <Button size="sm" variant="ghost" onClick={() => setSelectedPool(null)} className="mr-2">عرض الكل</Button>}
            </div>
            <Dialog open={epDialogOpen} onOpenChange={setEpDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!selectedPool}><Plus className="w-4 h-4 ml-1" /> Proxy جديد</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>إضافة Proxy</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>البروتوكول</Label>
                      <Select value={epForm.protocol} onValueChange={v => setEpForm({ ...epForm, protocol: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="https">HTTPS</SelectItem>
                          <SelectItem value="socks5">SOCKS5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Label>Host *</Label><Input value={epForm.host} onChange={e => setEpForm({ ...epForm, host: e.target.value })} placeholder="proxy.example.com" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Port *</Label><Input type="number" value={epForm.port} onChange={e => setEpForm({ ...epForm, port: e.target.value })} /></div>
                    <div><Label>الدولة (ISO)</Label><Input value={epForm.geo_country} onChange={e => setEpForm({ ...epForm, geo_country: e.target.value.toUpperCase() })} placeholder="FR" maxLength={2} /></div>
                  </div>
                  <div><Label>Username</Label><Input value={epForm.username} onChange={e => setEpForm({ ...epForm, username: e.target.value })} /></div>
                  <div><Label>Password</Label><Input type="password" value={epForm.password} onChange={e => setEpForm({ ...epForm, password: e.target.value })} /></div>
                  <Button onClick={createEndpoint} className="w-full">إضافة</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {filteredEndpoints.map(e => {
              const successRate = e.success_count + e.failure_count > 0
                ? Math.round((e.success_count / (e.success_count + e.failure_count)) * 100)
                : null;
              return (
                <Card key={e.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Badge className={STATUS_COLORS[e.status]} variant="outline">{e.status}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm truncate">{e.protocol}://{e.host}:{e.port}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        {e.geo_country && <span>📍 {e.geo_country}</span>}
                        <span><CheckCircle2 className="w-3 h-3 inline ml-1" />{e.success_count}</span>
                        <span><XCircle className="w-3 h-3 inline ml-1" />{e.failure_count}</span>
                        {successRate !== null && <span>{successRate}% نجاح</span>}
                        {e.avg_latency_ms && <span>{e.avg_latency_ms}ms</span>}
                        {e.cooldown_until && new Date(e.cooldown_until) > new Date() && (
                          <span className="text-yellow-600"><ClockIcon className="w-3 h-3 inline ml-1" />cooldown</span>
                        )}
                      </div>
                      {e.last_error && <div className="text-xs text-destructive truncate mt-0.5">{e.last_error}</div>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => testProxy(e.id)}><Play className="w-3.5 h-3.5" /></Button>
                    {(e.status !== "active" || e.cooldown_until) && (
                      <Button size="sm" variant="outline" onClick={() => resetCooldown(e.id)}><RefreshCw className="w-3.5 h-3.5" /></Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => deleteEndpoint(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </CardContent>
                </Card>
              );
            })}
            {!filteredEndpoints.length && <p className="text-center text-muted-foreground py-8">لا توجد proxies.</p>}
          </div>
        </TabsContent>

        <TabsContent value="bulk">
          <Card>
            <CardHeader><CardTitle className="text-base">استيراد جماعي إلى: {selectedPool ? pools.find(p => p.id === selectedPool)?.name : <span className="text-destructive">اختر pool من التبويب الأول</span>}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">سطر واحد لكل proxy. الصيغ المدعومة:</p>
              <pre className="text-xs bg-muted p-2 rounded font-mono">host:port:user:pass{"\n"}http://user:pass@host:port{"\n"}socks5://user:pass@host:port</pre>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={10}
                className="w-full font-mono text-xs p-3 border rounded bg-background"
                placeholder="proxy1.example.com:8080:user:pass&#10;http://u:p@proxy2.example.com:3128"
              />
              <Button onClick={bulkImport} disabled={!selectedPool}>استيراد</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decodo">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Decodo Residential Rotating — إعداد سريع
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                ينشئ Pool باسم <code className="font-mono">decodo-residential</code> + endpoint رئيسي rotating
                و عدة sticky sessions (للمسح المتوازي). الافتراضي:
                <code className="font-mono"> gate.decodo.com:7000</code>.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Host *</Label>
                  <Input value={decodoForm.host} onChange={e => setDecodoForm({ ...decodoForm, host: e.target.value })} />
                </div>
                <div>
                  <Label>Port *</Label>
                  <Input type="number" value={decodoForm.port} onChange={e => setDecodoForm({ ...decodoForm, port: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Username *</Label>
                <Input value={decodoForm.username} onChange={e => setDecodoForm({ ...decodoForm, username: e.target.value })} placeholder="user-..." />
              </div>
              <div>
                <Label>Password *</Label>
                <Input type="password" value={decodoForm.password} onChange={e => setDecodoForm({ ...decodoForm, password: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>عدد sticky sessions</Label>
                  <Input type="number" min={1} max={50} value={decodoForm.sessions} onChange={e => setDecodoForm({ ...decodoForm, sessions: e.target.value })} />
                </div>
                <div>
                  <Label>الدولة (ISO, اختياري)</Label>
                  <Input maxLength={2} value={decodoForm.geo_country} onChange={e => setDecodoForm({ ...decodoForm, geo_country: e.target.value.toUpperCase() })} placeholder="FR" />
                </div>
              </div>
              <Button onClick={setupDecodo} className="w-full">
                <Zap className="w-4 h-4 ml-1" /> إعداد Decodo الآن
              </Button>
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                <p className="font-semibold mb-1">ملاحظات:</p>
                <ul className="list-disc pr-4 space-y-0.5">
                  <li>لتفعيل Decodo كـ pool افتراضي لكل فحوصات API: أضف secret باسم <code className="font-mono">PROXY_POOL_NAME</code> بقيمة <code className="font-mono">decodo-residential</code>.</li>
                  <li>عند فشل proxy، يتم تجربة proxy آخر تلقائياً (retry).</li>
                  <li>كل scan يسجّل proxy_id + latency في <code>proxy_health_log</code>.</li>
                  <li>لتشغيل Decodo داخل Playwright (vps-worker)، أضف <code className="font-mono">DECODO_PROXY=http://user:pass@gate.decodo.com:7000</code> في <code>.env</code> الخاص بالـ VPS.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Proxy Health Checker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                فحص شامل لكل proxy في الـ pool المحدّد:
                <span className="font-semibold"> الاتصال · المصادقة (Auth) · قياس السرعة · التحقق من تغيير الـ IP · الوصول إلى TLScontact</span>.
                النتائج: <Badge className="mx-1" variant="outline">Healthy</Badge>
                <Badge className="mx-1" variant="outline">Slow</Badge>
                <Badge className="mx-1" variant="outline">Blocked</Badge>
                <Badge className="mx-1" variant="outline">Dead</Badge>
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm">
                  Pool: <span className="font-semibold">{selectedPool ? pools.find(p => p.id === selectedPool)?.name : (pools[0]?.name || "—")}</span>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDisable}
                    onChange={e => setAutoDisable(e.target.checked)}
                    className="rounded border-input"
                  />
                  Auto-disable الفاشلة (بعد 5 محاولات)
                </label>
                <Button onClick={runHealthCheck} disabled={healthRunning} size="sm">
                  <Play className="w-3.5 h-3.5 ml-1" />
                  {healthRunning ? "جاري الفحص..." : "تشغيل الفحص"}
                </Button>
              </div>

              {healthSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{healthSummary.healthy}</div>
                    <div className="text-xs text-muted-foreground">Healthy</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{healthSummary.slow}</div>
                    <div className="text-xs text-muted-foreground">Slow</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{healthSummary.blocked}</div>
                    <div className="text-xs text-muted-foreground">Blocked</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">{healthSummary.dead}</div>
                    <div className="text-xs text-muted-foreground">Dead</div>
                  </CardContent></Card>
                </div>
              )}

              {healthDirectIp && (
                <div className="text-xs text-muted-foreground">
                  IP المباشر للسيرفر (بدون proxy): <code className="font-mono">{healthDirectIp}</code>
                </div>
              )}

              {healthResults.length > 0 && (
                <div className="space-y-2 pt-2">
                  {healthResults.map((r, i) => {
                    const style = HEALTH_STYLES[r.health] || HEALTH_STYLES.dead;
                    const Icon = style.icon;
                    return (
                      <Card key={r.proxy_id || i}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <Badge className={style.cls} variant="outline">
                            <Icon className="w-3 h-3 ml-1" />{style.label}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm truncate">{r.host}:{r.port}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                              <span>{r.latency_ms}ms</span>
                              {r.proxy_ip && <span>IP: <code className="font-mono">{r.proxy_ip}</code></span>}
                              <span>{r.auth_ok ? "✓ Auth" : "✗ Auth"}</span>
                              <span>{r.ip_changed ? "✓ IP changed" : "✗ IP same"}</span>
                              <span>{r.tls_ok ? "✓ TLScontact" : `✗ TLS (${r.tls_status || "—"})`}</span>
                            </div>
                            <div className="text-xs mt-0.5 text-muted-foreground">{r.reason}</div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}