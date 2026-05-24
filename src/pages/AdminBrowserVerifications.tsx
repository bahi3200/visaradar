import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Image as ImageIcon, RefreshCw, Globe, Calendar, MousePointer } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "vrw_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function AdminBrowserVerifications() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [screenshotOpen, setScreenshotOpen] = useState<string | null>(null);

  const { data: verifications, isLoading } = useQuery({
    queryKey: ["browser-verifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("browser_verifications")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: workers } = useQuery({
    queryKey: ["browser-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("browser_worker_tokens")
        .select("id, worker_name, is_active, last_used_at, total_requests, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createWorker = useMutation({
    mutationFn: async (name: string) => {
      const token = genToken();
      const hash = await sha256Hex(token);
      const { error } = await supabase
        .from("browser_worker_tokens")
        .insert({ worker_name: name, token_hash: hash });
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      setCreatedToken(token);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["browser-workers"] });
      toast.success("تم إنشاء الـ Worker — انسخ الـ token الآن، لن يظهر مرة أخرى!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteWorker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("browser_worker_tokens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["browser-workers"] });
      toast.success("تم الحذف");
    },
  });

  const openScreenshot = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("browser-screenshots")
      .createSignedUrl(path, 300);
    if (error || !data) return toast.error("فشل تحميل اللقطة");
    setScreenshotOpen(data.signedUrl);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      open: "bg-green-500/20 text-green-400 border-green-500/30",
      closed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
      error: "bg-red-500/20 text-red-400 border-red-500/30",
      unknown: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    };
    return <Badge variant="outline" className={map[s] || ""}>{s}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="h-7 w-7 text-primary" />
            Real Browser Verification
          </h1>
          <p className="text-muted-foreground mt-1">
            نتائج الفحص بمتصفح حقيقي (Playwright + Stealth) من VPS workers خارجية
          </p>
        </div>

        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">النتائج ({verifications?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="workers">VPS Workers ({workers?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="setup">دليل النشر</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["browser-verifications"] })}>
                <RefreshCw className="h-4 w-4 mr-1" /> تحديث
              </Button>
            </div>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
            ) : !verifications?.length ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                لم تصل أي نتائج بعد. شغّل worker على VPS وأرسل أول فحص.
              </CardContent></Card>
            ) : (
              verifications.map((v: any) => (
                <Card key={v.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-lg">{v.country_code}</span>
                        <Badge variant="secondary">{v.provider}</Badge>
                        {statusBadge(v.status)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.checked_at).toLocaleString("ar-DZ")}
                        </span>
                        {v.worker_id && <Badge variant="outline" className="text-xs">{v.worker_id}</Badge>}
                      </div>
                      {v.screenshot_path && (
                        <Button size="sm" variant="outline" onClick={() => openScreenshot(v.screenshot_path)}>
                          <ImageIcon className="h-4 w-4 mr-1" /> Screenshot
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <MousePointer className="h-4 w-4 text-muted-foreground" />
                        <span>أزرار حجز: <b>{v.booking_buttons_count}</b></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>تقويم: <b>{v.calendar_detected ? "نعم" : "لا"}</b></span>
                      </div>
                      <div>تواريخ متاحة: <b>{v.available_dates_count}</b></div>
                      <div className="text-muted-foreground">
                        {v.load_time_ms ? `${(v.load_time_ms / 1000).toFixed(1)}s` : "-"}
                      </div>
                    </div>
                    {v.no_appointments_text_found && (
                      <p className="text-xs text-yellow-400 mt-2">⚠️ نص "no appointments" موجود</p>
                    )}
                    {v.error_message && (
                      <p className="text-xs text-red-400 mt-2">❌ {v.error_message}</p>
                    )}
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-2 inline-block truncate max-w-full">
                      {v.url}
                    </a>
                    {Array.isArray(v.xhr_requests) && v.xhr_requests.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer text-muted-foreground">
                          XHR Requests ({v.xhr_requests.length})
                        </summary>
                        <pre className="text-[10px] mt-1 p-2 bg-muted rounded overflow-auto max-h-40">
                          {JSON.stringify(v.xhr_requests, null, 2)}
                        </pre>
                      </details>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="workers" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>إنشاء Worker جديد</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="worker-name">اسم الـ Worker</Label>
                    <Input id="worker-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="vps-paris-1" />
                  </div>
                  <Button className="self-end" disabled={!newName.trim() || createWorker.isPending} onClick={() => createWorker.mutate(newName.trim())}>
                    <Plus className="h-4 w-4 mr-1" /> إنشاء
                  </Button>
                </div>
                {createdToken && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                    <p className="text-sm font-semibold text-yellow-300 mb-2">
                      ⚠️ انسخ الـ token الآن — لن يظهر مرة أخرى:
                    </p>
                    <div className="flex gap-2">
                      <Input readOnly value={createdToken} className="font-mono text-xs" />
                      <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(createdToken); toast.success("نُسخ"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCreatedToken(null)}>إخفاء</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {workers?.map((w: any) => (
                <Card key={w.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{w.worker_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.total_requests || 0} طلب • آخر استخدام: {w.last_used_at ? new Date(w.last_used_at).toLocaleString("ar-DZ") : "أبداً"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={w.is_active ? "default" : "secondary"}>{w.is_active ? "نشط" : "موقوف"}</Badge>
                      <Button size="icon" variant="ghost" onClick={() => deleteWorker.mutate(w.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="setup">
            <Card>
              <CardHeader><CardTitle>دليل نشر VPS Worker</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm mb-3 text-muted-foreground">
                  انسخ مجلد <code className="bg-muted px-1 rounded">vps-worker/</code> من المشروع إلى VPS (DigitalOcean / Hetzner / Contabo — ~$6/شهر) ثم:
                </p>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">{`# 1. على VPS Ubuntu 22.04+
sudo apt update && sudo apt install -y nodejs npm
cd /opt && git clone <your-repo>
cd <repo>/vps-worker

# 2. تثبيت
npm install
npx playwright install --with-deps chromium

# 3. إعداد
cp .env.example .env
nano .env   # ألصق WORKER_TOKEN + TARGETS_JSON

# 4. تجربة
npm run once

# 5. تشغيل دائم (pm2)
sudo npm install -g pm2
pm2 start worker.js --name visaradar-worker
pm2 save && pm2 startup`}</pre>
                <p className="text-xs text-muted-foreground mt-3">
                  المزيد من التفاصيل في <code className="bg-muted px-1 rounded">vps-worker/README.md</code>
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!screenshotOpen} onOpenChange={() => setScreenshotOpen(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Screenshot</DialogTitle></DialogHeader>
            {screenshotOpen && <img src={screenshotOpen} alt="screenshot" className="w-full rounded" />}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}