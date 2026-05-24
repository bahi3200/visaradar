import { useEffect, useState } from "react";
import { Plus, Trash2, Power, Radio, Search, Loader2, ExternalLink, MessageSquare } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Source {
  id: string;
  chat_id: string;
  title: string;
  username: string | null;
  chat_type: string;
  country_code: string | null;
  category: string | null;
  keywords: string[];
  is_active: boolean;
  auto_broadcast: boolean;
  notes: string | null;
  last_post_at: string | null;
  posts_captured: number;
  created_at: string;
}

interface Post {
  id: string;
  source_id: string | null;
  chat_id: string;
  message_id: number;
  text: string | null;
  matched_keywords: string[];
  detected_country: string | null;
  detected_category: string | null;
  is_signal: boolean;
  broadcasted: boolean;
  posted_at: string;
}

const COUNTRIES = [
  { code: "IT", name: "إيطاليا 🇮🇹" },
  { code: "FR", name: "فرنسا 🇫🇷" },
  { code: "ES", name: "إسبانيا 🇪🇸" },
  { code: "DE", name: "ألمانيا 🇩🇪" },
  { code: "GR", name: "اليونان 🇬🇷" },
  { code: "PT", name: "البرتغال 🇵🇹" },
  { code: "NL", name: "هولندا 🇳🇱" },
  { code: "BE", name: "بلجيكا 🇧🇪" },
];

const CATEGORIES = [
  { v: "all", n: "كل الفئات" },
  { v: "study", n: "دراسة" },
  { v: "tourism", n: "سياحة" },
  { v: "business", n: "أعمال" },
  { v: "work", n: "عمل" },
  { v: "family", n: "زيارة عائلية" },
];

const DEFAULT_KEYWORDS = "موعد,مواعيد,rdv,rendez-vous,appointment,slot,disponible,available,فتح,opened,open";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-DZ", {
      timeZone: "Africa/Algiers",
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

export default function AdminTelegramSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [chatId, setChatId] = useState("");
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [chatType, setChatType] = useState("channel");
  const [countryCode, setCountryCode] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [autoBroadcast, setAutoBroadcast] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSources = async () => {
    const { data, error } = await supabase
      .from("monitored_telegram_sources" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("فشل تحميل المصادر: " + error.message); return; }
    setSources((data as any) || []);
  };

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from("telegram_channel_posts" as any)
      .select("*")
      .order("posted_at", { ascending: false })
      .limit(100);
    if (error) { toast.error("فشل تحميل المنشورات: " + error.message); return; }
    setPosts((data as any) || []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadSources(), loadPosts()]);
      setLoading(false);
    })();
  }, []);

  const resetForm = () => {
    setChatId(""); setTitle(""); setUsername(""); setChatType("channel");
    setCountryCode(""); setCategory("all"); setKeywords(DEFAULT_KEYWORDS);
    setAutoBroadcast(false); setNotes("");
  };

  const handleAdd = async () => {
    if (!chatId.trim() || !title.trim()) {
      toast.error("معرّف الشات والاسم مطلوبان");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const kwArr = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const { error } = await supabase.from("monitored_telegram_sources" as any).insert({
      chat_id: chatId.trim(),
      title: title.trim(),
      username: username.trim() || null,
      chat_type: chatType,
      country_code: countryCode || null,
      category: category || null,
      keywords: kwArr,
      auto_broadcast: autoBroadcast,
      notes: notes.trim() || null,
      added_by: userData.user?.id || null,
    });
    setSaving(false);
    if (error) { toast.error("فشل الإضافة: " + error.message); return; }
    toast.success("تمت إضافة المصدر");
    setDialogOpen(false);
    resetForm();
    loadSources();
  };

  const toggleActive = async (s: Source) => {
    const { error } = await supabase
      .from("monitored_telegram_sources" as any)
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    loadSources();
  };

  const toggleAutoBroadcast = async (s: Source) => {
    const { error } = await supabase
      .from("monitored_telegram_sources" as any)
      .update({ auto_broadcast: !s.auto_broadcast })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    loadSources();
  };

  const handleDelete = async (s: Source) => {
    if (!confirm(`حذف المصدر "${s.title}"؟`)) return;
    const { error } = await supabase
      .from("monitored_telegram_sources" as any)
      .delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    loadSources();
  };

  const filtered = sources.filter((s) =>
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.chat_id.includes(search) ||
    (s.username || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="قنوات Telegram المراقَبة">
      <div className="container py-8 space-y-6" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
              <Radio className="h-6 w-6 text-accent" />
              قنوات Telegram المراقَبة
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              أضف قنوات/مجموعات Telegram موثوقة. عند نشرها لخبر فتح موعد، يلتقطه البوت ويبثّه تلقائياً للمشتركين.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-2" />إضافة مصدر</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة قناة/مجموعة Telegram</DialogTitle>
                <DialogDescription>
                  يجب إضافة البوت كعضو (أو مشرف للقنوات) في المصدر أولاً.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>معرّف الشات (chat_id) *</Label>
                  <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" />
                  <p className="text-xs text-muted-foreground mt-1">
                    تحصل عليه بإرسال رسالة في المجموعة ثم زيارة getUpdates، أو عبر @userinfobot.
                  </p>
                </div>
                <div>
                  <Label>اسم القناة *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مواعيد فيزا إيطاليا" />
                </div>
                <div>
                  <Label>اسم المستخدم (اختياري)</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@channel_name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>النوع</Label>
                    <Select value={chatType} onValueChange={setChatType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="channel">قناة</SelectItem>
                        <SelectItem value="group">مجموعة</SelectItem>
                        <SelectItem value="supergroup">مجموعة كبرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>الدولة</Label>
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>الفئة</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.v} value={c.v}>{c.n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الكلمات المفتاحية (مفصولة بفواصل)</Label>
                  <Textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={2} />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label className="font-semibold">بثّ تلقائي للمشتركين</Label>
                    <p className="text-xs text-muted-foreground">إرسال فوري عند مطابقة كلمة مفتاحية. فعِّل فقط للمصادر الموثوقة جداً.</p>
                  </div>
                  <Switch checked={autoBroadcast} onCheckedChange={setAutoBroadcast} />
                </div>
                <div>
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                  إضافة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="sources">
          <TabsList>
            <TabsTrigger value="sources">المصادر ({sources.length})</TabsTrigger>
            <TabsTrigger value="posts">المنشورات الملتقطة ({posts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو المعرّف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    لا توجد مصادر بعد. أضف قناة/مجموعة Telegram موثوقة.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>القناة</TableHead>
                        <TableHead>الدولة</TableHead>
                        <TableHead>الفئة</TableHead>
                        <TableHead>تفعيل</TableHead>
                        <TableHead>بث تلقائي</TableHead>
                        <TableHead>منشورات</TableHead>
                        <TableHead>آخر منشور</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium">{s.title}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <code>{s.chat_id}</code>
                              {s.username && (
                                <a
                                  href={`https://t.me/${s.username.replace(/^@/, "")}`}
                                  target="_blank" rel="noreferrer"
                                  className="hover:text-accent flex items-center gap-1"
                                >
                                  {s.username} <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{s.country_code || "—"}</TableCell>
                          <TableCell>{s.category || "—"}</TableCell>
                          <TableCell>
                            <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                          </TableCell>
                          <TableCell>
                            <Switch checked={s.auto_broadcast} onCheckedChange={() => toggleAutoBroadcast(s)} />
                          </TableCell>
                          <TableCell>{s.posts_captured}</TableCell>
                          <TableCell className="text-xs">{formatDate(s.last_post_at)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(s)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="posts" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : posts.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    لا توجد منشورات ملتقطة بعد. تأكد من إضافة البوت كعضو في القنوات/المجموعات.
                  </div>
                ) : (
                  <div className="divide-y">
                    {posts.map((p) => (
                      <div key={p.id} className="p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.is_signal && <Badge className="bg-success">إشارة موعد</Badge>}
                          {p.broadcasted && <Badge variant="secondary">تم البث</Badge>}
                          {p.detected_country && <Badge variant="outline">{p.detected_country}</Badge>}
                          {p.matched_keywords.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              مطابقات: {p.matched_keywords.join("، ")}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground mr-auto">{formatDate(p.posted_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{p.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              كيف يعمل؟
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>1. أضف بوت VisaRadar كـ <b>مشرف</b> في القناة (أو كعضو في المجموعة).</p>
            <p>2. سجّل المصدر هنا بالـ chat_id (يبدأ عادة بـ <code>-100</code> للقنوات).</p>
            <p>3. شغّل البوت من <Badge variant="outline">/dashboard/telegram-link-log</Badge> أو انتظر التشغيل التلقائي.</p>
            <p>4. حين يطابق منشور كلمة مفتاحية وكان البث التلقائي مفعّلاً، يصل التنبيه لكل المشتركين في تلك الدولة فوراً.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}