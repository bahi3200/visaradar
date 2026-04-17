import { useEffect, useMemo, useState } from "react";
import { Send, Search, Users, MessageSquare, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TelegramUser {
  user_id: string;
  full_name: string | null;
  telegram_id: string;
  telegram_username: string | null;
  telegram_linked_at: string | null;
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

const AdminTelegramUsers = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetLabel, setTargetLabel] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, telegram_id, telegram_username, telegram_linked_at")
      .not("telegram_id", "is", null)
      .order("telegram_linked_at", { ascending: false, nullsFirst: false });

    if (error) {
      toast.error(error.message);
    } else {
      setUsers((data || []) as TelegramUser[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.telegram_id, u.telegram_username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [users, search]);

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
    setDialogOpen(true);
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
        body: { chat_ids: targetIds, message: text },
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

  return (
    <AdminLayout
      title="مستخدمو Telegram"
      subtitle="جميع الحسابات المرتبطة ببوت VisaRadar مع إمكانية إرسال رسائل مباشرة"
    >
      <div className="space-y-6" dir="rtl">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{selected.size}</p>
                <p className="text-xs text-muted-foreground">محدّد للإرسال</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{filtered.length}</p>
                <p className="text-xs text-muted-foreground">نتيجة البحث</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <CardTitle>القائمة</CardTitle>
              <div className="flex gap-2">
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
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                جارٍ التحميل...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <XCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                لا يوجد مستخدمون مرتبطون بـ Telegram
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
                      <th className="px-3 py-2 font-medium">تاريخ الربط</th>
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
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {formatDate(u.telegram_linked_at)}
                          </td>
                          <td className="px-3 py-3 text-left">
                            <Button size="sm" variant="outline" onClick={() => openSendOne(u)}>
                              <Send className="w-3.5 h-3.5 ml-1.5" />
                              رسالة
                            </Button>
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
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اكتب رسالتك هنا... يدعم HTML بسيط (<b>, <i>, <a>)"
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              💡 ستُرسل الرسالة عبر بوت VisaRadar مباشرة. تأكد من المحتوى قبل الإرسال.
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
    </AdminLayout>
  );
};

export default AdminTelegramUsers;
