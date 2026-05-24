import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Rewind, ChevronRight, Image as ImageIcon, Code2, Network, Activity, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AlertDecision {
  id: string;
  alert_id: string | null;
  created_at: string;
  country_code: string;
  provider: string;
  category: string | null;
  decision: string;
  confidence_score: number;
  threshold: number;
  api_score: number;
  dom_score: number;
  calendar_score: number;
  playwright_score: number;
  block_reason: string | null;
  layer_details: any;
}

const TIME_WINDOW_MIN = 10;

export default function AdminDetectionReplay() {
  const [selected, setSelected] = useState<AlertDecision | null>(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const { data: decisions, isLoading } = useQuery({
    queryKey: ["replay-decisions", decisionFilter],
    queryFn: async () => {
      let q = supabase
        .from("alert_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      if (decisionFilter !== "all") q = q.eq("decision", decisionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as AlertDecision[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!decisions) return [];
    const s = search.trim().toLowerCase();
    if (!s) return decisions;
    return decisions.filter(
      (d) =>
        d.country_code.toLowerCase().includes(s) ||
        d.provider.toLowerCase().includes(s) ||
        (d.category ?? "").toLowerCase().includes(s) ||
        (d.block_reason ?? "").toLowerCase().includes(s)
    );
  }, [decisions, search]);

  const { data: replay } = useQuery({
    queryKey: ["replay-detail", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const t = new Date(selected!.created_at).getTime();
      const from = new Date(t - TIME_WINDOW_MIN * 60_000).toISOString();
      const to = new Date(t + TIME_WINDOW_MIN * 60_000).toISOString();

      const [bv, ev] = await Promise.all([
        supabase
          .from("browser_verifications")
          .select("*")
          .eq("country_code", selected!.country_code)
          .eq("provider", selected!.provider)
          .gte("checked_at", from)
          .lte("checked_at", to)
          .order("checked_at", { ascending: false })
          .limit(5),
        supabase
          .from("detection_evidence")
          .select("*")
          .eq("country_code", selected!.country_code)
          .eq("provider", selected!.provider)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return {
        browser: bv.data ?? [],
        evidence: ev.data ?? [],
      };
    },
  });

  const openScreenshot = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("browser-screenshots")
      .createSignedUrl(path, 300);
    if (error || !data) return toast.error("فشل تحميل اللقطة");
    setScreenshotUrl(data.signedUrl);
  };

  const decisionColor = (d: string) => {
    if (d === "sent" || d === "allowed") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (d === "blocked" || d === "rejected") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  };

  const evidenceByType = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of replay?.evidence ?? []) {
      (map[e.evidence_type] ||= []).push(e);
    }
    return map;
  }, [replay]);

  const bv = replay?.browser?.[0];

  return (
    <AdminLayout title="Detection Replay">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Rewind className="h-7 w-7" /> Detection Replay System
          </h1>
          <p className="text-muted-foreground mt-1">
            إعادة عرض أي كشف سابق لتحليل false positives وتحسين منطق الكشف.
          </p>
        </div>

        <div className="grid lg:grid-cols-[400px_1fr] gap-4">
          {/* List */}
          <Card className="h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Detections ({filtered.length})
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    className="pl-8 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-1 flex-wrap mt-2">
                {["all", "sent", "blocked", "allowed", "rejected"].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={decisionFilter === d ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDecisionFilter(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="px-3 pb-3 space-y-1">
                  {isLoading && <p className="text-sm text-muted-foreground p-3">جاري التحميل...</p>}
                  {filtered.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelected(d)}
                      className={`w-full text-right p-3 rounded-md border transition hover:bg-accent/50 ${
                        selected?.id === d.id ? "bg-accent border-primary" : "border-border/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {d.country_code}
                          </Badge>
                          <span className="text-sm font-medium">{d.provider}</span>
                        </div>
                        <Badge variant="outline" className={decisionColor(d.decision)}>
                          {d.decision}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{d.category || "—"}</span>
                        <span className="font-mono">
                          {d.confidence_score}/{d.threshold}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: ar })}
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && !isLoading && (
                    <p className="text-sm text-muted-foreground p-3 text-center">لا توجد نتائج</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Detail */}
          <Card className="h-[calc(100vh-220px)] flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ChevronRight className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>اختر كشفاً من القائمة لإعادة عرضه</p>
                </div>
              </div>
            ) : (
              <>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {selected.provider} · {selected.country_code} ·{" "}
                        <span className="text-muted-foreground">{selected.category || "—"}</span>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(selected.created_at).toLocaleString("ar")}
                      </p>
                    </div>
                    <Badge variant="outline" className={decisionColor(selected.decision)}>
                      {selected.decision}
                    </Badge>
                  </div>

                  {/* Confidence signals */}
                  <div className="grid grid-cols-5 gap-2 mt-4">
                    {[
                      { label: "Final", value: selected.confidence_score, max: 100, accent: true },
                      { label: "API", value: selected.api_score, max: 100 },
                      { label: "DOM", value: selected.dom_score, max: 100 },
                      { label: "Calendar", value: selected.calendar_score, max: 100 },
                      { label: "Playwright", value: selected.playwright_score, max: 100 },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className={`rounded-md p-2 border ${
                          s.accent ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30"
                        }`}
                      >
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                        <div className="text-lg font-bold font-mono">{s.value ?? 0}</div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                          <div
                            className={`h-full ${s.accent ? "bg-primary" : "bg-foreground/40"}`}
                            style={{ width: `${Math.min(100, ((s.value ?? 0) / s.max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {selected.block_reason && (
                    <div className="text-sm text-red-400 mt-2">سبب الحظر: {selected.block_reason}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Threshold: {selected.threshold} · Alert ID: {selected.alert_id || "—"}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden p-0">
                  <Tabs defaultValue="screenshot" className="h-full flex flex-col">
                    <TabsList className="mx-4">
                      <TabsTrigger value="screenshot">
                        <ImageIcon className="h-4 w-4 mr-1" /> Screenshot
                      </TabsTrigger>
                      <TabsTrigger value="dom">
                        <Code2 className="h-4 w-4 mr-1" /> DOM
                      </TabsTrigger>
                      <TabsTrigger value="api">
                        <FileText className="h-4 w-4 mr-1" /> API
                      </TabsTrigger>
                      <TabsTrigger value="network">
                        <Network className="h-4 w-4 mr-1" /> Network
                      </TabsTrigger>
                      <TabsTrigger value="layers">
                        <Activity className="h-4 w-4 mr-1" /> Layers
                      </TabsTrigger>
                      <TabsTrigger value="evidence">Evidence</TabsTrigger>
                    </TabsList>

                    <ScrollArea className="flex-1">
                      <TabsContent value="screenshot" className="p-4 mt-0">
                        {bv?.screenshot_path ? (
                          <div className="space-y-2">
                            <Button size="sm" onClick={() => openScreenshot(bv.screenshot_path)}>
                              <ImageIcon className="h-4 w-4 mr-1" /> فتح اللقطة
                            </Button>
                            <p className="text-xs text-muted-foreground font-mono break-all">
                              {bv.screenshot_path}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            لا توجد لقطة شاشة محفوظة لهذا الكشف.
                          </p>
                        )}
                      </TabsContent>

                      <TabsContent value="dom" className="p-4 mt-0 space-y-3">
                        {bv ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <Metric label="Calendar Detected" value={bv.calendar_detected ? "✓" : "—"} />
                              <Metric label="Available Dates" value={bv.available_dates_count} />
                              <Metric label="Booking Buttons" value={bv.booking_buttons_count} />
                              <Metric label="No-Appt Text" value={bv.no_appointments_text_found ? "✓" : "—"} />
                              <Metric label="Load Time" value={`${bv.load_time_ms ?? 0}ms`} />
                              <Metric label="Status" value={bv.status} />
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-1">Page Snippet</div>
                              <pre className="text-xs bg-muted/30 p-3 rounded border border-border/50 whitespace-pre-wrap break-all max-h-96 overflow-auto">
                                {bv.page_text_snippet || "—"}
                              </pre>
                            </div>
                            {bv.url && (
                              <p className="text-xs text-muted-foreground break-all">URL: {bv.url}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">لا توجد بيانات DOM في النافذة الزمنية.</p>
                        )}
                      </TabsContent>

                      <TabsContent value="api" className="p-4 mt-0">
                        <EvidenceList items={evidenceByType["api"] || evidenceByType["api_response"] || []} />
                      </TabsContent>

                      <TabsContent value="network" className="p-4 mt-0 space-y-3">
                        {bv?.xhr_requests && Array.isArray(bv.xhr_requests) && bv.xhr_requests.length > 0 ? (
                          <div className="space-y-2">
                            {(bv.xhr_requests as any[]).map((x, i) => (
                              <div key={i} className="border border-border/50 rounded p-2 bg-muted/20 text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="font-mono">
                                    {x.method || "GET"}
                                  </Badge>
                                  <Badge variant="outline">{x.status || "?"}</Badge>
                                  <span className="font-mono break-all">{x.url}</span>
                                </div>
                                {x.response && (
                                  <pre className="text-xs whitespace-pre-wrap break-all opacity-70">
                                    {typeof x.response === "string"
                                      ? x.response.slice(0, 500)
                                      : JSON.stringify(x.response).slice(0, 500)}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">لا توجد طلبات شبكة مسجلة.</p>
                        )}
                      </TabsContent>

                      <TabsContent value="layers" className="p-4 mt-0">
                        <pre className="text-xs bg-muted/30 p-3 rounded border border-border/50 whitespace-pre-wrap break-all">
                          {JSON.stringify(selected.layer_details ?? {}, null, 2)}
                        </pre>
                      </TabsContent>

                      <TabsContent value="evidence" className="p-4 mt-0">
                        <EvidenceList items={replay?.evidence ?? []} />
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={!!screenshotUrl} onOpenChange={(o) => !o && setScreenshotUrl(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          {screenshotUrl && <img src={screenshotUrl} alt="Replay screenshot" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="border border-border/50 rounded p-2 bg-muted/20">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold">{String(value ?? "—")}</div>
    </div>
  );
}

function EvidenceList({ items }: { items: any[] }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">لا توجد أدلة مسجلة في هذه النافذة.</p>;
  return (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.id} className="border border-border/50 rounded p-3 bg-muted/20">
          <div className="flex items-center justify-between mb-1">
            <Badge variant="outline" className="font-mono text-xs">
              {e.evidence_type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(e.created_at).toLocaleTimeString("ar")}
            </span>
          </div>
          {e.url && <p className="text-xs text-muted-foreground break-all mb-1">{e.url}</p>}
          {e.content && (
            <pre className="text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto opacity-90">
              {e.content.slice(0, 1000)}
            </pre>
          )}
          {e.metadata && Object.keys(e.metadata).length > 0 && (
            <pre className="text-xs whitespace-pre-wrap break-all opacity-60 mt-1">
              {JSON.stringify(e.metadata, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}