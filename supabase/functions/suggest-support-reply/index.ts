// Suggests an AI-drafted reply for an admin to send back on a contact message.
// Uses Lovable AI Gateway with the LOVABLE_API_KEY auto-secret.

import { requireServiceRoleOrAdmin } from '../_shared/internalAuth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReplyRequest {
  full_name?: string;
  subject?: string;
  message?: string;
  tone?: "professional" | "friendly" | "apologetic";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const authFail = await requireServiceRoleOrAdmin(req, { allowModerator: true });
  if (authFail) return authFail;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as ReplyRequest;
    if (!body?.message || !body?.subject) {
      return new Response(
        JSON.stringify({ error: "subject and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tone = body.tone || "professional";
    const toneAr =
      tone === "friendly"
        ? "ودّي ومحترف"
        : tone === "apologetic"
        ? "اعتذاري ومهذّب"
        : "احترافي ورسمي";

    const systemPrompt = `أنت مساعد دعم فني لمنصة VisaRadar (متخصصة في متابعة مواعيد التأشيرات والوظائف للجزائريين).
- اكتب الردود بالعربية الفصحى البسيطة، بضمير الجمع المهذب.
- النبرة المطلوبة: ${toneAr}.
- ابدأ بتحية المرسل بالاسم، اشكرهم على التواصل.
- جاوب على سؤالهم بشكل مباشر ومفيد. لا تخترع معلومات لا تعرفها.
- إن لم تكن تملك معلومة دقيقة، اعرض المتابعة عبر الفريق.
- اختم بتحية مهذبة وتوقيع "فريق VisaRadar".
- تجنب الرموز التعبيرية المفرطة.
- اجعل الرد بين 80 و 200 كلمة.
- لا تستخدم Markdown أو رموز تنسيق — نص عادي فقط.`;

    const userPrompt = `اسم المرسل: ${body.full_name || "العميل"}
موضوع الرسالة: ${body.subject}

نص رسالة العميل:
${body.message}

اكتب الرد المقترح فقط، بدون مقدمات.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول بعد قليل." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "نفدت أرصدة Lovable AI، يرجى إضافة رصيد." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      return new Response(
        JSON.stringify({ error: "تعذر توليد الرد" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const suggestion =
      data?.choices?.[0]?.message?.content?.toString().trim() || "";

    return new Response(
      JSON.stringify({ suggestion, tone }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("suggest-support-reply error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
