import { motion, useScroll, useTransform } from "framer-motion";
import { Crown, Calendar, Clock, User, Shield } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import europeVideo from "@/assets/cities/europe-hero.mp4.asset.json";
import { useRef } from "react";

interface Props {
  fullName: string | null;
  packageName: string | null;
  daysLeft: number;
  expiresAt: string;
  isSubscribed: boolean;
  isAdmin: boolean;
}

export default function SubscriberHero({ fullName, packageName, daysLeft, expiresAt, isSubscribed, isAdmin }: Props) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, scale: 1 };
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const videoY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const videoScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 0.4], [0, -30]);

  const badgeLabel = isAdmin ? "مسؤول" : isSubscribed ? (packageName || "مشترك") : "عضو مسجل";
  const BadgeIcon = isAdmin ? Shield : isSubscribed ? Crown : User;

  return (
    <section ref={sectionRef} className="relative h-[55vh] min-h-[380px] overflow-hidden">
      <motion.video
        src={europeVideo.url}
        autoPlay
        muted
        loop
        playsInline
        style={reduced ? {} : { y: videoY, scale: videoScale }}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Multi-layer gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/40 to-transparent" />

      <motion.div
        className="absolute inset-0 flex items-end"
        style={reduced ? {} : { opacity: contentOpacity, y: contentY }}
      >
        <div className="container pb-8">
          <motion.div
            initial={reduced ? noMotion : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Badge */}
            <motion.div
              initial={reduced ? noMotion : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 backdrop-blur-md"
            >
              <BadgeIcon className="w-3.5 h-3.5 text-accent" />
              <span className="text-accent text-xs font-bold">{badgeLabel}</span>
            </motion.div>

            <h1 className="font-heading text-3xl md:text-5xl font-black text-foreground mb-2 leading-tight">
              مرحباً، {fullName || "عزيزي"} <span className="inline-block animate-[wave_2s_ease-in-out_infinite]">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground/80 max-w-sm">
              {isAdmin
                ? "مرحباً بك — كل شيء تحت السيطرة"
                : isSubscribed
                ? "نتمنى لك رحلة موفقة في مسار تأشيرتك"
                : "مرحباً بك — اشترك للاستفادة من جميع المزايا"}
            </p>
          </motion.div>

          {isSubscribed && !isAdmin && (
            <motion.div
              initial={reduced ? noMotion : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex gap-3 mt-5"
            >
              <div className="relative bg-card/60 backdrop-blur-xl border border-accent/20 rounded-2xl px-5 py-3 flex items-center gap-3 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent" />
                <div className="w-9 h-9 rounded-xl gradient-accent flex items-center justify-center relative">
                  <Clock className="w-4 h-4 text-accent-foreground" />
                </div>
                <div className="relative">
                  <p className="text-[10px] text-muted-foreground/70">أيام متبقية</p>
                  <p className="text-xl font-black text-accent tabular-nums">{daysLeft}</p>
                </div>
              </div>
              <div className="relative bg-card/60 backdrop-blur-xl border border-primary/20 rounded-2xl px-5 py-3 flex items-center gap-3 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center relative">
                  <Calendar className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="relative">
                  <p className="text-[10px] text-muted-foreground/70">ينتهي في</p>
                  <p className="text-sm font-bold text-foreground">
                    {new Date(expiresAt).toLocaleDateString("ar-DZ", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </section>
  );
}
