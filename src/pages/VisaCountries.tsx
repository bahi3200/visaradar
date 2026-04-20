import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, ArrowLeft } from "lucide-react";
import Layout from "@/components/Layout";
import AccessStatusCard from "@/components/AccessStatusCard";
import { countryPages } from "@/data/countryLandingPages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VisaCountries() {
  return (
    <Layout>
      <Helmet>
        <title>دليل التأشيرات | مواعيد فيزا جميع الدول من الجزائر</title>
        <meta name="description" content="دليل شامل لمواعيد التأشيرات من الجزائر. تتبع مواعيد فيزا فرنسا، إيطاليا، كندا، ألمانيا، إسبانيا وتركيا مع نصائح تحضير الملف." />
        <link rel="canonical" href="https://visa-dz.com/visa" />
      </Helmet>

      <section className="relative overflow-hidden py-16 md:py-24" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        <div className="container mx-auto px-4 relative z-10" dir="rtl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl md:text-4xl font-bold font-heading text-foreground mb-3">
              دليل التأشيرات من الجزائر
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              اختر الدولة التي تريد السفر إليها واطلع على الوثائق المطلوبة ونصائح تحضير الملف
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10" dir="rtl">
        <AccessStatusCard
          serviceType="visa"
          lockedSubtitle="اشترك لتلقي تنبيهات فتح المواعيد ومتابعة الدول"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {countryPages.map((country, i) => (
            <motion.div
              key={country.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Link to={`/visa/${country.slug}`}>
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardContent className="py-6 flex items-center gap-4">
                    <span className="text-4xl">{country.flagEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold font-heading text-foreground group-hover:text-primary transition-colors">
                        {country.nameAr}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{country.nameFr}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {country.visaTypes.slice(0, 2).map((v, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px]">{v.name}</Badge>
                        ))}
                        {country.visaTypes.length > 2 && (
                          <Badge variant="outline" className="text-[10px]">+{country.visaTypes.length - 2}</Badge>
                        )}
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
