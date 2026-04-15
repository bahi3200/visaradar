import { motion } from "framer-motion";
import { Crown, Calendar, Clock, User } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import europeVideo from "@/assets/cities/europe-hero.mp4.asset.json";

interface Props {
  fullName: string | null;
  packageName: string | null;
  daysLeft: number;
  expiresAt: string;
  isSubscribed: boolean;
}

export default function SubscriberHero({ fullName, packageName, daysLeft, expiresAt, isSubscribed }: Props) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, scale: 1 };

  return (
    <section className="relative h-[50vh] min-h-[340px] overflow-hidden">
      <video
        src={europeVideo.url}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />

      <div className="absolute inset-0 flex items-end">
        <div className="container pb-8">
          <motion.div
            initial={reduced ? noMotion : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${isSubscribed ? 'gradient-accent' : 'bg-primary/20'} flex items-center justify-center`}>
                {isSubscribed ? <Crown className="w-4 h-4 text-accent-foreground" /> : <User className="w-4 h-4 text-primary" />}
              </div>
              <span className={`text-xs font-bold ${isSubscribed ? 'text-accent' : 'text-primary'}`}>
                {isSubscribed ? (packageName || "مشترك") : "عضو مسجل"}
              </span>
            </div>
            <h1 className="font-heading text-2xl md:text-4xl font-black text-foreground mb-1">
              مرحباً، {fullName || "عزيزي"} 👋
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSubscribed ? "نتمنى لك رحلة موفقة في مسار تأشيرتك" : "مرحباً بك في منصتنا — اشترك للاستفادة من جميع المزايا"}
            </p>
          </motion.div>

          {isSubscribed && (
            <motion.div
              initial={reduced ? noMotion : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex gap-3 mt-4"
            >
              <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <div>
                  <p className="text-[10px] text-muted-foreground">أيام متبقية</p>
                  <p className="text-lg font-black text-accent">{daysLeft}</p>
                </div>
              </div>
              <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-[10px] text-muted-foreground">ينتهي في</p>
                  <p className="text-sm font-bold text-foreground">
                    {new Date(expiresAt).toLocaleDateString("ar-DZ", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
