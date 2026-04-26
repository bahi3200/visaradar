import { Check, X, Crown } from "lucide-react";
import { getPromoState } from "@/lib/promoUtils";

interface Package {
  name_ar: string;
  price: number | null;
  duration_months: number;
  is_golden: boolean;
  max_countries: number;
  service_type: string;
  promo_price?: number | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
}

interface Props {
  packages: Package[];
}

const features = [
  { label: "المدة", getValue: (p: Package) => `${p.duration_months} ${p.duration_months > 10 ? "شهر" : "أشهر"}` },
  {
    label: "السعر",
    getValue: (p: Package) => {
      const promo = getPromoState({
        price: p.price,
        promo_price: p.promo_price ?? null,
        promo_starts_at: p.promo_starts_at ?? null,
        promo_ends_at: p.promo_ends_at ?? null,
      });
      if (!p.price) return "—";
      if (promo.isPromo) {
        return `${promo.effectivePrice!.toLocaleString()} د.ج (بدلاً من ${promo.originalPrice!.toLocaleString()})`;
      }
      return `${p.price.toLocaleString()} د.ج`;
    },
  },
  { label: "عدد الدول", getValue: (p: Package) => p.max_countries >= 99 ? "جميع الدول" : `${p.max_countries}` },
  { label: "تنبيهات الفيزا", check: (p: Package) => p.service_type !== "jobs" },
  { label: "عقود العمل", check: (p: Package) => p.service_type === "jobs" || p.service_type === "both" },
  { label: "تنبيهات تليغرام", check: () => true },
  { label: "أولوية في التنبيهات", check: (p: Package) => p.duration_months >= 6 },
  { label: "دعم فني مخصص 24/7", check: (p: Package) => p.is_golden },
  { label: "خصم 50% على التجديد", check: (p: Package) => p.duration_months >= 12 },
];

export default function PackageComparisonTable({ packages }: Props) {
  const sorted = [...packages].sort((a, b) => (a.is_golden ? 1 : 0) - (b.is_golden ? 1 : 0) || a.duration_months - b.duration_months);

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-separate border-spacing-0 min-w-[600px]">
        <thead>
          <tr>
            <th className="sticky right-0 bg-background z-10 text-right p-3 text-muted-foreground font-medium border-b border-border/30">
              المميزات
            </th>
            {sorted.map((pkg) => (
              <th
                key={pkg.name_ar}
                className={`p-3 text-center font-bold border-b ${
                  pkg.is_golden
                    ? "text-accent border-accent/30 bg-accent/5"
                    : "text-foreground border-border/30"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {pkg.is_golden && <Crown className="w-4 h-4" />}
                  {pkg.name_ar}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feat, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
              <td className="sticky right-0 bg-inherit z-10 p-3 text-right text-muted-foreground font-medium border-b border-border/10">
                {feat.label}
              </td>
              {sorted.map((pkg) => (
                <td
                  key={pkg.name_ar}
                  className={`p-3 text-center border-b border-border/10 ${
                    pkg.is_golden ? "bg-accent/5" : ""
                  }`}
                >
                  {"getValue" in feat && feat.getValue ? (
                    <span className="font-semibold text-foreground">{feat.getValue(pkg)}</span>
                  ) : feat.check?.(pkg) ? (
                    <Check className="w-5 h-5 text-primary mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
