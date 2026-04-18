import Layout from "@/components/Layout";
import JobCard from "@/components/JobCard";
import { sampleJobs } from "@/data/sample";
import { Search, Filter, X, MapPin, Building2, Banknote, Lock, Crown, Calendar, ArrowLeft } from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import JobFilters from "@/components/jobs/JobFilters";
import JobSubscriptionBanner from "@/components/jobs/JobSubscriptionBanner";

const countryNames: Record<string, string> = {
  CA: "كندا 🇨🇦",
  FR: "فرنسا 🇫🇷",
  DE: "ألمانيا 🇩🇪",
  US: "أمريكا 🇺🇸",
  AU: "أستراليا 🇦🇺",
  GB: "بريطانيا 🇬🇧",
};

const countries = [...new Set(sampleJobs.map((j) => j.countryCode))];
const contractTypes = [...new Set(sampleJobs.map((j) => j.contractType))];

function parseSalary(text?: string): number {
  if (!text) return 0;
  return parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
}

const salaryRanges = [
  { label: "الكل", min: 0, max: Infinity },
  { label: "أقل من 2,000", min: 0, max: 1999 },
  { label: "2,000 – 3,000", min: 2000, max: 3000 },
  { label: "أكثر من 3,000", min: 3001, max: Infinity },
];

export default function JobsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [contract, setContract] = useState("");
  const [salaryIdx, setSalaryIdx] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Check active subscription
  const { data: subscription } = useQuery({
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*, packages(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { isPrivileged } = useIsAdmin();
  const hasAccess = isPrivileged || (!!subscription && (subscription.service_type === 'jobs' || subscription.service_type === 'both'));
  const activeCount = (country ? 1 : 0) + (contract ? 1 : 0) + (salaryIdx > 0 ? 1 : 0);

  const filtered = useMemo(() => {
    const range = salaryRanges[salaryIdx];
    return sampleJobs.filter((j) => {
      const matchSearch =
        !search ||
        j.titleAr.includes(search) ||
        j.titleFr.toLowerCase().includes(search.toLowerCase()) ||
        j.sourceName.toLowerCase().includes(search.toLowerCase());
      const matchCountry = !country || j.countryCode === country;
      const matchContract = !contract || j.contractType === contract;
      const salary = parseSalary(j.salaryText);
      const matchSalary = salary >= range.min && salary <= range.max;
      return matchSearch && matchCountry && matchContract && matchSalary;
    });
  }, [search, country, contract, salaryIdx]);

  function clearFilters() {
    setCountry("");
    setContract("");
    setSalaryIdx(0);
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  // Show only 2 jobs as preview for non-subscribers
  const visibleJobs = hasAccess ? filtered : filtered.slice(0, 2);

  return (
    <Layout>
      <div className="container py-10">
        <h1 className="font-heading text-3xl font-bold text-foreground mb-2">عقود العمل في أوروبا وكندا</h1>
        <p className="text-muted-foreground mb-6">تصفّح أحدث فرص العمل المتاحة من مصادر رسمية</p>

        {/* Subscription status */}
        {hasAccess ? (
          <div className="gradient-card rounded-xl border border-accent/30 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
                <Crown className="w-4 h-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">مشترك — وصول كامل</p>
                <p className="text-[10px] text-muted-foreground">{(subscription as any)?.packages?.name_ar}</p>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-primary" />
                من {formatDate(subscription!.starts_at)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-destructive" />
                إلى {formatDate(subscription!.expires_at)}
              </span>
            </div>
          </div>
        ) : (
          <JobSubscriptionBanner isLoggedIn={!!user} />
        )}

        {/* Search + Filters */}
        <JobFilters
          search={search}
          onSearchChange={setSearch}
          country={country}
          onCountryChange={setCountry}
          contract={contract}
          onContractChange={setContract}
          salaryIdx={salaryIdx}
          onSalaryChange={setSalaryIdx}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          activeCount={activeCount}
          onClearFilters={clearFilters}
          countries={countries}
          contractTypes={contractTypes}
          countryNames={countryNames}
          salaryRanges={salaryRanges}
          disabled={!hasAccess}
        />

        {/* Results count */}
        <p className="text-xs text-muted-foreground mb-4">{filtered.length} وظيفة</p>

        {/* Job cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleJobs.map((job, i) => (
            <div key={job.id} className="relative">
              {hasAccess ? (
                <JobCard job={job} index={i} />
              ) : (
                <>
                  <div className="opacity-50 pointer-events-none select-none">
                    <JobCard job={job} index={i} />
                  </div>
                  {i === 1 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
                      <div className="text-center">
                        <Lock className="w-6 h-6 text-accent mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground font-medium">محتوى مقفل</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Locked overlay for remaining jobs */}
        {!hasAccess && filtered.length > 2 && (
          <div className="mt-6 gradient-card rounded-2xl border border-accent/30 p-8 text-center relative overflow-hidden">
            <Lock className="w-10 h-10 text-accent mx-auto mb-3" />
            <h3 className="font-heading text-lg font-bold text-foreground mb-2">
              {filtered.length - 2} وظيفة إضافية مقفلة
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              اشترك الآن للوصول الكامل لجميع عروض العمل مع خاصية الفلتر والتفاصيل الكاملة
            </p>
            <Link
              to={user ? "/pricing" : "/auth/register"}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 py-3 rounded-full transition-all shadow-lg"
            >
              اشترك الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-16">لا توجد نتائج مطابقة للتصفية.</p>
        )}
      </div>
    </Layout>
  );
}
