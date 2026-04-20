import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في التأشيرات الأوروبية. مهمتك هي اقتراح 3 أسئلة متابعة قصيرة وذكية يمكن للمستخدم سؤالها بعد ردّ المساعد، بناءً على سياق المحادثة.

قواعد:
- اكتب الأسئلة بالعربية الفصحى المبسطة
- كل سؤال أقل من 10 كلمات
- أسئلة عملية ومفيدة (وثائق، إجراءات، نصائح، مدد، أسعار)
- لا تكرر معلومات سبق ذكرها
- ركّز على الخطوات التالية المنطقية

استخدم الأداة suggest_questions فقط.`;

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

    // Per-user rate limit shared with visa-chat: max 30 AI calls per rolling hour
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
      // Suggestions are non-essential — fail soft with empty list + 429
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "3600",
        },
      });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Take only the last 6 messages for context efficiency
    const recentMessages = messages.slice(-6);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...recentMessages],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_questions",
              description: "اقترح 3 أسئلة متابعة قصيرة بناءً على المحادثة",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: { type: "string" },
                    description: "ثلاثة أسئلة متابعة قصيرة بالعربية",
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_questions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let suggestions: string[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(args.questions)) {
          suggestions = args.questions
            .filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
            .slice(0, 3);
        }
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    // Record successful invocation against the user's quota
    admin
      .from("chat_rate_limits")
      .insert({ user_id: userId })
      .then(({ error }) => {
        if (error) console.error("rate limit insert error:", error);
      });

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("visa-chat-suggestions error:", e);
    return new Response(JSON.stringify({ suggestions: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
