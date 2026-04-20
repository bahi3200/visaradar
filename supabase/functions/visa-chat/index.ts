import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `أنت "مساعد التأشيرات" — مستشار ذكي ومتخصص في التأشيرات الأوروبية للمواطنين الجزائريين والعرب.

دورك:
- الإجابة على أسئلة المستخدمين حول تأشيرات شنغن (إيطاليا، فرنسا، إسبانيا، ألمانيا، اليونان، البرتغال، هولندا، بلجيكا، إلخ)
- شرح أنواع التأشيرات: سياحة، عمل، دراسة، عائلية، طبية، أعمال
- توضيح الوثائق المطلوبة لكل نوع تأشيرة
- شرح إجراءات الحجز عبر VFS Global, TLS Contact, BLS International
- تقديم نصائح للمقابلة وزيادة فرص القبول
- شرح أسعار التأشيرات تقريبياً ومدة المعالجة
- التنبيه على الأخطاء الشائعة التي تؤدي للرفض

قواعد مهمة:
- اكتب بالعربية الفصحى المبسطة
- استخدم تنسيق Markdown (عناوين، قوائم، **عريض** للنقاط المهمة)
- كن دقيقاً ومختصراً — لا تطل بدون داعٍ
- إذا لم تكن متأكداً من معلومة، انصح المستخدم بالتحقق من الموقع الرسمي للسفارة
- لا تُعطِ ضمانات بالقبول — التأشيرة قرار سيادي للسفارة
- شجع المستخدم على الاشتراك في المنصة للحصول على تنبيهات فورية بفتح المواعيد

لا تتحدث عن مواضيع خارج نطاق التأشيرات والسفر.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated user — block anonymous AI gateway abuse
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Per-user rate limit: max 30 messages per rolling hour
    const RATE_LIMIT = 30;
    const WINDOW_MS = 60 * 60 * 1000;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count, error: countError } = await admin
      .from("chat_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceIso);
    if (countError) {
      console.error("rate limit count error:", countError);
    } else if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `لقد تجاوزت الحد المسموح (${RATE_LIMIT} رسالة في الساعة). يرجى المحاولة لاحقاً.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "3600",
          },
        }
      );
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "تم تجاوز الحد المسموح، يرجى المحاولة بعد قليل." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "نفدت الأرصدة، يرجى التواصل مع الإدارة." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "خطأ في خدمة الذكاء الاصطناعي" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record successful invocation against the user's quota
    admin
      .from("chat_rate_limits")
      .insert({ user_id: userId })
      .then(({ error }) => {
        if (error) console.error("rate limit insert error:", error);
      });

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("visa-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
