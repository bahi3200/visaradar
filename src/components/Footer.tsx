import { Radar } from "lucide-react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border/40 mt-20">
      <div className="container py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary" />
          <span className="font-heading text-sm font-bold text-foreground">
            Visa<span className="text-primary">Radar</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap justify-center">
          <Link to="/" className="hover:text-foreground transition-colors">الرئيسية</Link>
          <Link to="/jobs" className="hover:text-foreground transition-colors">الوظائف</Link>
          <Link to="/contact" className="hover:text-foreground transition-colors">اتصل بنا</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">سياسة الخصوصية</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">شروط الاستخدام</Link>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} VisaRadar. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
