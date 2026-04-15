import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import parisImg from "@/assets/cities/paris.jpg";
import romeImg from "@/assets/cities/rome.jpg";
import madridImg from "@/assets/cities/madrid.jpg";
import berlinImg from "@/assets/cities/berlin.jpg";

const cities = [
  { img: parisImg, name: "باريس", country: "فرنسا", flag: "🇫🇷", desc: "مدينة النور والجمال" },
  { img: romeImg, name: "روما", country: "إيطاليا", flag: "🇮🇹", desc: "عاصمة الإمبراطورية الخالدة" },
  { img: madridImg, name: "مدريد", country: "إسبانيا", flag: "🇪🇸", desc: "قلب إسبانيا النابض" },
  { img: berlinImg, name: "برلين", country: "ألمانيا", flag: "🇩🇪", desc: "مدينة التاريخ والحداثة" },
];

export default function CityGallery() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, scale: 1 };

  return (
    <section className="container py-8">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl md:text-2xl font-bold text-foreground text-center mb-1"
      >
        🏛️ استكشف وجهتك القادمة
      </motion.h2>
      <motion.p
        initial={reduced ? noMotion : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-xs text-muted-foreground text-center mb-6"
      >
        أجمل المدن الأوروبية التي نراقب تأشيراتها من أجلك
      </motion.p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cities.map((city, i) => (
          <motion.div
            key={city.name}
            initial={reduced ? noMotion : { opacity: 0, y: 24, scale: 0.92 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 * i, type: "spring", stiffness: 180, damping: 22 }}
            className="group relative rounded-2xl overflow-hidden aspect-[3/4] cursor-default"
          >
            <img
              src={city.img}
              alt={city.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            
            {/* Flag floating badge */}
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
              {city.flag}
            </div>

            {/* Bottom content */}
            <div className="absolute bottom-0 inset-x-0 p-4">
              <h3 className="font-heading text-lg font-bold text-white mb-0.5 group-hover:text-accent transition-colors">{city.name}</h3>
              <p className="text-[11px] text-white/50">{city.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
