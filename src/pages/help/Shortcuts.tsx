import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Keyboard, Image as ImageIcon, Maximize2, Printer, RotateCw, ZoomIn, ZoomOut, X, RefreshCw } from "lucide-react";

interface Shortcut {
  keys: string[];
  label: string;
  icon?: typeof Keyboard;
}

interface ShortcutCategory {
  title: string;
  description: string;
  icon: typeof Keyboard;
  shortcuts: Shortcut[];
}

const categories: ShortcutCategory[] = [
  {
    title: "عارض الوصل (Receipt Lightbox)",
    description: "تظهر عند فتح صورة وصل دفع من /my-requests",
    icon: ImageIcon,
    shortcuts: [
      { keys: ["+", "="], label: "تكبير الصورة", icon: ZoomIn },
      { keys: ["−", "_"], label: "تصغير الصورة", icon: ZoomOut },
      { keys: ["0"], label: "إعادة الضبط (الحجم الأصلي)", icon: RefreshCw },
      { keys: ["R"], label: "تدوير 90° مع عقارب الساعة", icon: RotateCw },
      { keys: ["⇧", "R"], label: "تدوير 90° عكس عقارب الساعة", icon: RotateCw },
      { keys: ["F"], label: "ملء الشاشة", icon: Maximize2 },
      { keys: ["P"], label: "طباعة الوصل", icon: Printer },
      { keys: ["Esc"], label: "إغلاق العارض", icon: X },
    ],
  },
  {
    title: "إيماءات اللمس",
    description: "متاحة على الأجهزة اللوحية والهواتف داخل عارض الوصل",
    icon: Keyboard,
    shortcuts: [
      { keys: ["نقر مزدوج"], label: "تبديل التكبير (1×/3×)" },
      { keys: ["قرص بإصبعين"], label: "تكبير وتصغير سلس" },
      { keys: ["سحب"], label: "تحريك الصورة المكبّرة" },
    ],
  },
];

function KeyChip({ k }: { k: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2.5 rounded-lg bg-muted/60 border border-border text-foreground font-mono text-sm shadow-sm">
      {k}
    </kbd>
  );
}

export default function ShortcutsPage() {
  return (
    <Layout>
      <SEO
        title="اختصارات لوحة المفاتيح | VisaRadar"
        description="دليل شامل لجميع اختصارات لوحة المفاتيح وإيماءات اللمس في موقع VisaRadar مصنّفة حسب الميزة"
      />
      <div className="container py-10 max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowRight className="w-4 h-4" />
          الرئيسية
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start gap-4 mb-8">
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Keyboard className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
                اختصارات لوحة المفاتيح
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                جميع الاختصارات المتاحة في الموقع، مرتّبة حسب الميزة
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {categories.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <section
                  key={cat.title}
                  className="gradient-card rounded-2xl border border-border/50 p-5 sm:p-6"
                >
                  <header className="flex items-start gap-3 mb-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <CatIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{cat.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                    </div>
                  </header>

                  <ul className="divide-y divide-border/40">
                    {cat.shortcuts.map((s) => {
                      const Icon = s.icon;
                      return (
                        <li
                          key={s.label}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {Icon && (
                              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm text-foreground truncate">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {s.keys.map((k, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && (
                                  <span className="text-muted-foreground text-xs">+</span>
                                )}
                                <KeyChip k={k} />
                              </span>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-8">
            اقتراح اختصار جديد؟{" "}
            <Link to="/contact" className="text-accent hover:underline">
              تواصل معنا
            </Link>
          </p>
        </motion.div>
      </div>
    </Layout>
  );
}