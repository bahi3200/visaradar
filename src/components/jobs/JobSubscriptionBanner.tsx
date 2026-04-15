import { Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  isLoggedIn: boolean;
}

export default function JobSubscriptionBanner({ isLoggedIn }: Props) {
  return (
    <div className="gradient-card rounded-xl border border-accent/20 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
          <Lock className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">الوصول الكامل يتطلب اشتراك</p>
          <p className="text-[10px] text-muted-foreground">اشترك لعرض جميع الوظائف واستخدام الفلتر</p>
        </div>
      </div>
      <Link
        to={isLoggedIn ? "/pricing" : "/auth/register"}
        className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-5 py-2.5 rounded-full transition-all"
      >
        اشترك الآن
        <ArrowLeft className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
