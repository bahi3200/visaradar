import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, CheckCircle, XCircle, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ManageReviews() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin-reviews", filter],
    queryFn: async () => {
      let query = supabase
        .from("reviews")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false });

      if (filter === "pending") query = query.eq("is_approved", false);
      if (filter === "approved") query = query.eq("is_approved", true);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const toggleApproval = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ is_approved: approve })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast.success("تم تحديث حالة المراجعة");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const deleteReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast.success("تم حذف المراجعة");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const pendingCount = reviews.filter((r: any) => !r.is_approved).length;

  return (
    <AdminLayout title="إدارة المراجعات">
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-heading text-foreground">إدارة المراجعات</h1>
          {pendingCount > 0 && (
            <Badge variant="destructive">{pendingCount} بانتظار المراجعة</Badge>
          )}
        </div>

        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="pending">بانتظار الموافقة</SelectItem>
            <SelectItem value="approved">معتمدة</SelectItem>
          </SelectContent>
        </Select>

        {isLoading ? (
          <p className="text-muted-foreground">جاري التحميل...</p>
        ) : reviews.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">لا توجد مراجعات</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {reviews.map((review: any) => (
              <Card key={review.id} className={!review.is_approved ? "border-accent/40" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {review.profiles?.full_name || "مستخدم"} — {review.country_code}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString("ar-DZ")} •
                        حالة الفيزا: {review.visa_status === "approved" ? "مقبولة" : review.visa_status === "rejected" ? "مرفوضة" : "قيد الانتظار"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-4 h-4 ${s <= review.rating ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                  </div>
                  {review.center_name && (
                    <Badge variant="secondary" className="text-xs mb-2">{review.center_name}</Badge>
                  )}
                  <p className="text-sm text-foreground/90 mb-3">{review.review_text}</p>
                  <div className="flex gap-2">
                    {!review.is_approved ? (
                      <Button size="sm" variant="default" className="gap-1" onClick={() => toggleApproval.mutate({ id: review.id, approve: true })}>
                        <Eye className="w-3.5 h-3.5" />اعتماد
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => toggleApproval.mutate({ id: review.id, approve: false })}>
                        <EyeOff className="w-3.5 h-3.5" />إخفاء
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => deleteReview.mutate(review.id)}>
                      <Trash2 className="w-3.5 h-3.5" />حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
