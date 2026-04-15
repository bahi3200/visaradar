import { motion } from "framer-motion";
import { Bell, Briefcase, ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface HeroSectionProps {
  user: any;
}

export default function HeroSection({ user }: HeroSectionProps) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, x: 0, scale: 1, scaleX: 1 };

  return (
    <section
      className="relative overflow-hidden min-h-[90vh] flex items-center"
      style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-[hsl(222,47%,6%)]/70" />
      
      {/* Floating particles — skip on mobile / reduced-motion */}
      {!reduced && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-accent/30"
              style={{ left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 25}%` }}
              animate={{ y: [0, -30, 0], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}

      <div className="container relative py-16 md:py-24">
        <motion.div
          initial={reduced ? noMotion : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.7 }}
          className="max-w-2xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={reduced ? noMotion : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground text-sm font-bold px-6 py-2.5 rounded-full mb-8 shadow-lg"
          >
            <Sparkles className="w-4 h-4" />
            تنبيهات فورية لمواعيد الفيزا
          </motion.div>

          {/* Main heading */}
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-6 text-foreground">
            لا تفوّت موعد{" "}
            <span className="text-accent relative">
              فيزا
              <motion.span
                className="absolute -bottom-1 left-0 right-0 h-1 bg-accent/40 rounded-full"
                initial={reduced ? { scaleX: 1 } : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={reduced ? { duration: 0 } : { delay: 0.8, duration: 0.5 }}
              />
            </span>{" "}
            مرة أخرى
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-4 max-w-lg mx-auto">
            نُبلّغك فوراً عند توفّر مواعيد جديدة للفيزا في السفارات والقنصليات. اشترك الآن واحصل على إشعار مباشر.
          </p>

          {/* Jobs line */}
          <motion.p
            initial={reduced ? noMotion : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.5 }}
            className="text-base md:text-lg text-accent font-bold mb-10 flex items-center justify-center gap-2"
          >
            <Briefcase className="w-5 h-5" />
            + عقود عمل في أوروبا وكندا
          </motion.p>

          {/* CTA Button */}
          <motion.div
            initial={reduced ? noMotion : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { delay: 0.6 }}
          >
            <Link
              to={user ? "/pricing" : "/auth/register"}
              className="inline-flex items-center gap-3 bg-accent hover:bg-accent/90 text-accent-foreground font-black text-xl px-12 py-5 rounded-full transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 group"
            >
              اشترك الآن
              <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </Link>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={reduced ? noMotion : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.9 }}
            className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground/70"
          >
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" />
              مراقبة 24/7
            </span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>تنبيه عبر تليغرام</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>+500 مشترك</span>
          </motion.div>
        </motion.div>
      </div>

      {/* Wave separator */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z" fill="hsl(var(--background))" />
        </svg>
      </div>
    </section>
  );
}
