import { useQuery } from "@tanstack/react-query";
import { History, Sparkles, XCircle, Clock, RefreshCw, Percent, Tag, Calendar, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  packageId: string;
}

type AuditRow = {
  id: string;
  action: string;
  changed_by: string | null;
  input_method: string | null;
  old_promo_price: number | null;
  new_promo_price: number | null;
  old_starts_at: string | null;
  new_starts_at: string | null;
  old_ends_at: string | null;
  new_ends_at: string | null;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  activated: {
    label: "تفعيل",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <Sparkles className="w-3 h-3" />,
  },
  deactivated: {
    label: "إلغاء",
    cls: "bg-destructive/15 text-destructive border-destructive/30",
    icon: <XCircle className="w-3 h-3" />,
  },
  scheduled: {
    label: "مجدول",
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <Clock className="w-3 h-3" />,
  },
  updated: {
    label: "تحديث",
    cls: "bg-accent/15 text-accent border-accent/30",
    icon: <RefreshCw className="w-3 h-3" />,
  },
};

const METHOD_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pct: {
    label: "عبر النسبة %",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <Percent className="w-3 h-3" />,
  },
  price: {
    label: "عبر السعر مباشرةً",
    cls: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    icon: <Tag className="w-3 h-3" />,
  },
  date: {
    label: "تعديل التواريخ",
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <Calendar className="w-3 h-3" />,
  },
  unknown: {
    label: "غير محدد",
    cls: "bg-muted text-muted-foreground border-border",
    icon: <HelpCircle className="w-3 h-3" />,
  },
};

const formatDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("ar-DZ", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const formatPrice = (p: number | null) =>
  p === null ? "—" : `${Number(p).toLocaleString("ar-DZ")} د.ج`;

/**
 * Promo change history for a single package. Admins only — RLS enforces
 * read access. Renders inline inside the package edit dialog.
 */
export default function PromoAuditLog({ packageId }: Props) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["promo-audit", packageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_promo_audit_log" as any)
        .select("*")
        .eq("package_id", packageId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  // Resolve user names for the changed_by ids
  const userIds = Array.from(new Set((rows ?? []).map((r) => r.changed_by).filter(Boolean))) as string[];
  const { data: profiles } = useQuery({
    queryKey: ["promo-audit-profiles", userIds.sort().join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => {
        map[p.user_id] = p.full_name || p.user_id.slice(0, 8);
      });
      return map;
    },
    enabled: userIds.length > 0,
  });

  return (
    <div className="border-t border-border/60 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">سجل تغييرات العرض الترويجي</h3>
        {rows && rows.length > 0 && (
          <span className="text-[10px] text-muted-foreground">({rows.length})</span>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground">جاري التحميل…</p>
      )}

      {!isLoading && (!rows || rows.length === 0) && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">
          لا توجد تغييرات مسجّلة بعد لهذه الباقة.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {rows.map((r) => {
            const meta = ACTION_META[r.action] ?? ACTION_META.updated;
            const userLabel = r.changed_by
              ? profiles?.[r.changed_by] ?? `${r.changed_by.slice(0, 8)}…`
              : "النظام";
            return (
              <div
                key={r.id}
                className="rounded-lg border border-border/50 bg-card/50 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-bold text-[10px] ${meta.cls}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                    {r.input_method && METHOD_META[r.input_method] && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${METHOD_META[r.input_method].cls}`}
                        title="طريقة الإدخال"
                      >
                        {METHOD_META[r.input_method].icon}
                        {METHOD_META[r.input_method].label}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground" dir="ltr">
                    {formatDate(r.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-foreground mb-1.5">
                  بواسطة: <span className="font-bold">{userLabel}</span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-muted/30 rounded p-1.5">
                    <p className="text-muted-foreground text-[10px] mb-0.5">السعر</p>
                    <p className="text-foreground" dir="ltr">
                      {formatPrice(r.old_promo_price)} → <span className="font-bold">{formatPrice(r.new_promo_price)}</span>
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded p-1.5">
                    <p className="text-muted-foreground text-[10px] mb-0.5">المدة</p>
                    <p className="text-foreground text-[10px]" dir="ltr">
                      {formatDate(r.new_starts_at)} → {formatDate(r.new_ends_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}