import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, MessageCircle, Mail, User } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const contactSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم يجب أن يكون حرفين على الأقل").max(100),
  email: z.string().trim().email("بريد إلكتروني غير صالح").max(255),
  subject: z.string().trim().min(3, "الموضوع يجب أن يكون 3 أحرف على الأقل").max(200),
  message: z.string().trim().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل").max(2000),
});

type ContactForm = z.infer<typeof contactSchema>;

export default function ContactUs() {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { full_name: "", email: "", subject: "", message: "" },
  });

  const onSubmit = async (data: ContactForm) => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("contact_messages" as any).insert({
        ...data,
        user_id: user?.id || null,
      } as any);
      if (error) throw error;
      toast.success("تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.");
      form.reset();
    } catch {
      toast.error("حدث خطأ أثناء إرسال الرسالة. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <SEO
        title="تواصل معنا — VisaRadar"
        description="هل لديك سؤال أو اقتراح؟ راسلنا مباشرة عبر النموذج وسيرد فريق VisaRadar في أقرب وقت ممكن."
        path="/contact"
      />
      <div className="container max-w-2xl py-12" dir="rtl">
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <MessageCircle className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-2xl font-heading">اتصل بنا</CardTitle>
            <CardDescription className="text-base">
              لديك سؤال أو استفسار؟ أرسل لنا رسالتك وسنرد عليك في أقرب وقت.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <User className="w-4 h-4" /> الاسم الكامل
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="أدخل اسمك الكامل" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Mail className="w-4 h-4" /> البريد الإلكتروني
                      </FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="example@email.com" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الموضوع</FormLabel>
                      <FormControl>
                        <Input placeholder="موضوع الرسالة" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الرسالة</FormLabel>
                      <FormControl>
                        <Textarea placeholder="اكتب رسالتك هنا..." rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full gap-2" disabled={submitting}>
                  <Send className="w-4 h-4" />
                  {submitting ? "جارٍ الإرسال..." : "إرسال الرسالة"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
