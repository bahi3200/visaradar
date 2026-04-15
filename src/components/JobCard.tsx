import { motion } from "framer-motion";
import { MapPin, Banknote, Building2, ExternalLink, Star } from "lucide-react";
import { Link } from "react-router-dom";

export type Job = {
  id: string;
  titleAr: string;
  titleFr: string;
  countryCode: string;
  contractType: string;
  salaryText?: string;
  detailsUrl?: string;
  sourceName: string;
  isFeatured: boolean;
  descriptionAr?: string;
  requirementsAr?: string[];
  benefitsAr?: string[];
};

const countryNames: Record<string, string> = {
  CA: "كندا 🇨🇦",
  FR: "فرنسا 🇫🇷",
  DE: "ألمانيا 🇩🇪",
  US: "أمريكا 🇺🇸",
  AU: "أستراليا 🇦🇺",
  GB: "بريطانيا 🇬🇧",
};

export default function JobCard({ job, index }: { job: Job; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6, scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className={`gradient-card rounded-xl border p-5 shadow-card transition-colors relative group cursor-pointer ${
        job.isFeatured ? "border-accent/30 hover:shadow-[0_10px_30px_-8px_hsl(var(--accent)/0.25)]" : "border-border/50 hover:border-primary/30 hover:shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.2)]"
      }`}
    >
      {job.isFeatured && (
        <div className="absolute top-3 left-3 flex items-center gap-1 gradient-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Star className="w-3 h-3" />
          مميّز
        </div>
      )}

      <h3 className="font-heading text-lg font-bold text-foreground mb-3 leading-relaxed">
        {job.titleAr}
      </h3>

      <div className="space-y-2 text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span>{countryNames[job.countryCode] || job.countryCode}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary shrink-0" />
          <span>{job.sourceName} • {job.contractType}</span>
        </div>
        {job.salaryText && (
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-accent shrink-0" />
            <span className="font-bold text-accent">{job.salaryText}</span>
          </div>
        )}
      </div>

      <Link
        to={`/jobs/${job.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        عرض التفاصيل
      </Link>
    </motion.div>
  );
}
