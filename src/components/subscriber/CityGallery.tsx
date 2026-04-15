import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import parisImg from "@/assets/cities/paris.jpg";
import romeImg from "@/assets/cities/rome.jpg";
import madridImg from "@/assets/cities/madrid.jpg";
import berlinImg from "@/assets/cities/berlin.jpg";

const cities = [
  { img: parisImg, name: "باريس", country: "فرنسا 🇫🇷", desc: "مدينة النور والجمال" },
  { img: romeImg, name: "روما", country: "إيطاليا 🇮🇹", desc: "عاصمة الإمبراطورية الخالدة" },
  { img: madridImg, name: "مدريد", country: "إسبانيا 🇪🇸", desc: "قلب إسبانيا النابض" },
  { img: berlinImg, name: "برلين", country: "ألمانيا 🇩🇪", desc: "مدينة التاريخ والحداثة" },
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
        className="font-heading text-xl md:text-2xl font-bold text-foreground text-center mb-2"
      >
        🏛️ استكشف وجهتك القادمة
      </motion.h2>
      <motion.p
        initial={reduced ? noMotion : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="text-xs text-muted-foreground text-center mb-6"
      >
        أجمل المدن الأوروبية التي نراقب تأشيراتها من أجلك
      </motion.p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cities.map((city, i) => (
          <motion.div
            key={city.name}
            initial={reduced ? noMotion : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 * i }}
            className="group relative rounded-xl overflow-hidden aspect-[3/4] cursor-default"
          >
            <img
              src={city.img}
              alt={city.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-3">
              <p className="text-xs text-white/70">{city.country}</p>
              <h3 className="font-heading text-base font-bold text-white">{city.name}</h3>
              <p className="text-[10px] text-white/60 mt-0.5">{city.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
