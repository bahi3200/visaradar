import AdminLayout from "@/components/AdminLayout";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Crown, Shield, Smartphone, Mail, Calendar, Search, Filter, X, Trash2, Ban, CheckCircle, MoreVertical, Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserInfo = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  roles: string[];
  active_devices: number;
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_linked_at: string | null;
  subscription: {
    status: string;
    package_name: string;
    is_golden: boolean;
    countries: string[];
    expires_at: string;
  } | null;
};

type FilterState = {
  role: "all" | "admin" | "moderator" | "user";
  subscription: "all" | "subscribed" | "golden" | "none";
  sort: "newest" | "oldest" | "name";
};

type PendingAction = {
  type: "delete" | "disable" | "enable" | "assign_moderator" | "remove_moderator";
  user: UserInfo;
} | null;

export default function ManageUsersPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [messageTarget, setMessageTarget] = useState<UserInfo | null>(null);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    role: "all",
    subscription: "all",
    sort: "newest",
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("list-users");
      if (res.error) throw res.error;
      setUsers(res.data || []);
    } catch (err: any) {
      toast.error("فشل في تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  }

  async function handleUserAction() {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke("manage-user", {
        body: { action: pendingAction.type, user_id: pendingAction.user.id },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      const messages: Record<string, string> = {
        delete: `تم حذف حساب ${pendingAction.user.full_name || pendingAction.user.email} بنجاح`,
        disable: `تم تعطيل حساب ${pendingAction.user.full_name || pendingAction.user.email} بنجاح`,
        enable: `تم تفعيل حساب ${pendingAction.user.full_name || pendingAction.user.email} بنجاح`,
        assign_moderator: `تم تعيين ${pendingAction.user.full_name || pendingAction.user.email} كمشرف`,
        remove_moderator: `تم إزالة صلاحيات المشرف من ${pendingAction.user.full_name || pendingAction.user.email}`,
      };
      toast.success(messages[pendingAction.type] || "تم تنفيذ العملية");
      await fetchUsers();
    } catch (err: any) {
      const errorMsg = err.message?.includes("own account")
        ? "لا يمكنك تعديل حسابك الخاص"
        : "فشل في تنفيذ العملية";
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  }

  async function sendMessage() {
    if (!messageTarget || !currentUser) return;
    if (!msgSubject.trim() || !msgBody.trim()) {
      toast.error("الرجاء إدخال الموضوع والرسالة");
      return;
    }
    setSending(true);
    try {
      const { data: inserted, error: insertError } = await supabase
        .from("contact_messages")
        .insert({
          user_id: messageTarget.id,
          full_name: messageTarget.full_name || messageTarget.email,
          email: messageTarget.email,
          subject: msgSubject.trim(),
          message: msgBody.trim(),
          status: "replied",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error: replyError } = await supabase
        .from("contact_message_replies")
        .insert({
          message_id: inserted.id,
          sender_role: "admin",
          sender_id: currentUser.id,
          body: msgBody.trim(),
        });
      if (replyError) throw replyError;

      toast.success(`تم إرسال الرسالة إلى ${messageTarget.full_name || messageTarget.email}`);
      setMessageTarget(null);
      setMsgSubject("");
      setMsgBody("");
    } catch (err: any) {
      toast.error(err.message || "فشل إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  const isUserBanned = (user: UserInfo) => {
    if (!user.banned_until) return false;
    return new Date(user.banned_until) > new Date();
  };

  const activeFilterCount = [
    filters.role !== "all",
    filters.subscription !== "all",
    filters.sort !== "newest",
  ].filter(Boolean).length;

  const filtered = users
    .filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.phone?.includes(search);
      const matchesRole =
        filters.role === "all" ||
        (filters.role === "admin" && u.roles.includes("admin")) ||
        (filters.role === "moderator" && u.roles.includes("moderator")) ||
        (filters.role === "user" && !u.roles.includes("admin") && !u.roles.includes("moderator"));
      const matchesSub =
        filters.subscription === "all" ||
        (filters.subscription === "subscribed" && u.subscription) ||
        (filters.subscription === "golden" && u.subscription?.is_golden) ||
        (filters.subscription === "none" && !u.subscription);
      return matchesSearch && matchesRole && matchesSub;
    })
    .sort((a, b) => {
      if (filters.sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (filters.sort === "name") return (a.full_name || "").localeCompare(b.full_name || "", "ar");
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const stats = {
    total: users.length,
    subscribed: users.filter((u) => u.subscription).length,
    admins: users.filter((u) => u.roles.includes("admin")).length,
    golden: users.filter((u) => u.subscription?.is_golden).length,
  };

  const resetFilters = () => setFilters({ role: "all", subscription: "all", sort: "newest" });

  const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
        active
          ? "bg-primary/15 text-primary border-primary/30 font-medium"
          : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/50"
      }`}
    >
      {label}
    </button>
  );

  const dialogConfig: Record<string, any> = {
    delete: {
      title: "حذف المستخدم نهائياً",
      description: (name: string) =>
        `هل أنت متأكد من حذف حساب "${name}"؟ سيتم حذف جميع بياناته وأجهزته واشتراكاته نهائياً. هذا الإجراء لا يمكن التراجع عنه.`,
      confirmLabel: "حذف نهائياً",
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
    },
    disable: {
      title: "تعطيل الحساب",
      description: (name: string) =>
        `هل تريد تعطيل حساب "${name}"؟ لن يتمكن المستخدم من تسجيل الدخول حتى يتم تفعيل حسابه مجدداً.`,
      confirmLabel: "تعطيل",
      confirmClass: "bg-orange-600 hover:bg-orange-700 text-white",
    },
    enable: {
      title: "تفعيل الحساب",
      description: (name: string) =>
        `هل تريد إعادة تفعيل حساب "${name}"؟ سيتمكن المستخدم من تسجيل الدخول مجدداً.`,
      confirmLabel: "تفعيل",
      confirmClass: "bg-green-600 hover:bg-green-700 text-white",
    },
    assign_moderator: {
      title: "تعيين كمشرف",
      description: (name: string) =>
        `هل تريد تعيين "${name}" كمشرف؟ سيتمكن من مراجعة طلبات الاشتراك واقتراح إجراءات تحت إشرافك.`,
      confirmLabel: "تعيين مشرف",
      confirmClass: "bg-blue-600 hover:bg-blue-700 text-white",
    },
    remove_moderator: {
      title: "إزالة صلاحيات المشرف",
      description: (name: string) =>
        `هل تريد إزالة صلاحيات المشرف من "${name}"؟ لن يتمكن من الوصول للوحة الإدارة.`,
      confirmLabel: "إزالة",
      confirmClass: "bg-orange-600 hover:bg-orange-700 text-white",
    },
  };

  return (
    <AdminLayout title="إدارة المستخدمين" subtitle="عرض جميع المستخدمين المسجلين وحالة اشتراكاتهم">
      <div>
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "إجمالي المستخدمين", value: stats.total, icon: Users, color: "text-primary" },
            { label: "مشتركين نشطين", value: stats.subscribed, icon: Crown, color: "text-green-400" },
            { label: "الباقة الذهبية", value: stats.golden, icon: Crown, color: "text-yellow-400" },
            { label: "المسؤولين", value: stats.admins, icon: Shield, color: "text-red-400" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="gradient-card rounded-xl border border-border/50 shadow-card p-4 text-center"
            >
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
              <p className="font-heading text-2xl font-black text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Search + Filter Toggle */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="بحث بالاسم، البريد أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-muted/50 border border-border/50 rounded-xl pr-10 pl-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm transition-all ${
              showFilters || activeFilterCount > 0
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="gradient-card rounded-xl border border-border/50 p-4 mb-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">تصفية النتائج</span>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs text-primary hover:underline">
                  إعادة تعيين
                </button>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">الصلاحية</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="الكل" active={filters.role === "all"} onClick={() => setFilters(f => ({ ...f, role: "all" }))} />
                <FilterChip label="مسؤول" active={filters.role === "admin"} onClick={() => setFilters(f => ({ ...f, role: "admin" }))} />
                <FilterChip label="مشرف" active={filters.role === "moderator"} onClick={() => setFilters(f => ({ ...f, role: "moderator" as any }))} />
                <FilterChip label="مستخدم عادي" active={filters.role === "user"} onClick={() => setFilters(f => ({ ...f, role: "user" }))} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">الاشتراك</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="الكل" active={filters.subscription === "all"} onClick={() => setFilters(f => ({ ...f, subscription: "all" }))} />
                <FilterChip label="مشترك" active={filters.subscription === "subscribed"} onClick={() => setFilters(f => ({ ...f, subscription: "subscribed" }))} />
                <FilterChip label="ذهبي" active={filters.subscription === "golden"} onClick={() => setFilters(f => ({ ...f, subscription: "golden" }))} />
                <FilterChip label="بدون اشتراك" active={filters.subscription === "none"} onClick={() => setFilters(f => ({ ...f, subscription: "none" }))} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">الترتيب</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="الأحدث" active={filters.sort === "newest"} onClick={() => setFilters(f => ({ ...f, sort: "newest" }))} />
                <FilterChip label="الأقدم" active={filters.sort === "oldest"} onClick={() => setFilters(f => ({ ...f, sort: "oldest" }))} />
                <FilterChip label="الاسم" active={filters.sort === "name"} onClick={() => setFilters(f => ({ ...f, sort: "name" }))} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Results count */}
        {(search || activeFilterCount > 0) && !loading && (
          <p className="text-xs text-muted-foreground mb-3">
            عرض {filtered.length} من {users.length} مستخدم
          </p>
        )}

        {/* Users List */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">جارٍ تحميل المستخدمين...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">لا يوجد مستخدمون مطابقون</p>
            {(search || activeFilterCount > 0) && (
              <button
                onClick={() => { setSearch(""); resetFilters(); }}
                className="mt-3 text-sm text-primary hover:underline"
              >
                مسح البحث والفلاتر
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((user, i) => {
              const banned = isUserBanned(user);
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`gradient-card rounded-xl border shadow-card p-4 ${
                    banned ? "border-orange-500/30 opacity-70" : "border-border/50"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        banned ? "bg-orange-500/20" : "gradient-primary"
                      }`}>
                        <span className={`font-bold text-sm ${banned ? "text-orange-400" : "text-primary-foreground"}`}>
                          {(user.full_name || user.email)?.[0]?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground text-sm truncate">
                            {user.full_name || "بدون اسم"}
                          </p>
                          {user.roles.includes("admin") && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                              مسؤول
                            </span>
                          )}
                          {user.roles.includes("moderator") && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                              مشرف
                            </span>
                          )}
                          {banned && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                              معطّل
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/30 px-2 py-1 rounded-lg">
                        <Smartphone className="w-3 h-3" />
                        <span>{user.active_devices}/2</span>
                      </div>
                      {!user.roles.includes("admin") && !user.roles.includes("moderator") && (
                        user.subscription ? (
                          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${
                            user.subscription.is_golden
                              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                              : "bg-green-500/10 text-green-400 border-green-500/20"
                          }`}>
                            <Crown className="w-3 h-3" />
                            <span>{user.subscription.package_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-lg bg-secondary/30 text-muted-foreground">
                            بدون اشتراك
                          </span>
                        )
                      )}
                      {user.telegram_linked_at ? (
                        <div
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          title={`مرتبط بـ Telegram${user.telegram_username ? ` (@${user.telegram_username})` : ""} منذ ${new Date(user.telegram_linked_at).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}`}
                        >
                          <Send className="w-3 h-3" />
                          <span>{new Date(user.telegram_linked_at).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                      ) : (
                        <span
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-secondary/30 text-muted-foreground border border-border/40"
                          title="غير مرتبط بـ Telegram"
                        >
                          <Send className="w-3 h-3 opacity-50" />
                          <span>—</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(user.created_at).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>

                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => {
                              setMessageTarget(user);
                              setMsgSubject("");
                              setMsgBody("");
                            }}
                            className="text-primary focus:text-primary gap-2"
                          >
                            <MessageCircle className="w-4 h-4" />
                            إرسال رسالة
                          </DropdownMenuItem>
                          {/* Moderator role toggle */}
                          {!user.roles.includes("admin") && (
                            user.roles.includes("moderator") ? (
                              <DropdownMenuItem
                                onClick={() => setPendingAction({ type: "remove_moderator", user })}
                                className="text-blue-400 focus:text-blue-400 gap-2"
                              >
                                <Shield className="w-4 h-4" />
                                إزالة صلاحيات المشرف
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setPendingAction({ type: "assign_moderator", user })}
                                className="text-blue-400 focus:text-blue-400 gap-2"
                              >
                                <Shield className="w-4 h-4" />
                                تعيين كمشرف
                              </DropdownMenuItem>
                            )
                          )}
                          {banned ? (
                            <DropdownMenuItem
                              onClick={() => setPendingAction({ type: "enable", user })}
                              className="text-green-400 focus:text-green-400 gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              تفعيل الحساب
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => setPendingAction({ type: "disable", user })}
                              className="text-orange-400 focus:text-orange-400 gap-2"
                            >
                              <Ban className="w-4 h-4" />
                              تعطيل الحساب
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setPendingAction({ type: "delete", user })}
                            className="text-red-400 focus:text-red-400 gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف نهائي
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {user.subscription && !user.roles.includes("admin") && !user.roles.includes("moderator") && (
                    <div className="mt-3 pt-3 border-t border-border/30 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>الدول: {user.subscription.countries.join("، ") || "—"}</span>
                      <span>•</span>
                      <span>ينتهي: {new Date(user.subscription.expires_at).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {pendingAction && dialogConfig[pendingAction.type].title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              {pendingAction && dialogConfig[pendingAction.type].description(
                pendingAction.user.full_name || pendingAction.user.email
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUserAction}
              disabled={actionLoading}
              className={pendingAction ? dialogConfig[pendingAction.type].confirmClass : ""}
            >
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                pendingAction && dialogConfig[pendingAction.type].confirmLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Message Dialog */}
      <Dialog
        open={!!messageTarget}
        onOpenChange={(open) => {
          if (!open) {
            setMessageTarget(null);
            setMsgSubject("");
            setMsgBody("");
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              مراسلة {messageTarget?.full_name || messageTarget?.email}
            </DialogTitle>
            <DialogDescription className="text-right">
              سيتم بدء محادثة جديدة. يمكن للمستخدم الرد عبر صفحة "رسائلي".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="الموضوع"
              value={msgSubject}
              onChange={(e) => setMsgSubject(e.target.value)}
              disabled={sending}
            />
            <Textarea
              placeholder="اكتب رسالتك..."
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={5}
              disabled={sending}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setMessageTarget(null)}
                disabled={sending}
              >
                إلغاء
              </Button>
              <Button onClick={sendMessage} disabled={sending}>
                {sending ? "جارٍ الإرسال..." : "إرسال"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
