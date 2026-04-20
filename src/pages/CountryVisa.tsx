import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { FileText, Clock, MapPin, CheckCircle2, Lightbulb, HelpCircle, Globe, ArrowLeft } from "lucide-react";
import Layout from "@/components/Layout";
import { getCountryBySlug, countryPages } from "@/data/countryLandingPages";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ReviewsSection from "@/components/reviews/ReviewsSection";
import NotFound from "./NotFound";

export default function CountryVisa() {
  const { slug } = useParams<{ slug: string }>();
  const country = slug ? getCountryBySlug(slug) : undefined;

  if (!country) return <NotFound />;

  return (
    <Layout>
      <Helmet>
        <title>{country.metaTitle}</title>
        <meta name="description" content={country.metaDescription} />
        <link rel="canonical" href={`https://visa-dz.com/visa/${country.slug}`} />
        <meta property="og:title" content={country.metaTitle} />
        <meta property="og:description" content={country.metaDescription} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: country.heroTitle,
            description: country.metaDescription,
            author: { "@type": "Organization", name: "VisaWay" },
          })}
        </script>
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-24" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        <div className="container mx-auto px-4 relative z-10" dir="rtl">
          <Link to="/visa" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground mb-6 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            جميع الدول
          </Link>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-5xl mb-4 block">{country.flagEmoji}</span>
            <h1 className="text-3xl md:text-4xl font-bold font-heading text-foreground mb-3">
              {country.heroTitle}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">{country.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Clock className="w-3.5 h-3.5" />
                مدة المعالجة: {country.averageProcessingTime}
              </Badge>
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-accent text-accent">
                <Globe className="w-3.5 h-3.5" />
                {country.visaTypes.length} أنواع تأشيرات
              </Badge>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10 space-y-10" dir="rtl">
        {/* CTA */}
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-6">
            <div className="flex-1">
              <h2 className="text-lg font-bold font-heading text-foreground">لا تفوّت أي موعد متاح!</h2>
              <p className="text-sm text-muted-foreground">اشترك الآن واحصل على تنبيه فوري عند فتح مواعيد فيزا {country.nameAr}</p>
            </div>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0">
              <Link to="/subscribe">اشترك الآن</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Visa Types */}
        <section>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-5 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            أنواع التأشيرات المتاحة
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {country.visaTypes.map((v, i) => (
              <Card key={i} className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">{v.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-sm text-muted-foreground">{v.description}</p>
                  <Badge variant="secondary" className="text-xs">{v.duration}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Required Documents */}
        <section>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-5 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            الوثائق المطلوبة
          </h2>
          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {country.requiredDocuments.map((doc, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{doc}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Preparation Tips */}
        <section>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-5 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-accent" />
            نصائح لتحضير الملف
          </h2>
          <div className="grid gap-3">
            {country.preparationTips.map((tip, i) => (
              <Card key={i} className="border-accent/20 bg-accent/5">
                <CardContent className="flex items-start gap-3 py-4">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/20 text-accent font-bold text-sm shrink-0">{i + 1}</span>
                  <p className="text-sm text-foreground">{tip}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Visa Centers */}
        <section>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-5 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            مراكز التأشيرات
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {country.visaCenters.map((center, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-4">
                  <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{center.name}</p>
                    <p className="text-xs text-muted-foreground">{center.city}</p>
                  </div>
                  <a href={center.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                    زيارة الموقع
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-5 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            أسئلة شائعة
          </h2>
          <Accordion type="single" collapsible className="space-y-2">
            {country.faq.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border/50 rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <Separator />

        {/* Reviews */}
        <ReviewsSection countryCode={country.countryCode} countryNameAr={country.nameAr} />

        {/* Other Countries */}
        <section>
          <h2 className="text-xl font-bold font-heading text-foreground mb-4">دول أخرى</h2>
          <div className="flex flex-wrap gap-2">
            {countryPages
              .filter((c) => c.slug !== country.slug)
              .map((c) => (
                <Button key={c.slug} variant="outline" size="sm" asChild>
                  <Link to={`/visa/${c.slug}`}>
                    {c.flagEmoji} {c.nameAr}
                  </Link>
                </Button>
              ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
