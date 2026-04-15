import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Star, MessageSquare, Send, User, CheckCircle, XCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ReviewsSectionProps {
  countryCode: string;
  countryNameAr: string;
}

function StarRating({ value, onChange, readonly = false }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={`transition-colors ${readonly ? "cursor-default" : "cursor-pointer"}`}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={() => onChange?.(star)}
        >
          <Star
            className={`w-5 h-5 ${
              star <= (hover || value)
                ? "fill-accent text-accent"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

const visaStatusConfig = {
  approved: { label: "مقبولة", icon: CheckCircle, className: "text-primary" },
  rejected: { label: "مرفوضة", icon: XCircle, className: "text-destructive" },
  pending: { label: "قيد الانتظار", icon: Clock, className: "text-muted-foreground" },
} as const;

export default function ReviewsSection({ countryCode, countryNameAr }: ReviewsSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [visaStatus, setVisaStatus] = useState<string>("");
  const [centerName, setCenterName] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", countryCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, profiles(full_name, avatar_url)")
        .eq("country_code", countryCode)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("يجب تسجيل الدخول");
      if (rating === 0) throw new Error("يرجى اختيار التقييم");
      if (!reviewText.trim()) throw new Error("يرجى كتابة المراجعة");
      if (!visaStatus) throw new Error("يرجى اختيار حالة الفيزا");

      const { error } = await supabase.from("reviews").insert({
        user_id: user.id,
        country_code: countryCode,
        rating,
        review_text: reviewText.trim(),
        visa_status: visaStatus,
        center_name: centerName.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال مراجعتك بنجاح! ستظهر بعد المراجعة من الإدارة.");
      setShowForm(false);
      setRating(0);
      setReviewText("");
      setVisaStatus("");
      setCenterName("");
      queryClient.invalidateQueries({ queryKey: ["reviews", countryCode] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold font-heading text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          تجارب المستخدمين
        </h2>
        {avgRating && (
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(Number(avgRating))} readonly />
            <span className="text-sm text-muted-foreground">({avgRating}) • {reviews.length} مراجعة</span>
          </div>
        )}
      </div>

      {/* Add review button */}
      {user && !showForm && (
        <Button variant="outline" className="mb-4 gap-2" onClick={() => setShowForm(true)}>
          <Send className="w-4 h-4" />
          شارك تجربتك
        </Button>
      )}
      {!user && (
        <p className="text-sm text-muted-foreground mb-4">
          <a href="/auth/login" className="text-primary hover:underline">سجل الدخول</a> لمشاركة تجربتك
        </p>
      )}

      {/* Review Form */}
      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">التقييم</label>
              <StarRating value={rating} onChange={setRating} />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">حالة الفيزا</label>
              <Select value={visaStatus} onValueChange={setVisaStatus}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">✅ مقبولة</SelectItem>
                  <SelectItem value="rejected">❌ مرفوضة</SelectItem>
                  <SelectItem value="pending">⏳ قيد الانتظار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">مركز التأشيرات (اختياري)</label>
              <input
                className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="مثلاً: VFS Global الجزائر"
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">تجربتك</label>
              <Textarea
                placeholder={`شارك تجربتك مع مواعيد فيزا ${countryNameAr}...`}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                maxLength={1000}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">{reviewText.length}/1000</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="gap-2">
                <Send className="w-4 h-4" />
                {submitMutation.isPending ? "جاري الإرسال..." : "إرسال المراجعة"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviews list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="py-4 h-24" /></Card>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            لا توجد مراجعات بعد. كن أول من يشارك تجربته!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review: any) => {
            const status = visaStatusConfig[review.visa_status as keyof typeof visaStatusConfig];
            const StatusIcon = status?.icon || Clock;
            return (
              <Card key={review.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {review.profiles?.full_name || "مستخدم"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString("ar-DZ")}
                        </p>
                      </div>
                    </div>
                    <StarRating value={review.rating} readonly />
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="outline" className={`gap-1 text-xs ${status?.className}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status?.label}
                    </Badge>
                    {review.center_name && (
                      <Badge variant="secondary" className="text-xs">{review.center_name}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{review.review_text}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
