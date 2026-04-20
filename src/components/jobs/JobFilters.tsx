import { Search, Filter, X, MapPin, Building2, Banknote } from "lucide-react";

interface JobFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  country: string;
  onCountryChange: (v: string) => void;
  contract: string;
  onContractChange: (v: string) => void;
  salaryIdx: number;
  onSalaryChange: (v: number) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeCount: number;
  onClearFilters: () => void;
  countries: string[];
  contractTypes: string[];
  countryNames: Record<string, string>;
  salaryRanges: { label: string; min: number; max: number }[];
  disabled?: boolean;
}

export default function JobFilters({
  search, onSearchChange, country, onCountryChange,
  contract, onContractChange, salaryIdx, onSalaryChange,
  showFilters, onToggleFilters, activeCount, onClearFilters,
  countries, contractTypes, countryNames, salaryRanges, disabled,
}: JobFiltersProps) {
  return (
    <>
      {/* Search + Filter toggle */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            data-global-search
            placeholder="ابحث عن وظيفة..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-card border border-border/50 rounded-xl pr-11 pl-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={onToggleFilters}
          disabled={disabled}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-card border-border/50 text-muted-foreground"
              : showFilters || activeCount > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-card border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">تصفية</span>
          {activeCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && !disabled && (
        <div className="gradient-card rounded-xl border border-border/50 shadow-card p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-sm font-bold text-foreground">خيارات التصفية</h3>
            {activeCount > 0 && (
              <button onClick={onClearFilters} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                <X className="w-3 h-3" />
                مسح الكل
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <MapPin className="w-3.5 h-3.5 text-primary" /> الدولة
              </label>
              <select
                value={country}
                onChange={(e) => onCountryChange(e.target.value)}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
              >
                <option value="">جميع الدول</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{countryNames[c] || c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Building2 className="w-3.5 h-3.5 text-primary" /> نوع العقد
              </label>
              <select
                value={contract}
                onChange={(e) => onContractChange(e.target.value)}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
              >
                <option value="">جميع الأنواع</option>
                {contractTypes.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Banknote className="w-3.5 h-3.5 text-primary" /> نطاق الراتب
              </label>
              <select
                value={salaryIdx}
                onChange={(e) => onSalaryChange(Number(e.target.value))}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
              >
                {salaryRanges.map((r, i) => (
                  <option key={i} value={i}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && !showFilters && !disabled && (
        <div className="flex flex-wrap gap-2 mb-6">
          {country && (
            <span className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">
              {countryNames[country] || country}
              <button onClick={() => onCountryChange("")}><X className="w-3 h-3" /></button>
            </span>
          )}
          {contract && (
            <span className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">
              {contract}
              <button onClick={() => onContractChange("")}><X className="w-3 h-3" /></button>
            </span>
          )}
          {salaryIdx > 0 && (
            <span className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">
              {salaryRanges[salaryIdx].label}
              <button onClick={() => onSalaryChange(0)}><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}
    </>
  );
}
