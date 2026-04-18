import { useEffect, useMemo, useState } from "react";
import { Send, Search, Users, MessageSquare, CheckCircle2, XCircle, Loader2, Clock, ShieldOff, Zap, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { TELEGRAM_TEMPLATES, TELEGRAM_TEMPLATES_MAP } from "@/lib/telegramTemplates";
import { formatRelativeArabic } from "@/lib/relativeTime";

type SubStatus = "active" | "expired" | "none";

interface TelegramUser {
  user_id: string;
  full_name: string | null;
  telegram_id: string;
  telegram_username: string | null;
  telegram_linked_at: string | null;
  sub_status: SubStatus;
  sub_expires_at: string | null;
  last_message_at: string | null;
  last_message_status: string | null;
  last_message_text: string | null;
  last_message_error: string | null;
}

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-DZ", {
      timeZone: "Africa/Algiers",
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatDateOnly = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-DZ", {
      timeZone: "Africa/Algiers",
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
};

const SUB_FILTERS: { value: "all" | SubStatus; label: string }[] = [
  { value: "all", label: "كل الاشتراكات" },
  { value: "active", label: "اشتراك نشط" },
  { value: "expired", label: "اشتراك منتهٍ" },
  { value: "none", label: "بلا اشتراك" },
];

type ActivityFilter = "all" | "inactive_7d" | "inactive_30d" | "never";
const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "كل النشاطات" },
  { value: "inactive_7d", label: "بدون رسالة منذ 7 أيام" },
  { value: "inactive_30d", label: "بدون رسالة منذ 30 يوم" },
  { value: "never", label: "لم يتلقَّ أي رسالة" },
];

const AdminTelegramUsers = () => {
  const { settings } = useSiteSettings();
  const quickTestMessage = (settings?.telegram_quick_test_message || "مرحباً من VisaRadar 👋").trim();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<"all" | SubStatus>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [staleSort, setStaleSort] = useState<"none" | "stalest" | "freshest">("none");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetLabel, setTargetLabel] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [templateId, setTemplateId] = useState<string>("custom");
  const [quickSendingId, setQuickSendingId] = useState<string | null>(null);
  const [msgDetailUser, setMsgDetailUser] = useState<TelegramUser | null>(null);

  const handleQuickTest = async (u: TelegramUser) => {
    setQuickSendingId(u.telegram_id);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-send-message", {
        body: {
          chat_ids: [u.telegram_id],
          message: quickTestMessage,
          template_id: null,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "فشل الإرسال");
        return;
      }
      const sent = data?.sent ?? 0;
      if (sent > 0) {
        toast.success(`تم إرسال رسالة الاختبار إلى ${u.full_name || u.telegram_id}`);
        // Optimistically update last message column
        setUsers((prev) =>
          prev.map((x) =>
            x.telegram_id === u.telegram_id
              ? {
                  ...x,
                  last_message_at: new Date().toISOString(),
                  last_message_status: "sent",
                  last_message_text: quickTestMessage,
                  last_message_error: null,
                }
              : x
          )
        );
      } else {
        toast.error("لم يتم الإرسال");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الإرسال");
    } finally {
      setQuickSendingId(null);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);

    const [profilesRes, subsRes, msgsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, telegram_id, telegram_username, telegram_linked_at")
        .not("telegram_id", "is", null)
        .order("telegram_linked_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("subscriptions")
        .select("user_id, status, expires_at"),
      supabase
        .from("telegram_admin_messages")
        .select("chat_id, status, created_at, message, error_message")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    if (profilesRes.error) {
      toast.error(profilesRes.error.message);
      setLoading(false);
      return;
    }
    if (subsRes.error) {
      toast.error(subsRes.error.message);
      setLoading(false);
      return;
    }

    // Pick the latest-expiring sub per user
    const latestByUser = new Map<string, { status: string; expires_at: string }>();
    for (const s of subsRes.data || []) {
      if (!s.user_id || !s.expires_at) continue;
      const prev = latestByUser.get(s.user_id);
      if (!prev || new Date(s.expires_at) > new Date(prev.expires_at)) {
        latestByUser.set(s.user_id, { status: s.status, expires_at: s.expires_at });
      }
    }

    // Pick latest admin message per chat_id
    const latestMsgByChat = new Map<string, { status: string; created_at: string; message: string; error_message: string | null }>();
    for (const m of msgsRes.data || []) {
      if (!m.chat_id) continue;
      if (!latestMsgByChat.has(m.chat_id)) {
        latestMsgByChat.set(m.chat_id, {
          status: m.status,
          created_at: m.created_at,
          message: m.message,
          error_message: m.error_message,
        });
      }
    }

    const now = Date.now();
    const merged: TelegramUser[] = (profilesRes.data || []).map((p) => {
      const sub = latestByUser.get(p.user_id);
      let sub_status: SubStatus = "none";
      let sub_expires_at: string | null = null;
      if (sub) {
        sub_expires_at = sub.expires_at;
        const isLive = sub.status === "active" && new Date(sub.expires_at).getTime() > now;
        sub_status = isLive ? "active" : "expired";
      }
      const lastMsg = latestMsgByChat.get(p.telegram_id as string);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        telegram_id: p.telegram_id as string,
        telegram_username: p.telegram_username,
        telegram_linked_at: p.telegram_linked_at,
        sub_status,
        sub_expires_at,
        last_message_at: lastMsg?.created_at || null,
        last_message_status: lastMsg?.status || null,
        last_message_text: lastMsg?.message || null,
        last_message_error: lastMsg?.error_message || null,
      };
    });

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const result = users.filter((u) => {
      if (subFilter !== "all" && u.sub_status !== subFilter) return false;

      if (activityFilter !== "all") {
        if (activityFilter === "never") {
          if (u.last_message_at) return false;
        } else {
          const days = activityFilter === "inactive_7d" ? 7 : 30;
          // never received → counts as inactive
          if (u.last_message_at) {
            const ageMs = now - new Date(u.last_message_at).getTime();
            if (ageMs < days * DAY) return false;
          }
        }
      }

      if (!q) return true;
      return [u.full_name, u.telegram_id, u.telegram_username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    if (staleSort !== "none") {
      // "never received" treated as oldest (Infinity age)
      const ageOf = (u: TelegramUser) =>
        u.last_message_at ? now - new Date(u.last_message_at).getTime() : Number.POSITIVE_INFINITY;
      result.sort((a, b) =>
        staleSort === "stalest" ? ageOf(b) - ageOf(a) : ageOf(a) - ageOf(b)
      );
    }
    return result;
  }, [users, search, subFilter, activityFilter, staleSort]);

  const counts = useMemo(() => {
    let active = 0, expired = 0, none = 0;
    for (const u of users) {
      if (u.sub_status === "active") active++;
      else if (u.sub_status === "expired") expired++;
      else none++;
    }
    return { active, expired, none };
  }, [users]);

  const staleCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.filter((u) => !u.last_message_at || new Date(u.last_message_at).getTime() < cutoff).length;
  }, [users]);

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(filtered.map((u) => u.telegram_id)));
    else setSelected(new Set());
  };

  const toggleOne = (chatId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(chatId);
    else next.delete(chatId);
    setSelected(next);
  };

  const openSendOne = (u: TelegramUser) => {
    setTargetIds([u.telegram_id]);
    setTargetLabel(u.full_name || u.telegram_username || u.telegram_id);
    setMessage("");
    setTemplateId("custom");
    setDialogOpen(true);
  };

  const openSendBulk = () => {
    if (selected.size === 0) {
      toast.error("اختر مستخدماً واحداً على الأقل");
      return;
    }
    setTargetIds(Array.from(selected));
    setTargetLabel(`${selected.size} مستخدم`);
    setMessage("");
    setTemplateId("custom");
    setDialogOpen(true);
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "custom") {
      setMessage("");
      return;
    }
    const tpl = TELEGRAM_TEMPLATES_MAP[id];
    if (!tpl) return;
    // For single recipient, replace {{name}} with their label.
    let body = tpl.body;
    if (targetIds.length === 1 && targetLabel && !targetLabel.match(/^\d+\s/)) {
      body = body.replace(/\{\{name\}\}/g, targetLabel);
    }
    setMessage(body);
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text) {
      toast.error("اكتب نص الرسالة أولاً");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-send-message", {
        body: {
          chat_ids: targetIds,
          message: text,
          template_id: templateId === "custom" ? null : templateId,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "فشل الإرسال");
        return;
      }
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      if (failed === 0) {
        toast.success(`تم إرسال الرسالة إلى ${sent} مستخدم`);
      } else {
        toast.warning(`نجح: ${sent} • فشل: ${failed}`);
      }
      setDialogOpen(false);
      setMessage("");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.telegram_id));

  const renderSubBadge = (u: TelegramUser) => {
    if (u.sub_status === "active") {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">
          <CheckCircle2 className="w-3 h-3 ml-1" />
          نشط
          {u.sub_expires_at && (
            <span className="mr-1 opacity-70">• ينتهي {formatDateOnly(u.sub_expires_at)}</span>
          )}
        </Badge>
      );
    }
    if (u.sub_status === "expired") {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-500/40">
          <Clock className="w-3 h-3 ml-1" />
          منتهٍ
          {u.sub_expires_at && (
            <span className="mr-1 opacity-70">• {formatDateOnly(u.sub_expires_at)}</span>
          )}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <ShieldOff className="w-3 h-3 ml-1" />
        لا يوجد
      </Badge>
    );
  };

  return (
    <AdminLayout
      title="مستخدمو Telegram"
      subtitle="جميع الحسابات المرتبطة ببوت VisaRadar مع إمكانية إرسال رسائل مباشرة"
    >
      <div className="space-y-6" dir="rtl">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">مستخدم مرتبط</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.active}</p>
                <p className="text-xs text-muted-foreground">اشتراك نشط</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.expired}</p>
                <p className="text-xs text-muted-foreground">اشتراك منتهٍ</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <ShieldOff className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.none}</p>
                <p className="text-xs text-muted-foreground">بلا اشتراك</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2">
                القائمة
                <Badge variant="secondary" className="font-normal">
                  <MessageSquare className="w-3 h-3 ml-1" />
                  {filtered.length} نتيجة
                </Badge>
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={subFilter} onValueChange={(v) => setSubFilter(v as "all" | SubStatus)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as ActivityFilter)}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث بالاسم أو chat_id..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
                <Button onClick={openSendBulk} disabled={selected.size === 0}>
                  <Send className="w-4 h-4 ml-2" />
                  إرسال للمحدّدين ({selected.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activityFilter !== "all" && filtered.length > 0 && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong className="text-amber-700">{filtered.length}</strong> مستخدم مطابق لفلتر النشاط الحالي
                  </span>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    const ids = filtered.map((u) => u.telegram_id);
                    setSelected(new Set(ids));
                    setTargetIds(ids);
                    setTargetLabel(`${ids.length} مستخدم غير نشط`);
                    setMessage("");
                    setTemplateId("custom");
                    setDialogOpen(true);
                  }}
                >
                  <Send className="w-4 h-4 ml-2" />
                  إرسال رسالة تذكير لكل غير النشطين
                </Button>
              </div>
            )}
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                جارٍ التحميل...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <XCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                لا توجد نتائج مطابقة للفلاتر الحالية
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-right text-muted-foreground">
                      <th className="px-3 py-2 w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(c) => toggleAll(Boolean(c))}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">الاسم</th>
                      <th className="px-3 py-2 font-medium">Username</th>
                      <th className="px-3 py-2 font-medium">chat_id</th>
                      <th className="px-3 py-2 font-medium">الاشتراك</th>
                      <th className="px-3 py-2 font-medium">تاريخ الربط</th>
                      <th className="px-3 py-2 font-medium">آخر رسالة</th>
                      <th className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          منذ
                          {staleCount > 0 && (
                            <Badge
                              variant="outline"
                              className="text-amber-600 border-amber-500/40 bg-amber-500/10 h-5 px-1.5 text-[10px] font-bold"
                              title={`${staleCount} مستخدم لم يستلم رسالة منذ أكثر من 7 أيام`}
                            >
                              {staleCount}
                            </Badge>
                          )}
                        </span>
                      </th>
                      <th className="px-3 py-2 font-medium text-left">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const checked = selected.has(u.telegram_id);
                      return (
                        <tr key={u.user_id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => toggleOne(u.telegram_id, Boolean(c))}
                            />
                          </td>
                          <td className="px-3 py-3 font-medium">
                            {u.full_name || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3" dir="ltr">
                            {u.telegram_username ? (
                              <Badge variant="secondary" className="font-mono">@{u.telegram_username}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs" dir="ltr">{u.telegram_id}</td>
                          <td className="px-3 py-3">{renderSubBadge(u)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {formatDate(u.telegram_linked_at)}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {u.last_message_at ? (
                              <button
                                type="button"
                                onClick={() => setMsgDetailUser(u)}
                                className="flex flex-col gap-0.5 text-right rounded-md p-1 -m-1 hover:bg-muted/60 transition-colors group cursor-pointer"
                                title="عرض تفاصيل آخر رسالة"
                              >
                                <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1">
                                  <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  {formatDate(u.last_message_at)}
                                </span>
                                {u.last_message_status === "sent" ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15 w-fit">
                                    <CheckCircle2 className="w-3 h-3 ml-1" />
                                    نجحت
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-destructive border-destructive/40 w-fit">
                                    <XCircle className="w-3 h-3 ml-1" />
                                    {u.last_message_status === "failed" ? "فشلت" : u.last_message_status}
                                  </Badge>
                                )}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">
                            {u.last_message_at ? (() => {
                              const ageDays = (Date.now() - new Date(u.last_message_at).getTime()) / (24 * 60 * 60 * 1000);
                              const isStale = ageDays >= 7;
                              return (
                                <span
                                  className={isStale ? "text-amber-600 font-medium" : "text-muted-foreground"}
                                  title={formatDate(u.last_message_at)}
                                >
                                  {formatRelativeArabic(u.last_message_at).replace(/^قبل\s/, "منذ ")}
                                </span>
                              );
                            })() : (
                              <span className="text-destructive/80 font-medium" title="لم يتلقَّ أي رسالة">
                                لم يستلم بعد
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-left">
                            <div className="flex gap-1.5 justify-end">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleQuickTest(u)}
                                disabled={quickSendingId === u.telegram_id}
                                title="إرسال رسالة اختبار سريعة"
                              >
                                {quickSendingId === u.telegram_id ? (
                                  <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                                ) : (
                                  <Zap className="w-3.5 h-3.5 ml-1.5" />
                                )}
                                اختبار
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openSendOne(u)}>
                                <Send className="w-3.5 h-3.5 ml-1.5" />
                                رسالة
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إرسال رسالة Telegram</DialogTitle>
            <DialogDescription>
              المستلم: <span className="font-semibold text-foreground">{targetLabel}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">قالب جاهز</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">✍️ رسالة مخصّصة (فارغة)</SelectItem>
                  {TELEGRAM_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templateId !== "custom" && TELEGRAM_TEMPLATES_MAP[templateId] && (
                <p className="text-xs text-muted-foreground">
                  {TELEGRAM_TEMPLATES_MAP[templateId].description}
                </p>
              )}
            </div>
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (templateId !== "custom") setTemplateId("custom");
              }}
              placeholder="اكتب رسالتك هنا... يدعم HTML بسيط (<b>, <i>, <a>)"
              rows={9}
              className="resize-none font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              💡 ستُرسل الرسالة عبر بوت VisaRadar مباشرة. عدّل النص قبل الإرسال إن لزم.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={sending}>
              إلغاء
            </Button>
            <Button onClick={handleSend} disabled={sending || !message.trim()}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جارٍ الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 ml-2" />
                  إرسال
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last message detail dialog */}
      <Dialog open={!!msgDetailUser} onOpenChange={(o) => !o && setMsgDetailUser(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              تفاصيل آخر رسالة
            </DialogTitle>
            <DialogDescription>
              المستلم:{" "}
              <span className="font-semibold text-foreground">
                {msgDetailUser?.full_name || msgDetailUser?.telegram_username || msgDetailUser?.telegram_id}
              </span>
            </DialogDescription>
          </DialogHeader>
          {msgDetailUser && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {msgDetailUser.last_message_status === "sent" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    تم الإرسال بنجاح
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/40">
                    <XCircle className="w-3 h-3 ml-1" />
                    {msgDetailUser.last_message_status === "failed"
                      ? "فشل الإرسال"
                      : msgDetailUser.last_message_status || "—"}
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  <Clock className="w-3 h-3 inline ml-1" />
                  {formatDate(msgDetailUser.last_message_at)}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">نص الرسالة</label>
                <div className="rounded-md border bg-muted/30 p-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                  {msgDetailUser.last_message_text || (
                    <span className="text-muted-foreground italic">لا يوجد محتوى</span>
                  )}
                </div>
              </div>

              {msgDetailUser.last_message_error && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-destructive">رسالة الخطأ</label>
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs font-mono text-destructive whitespace-pre-wrap">
                    {msgDetailUser.last_message_error}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t">
                <div>
                  <p className="text-muted-foreground mb-0.5">chat_id</p>
                  <p className="font-mono" dir="ltr">{msgDetailUser.telegram_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Username</p>
                  <p className="font-mono" dir="ltr">
                    {msgDetailUser.telegram_username ? `@${msgDetailUser.telegram_username}` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgDetailUser(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminTelegramUsers;
