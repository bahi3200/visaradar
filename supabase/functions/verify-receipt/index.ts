import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  requestId: z.string().uuid(),
  receiptUrl: z.string().url(),
});

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, data?: unknown) =>
    console.log(`[verify-receipt:${reqId}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
  const logErr = (msg: string, err?: unknown) =>
    console.error(`[verify-receipt:${reqId}] ${msg}`, err);

  const t0 = Date.now();
  log('▶ request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      logErr('LOVABLE_API_KEY missing from env');
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      logErr('Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    log('payload received', { hasRequestId: !!body?.requestId, hasReceiptUrl: !!body?.receiptUrl });

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      logErr('Body validation failed', parsed.error.flatten().fieldErrors);
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { requestId, receiptUrl } = parsed.data;
    log('processing', { requestId, receiptUrlSample: receiptUrl.slice(0, 80) });

    let imageDataUrl: string;
    let imageSizeKb = 0;
    try {
      const match = receiptUrl.match(/\/object\/(?:public\/)?receipts\/(.+)$/);
      if (!match) throw new Error(`Invalid receipt URL format: ${receiptUrl}`);
      const storagePath = decodeURIComponent(match[1]);
      log('storage path extracted', { storagePath });

      const dlStart = Date.now();
      const { data: blob, error: dlError } = await supabase.storage
        .from('receipts')
        .download(storagePath);
      if (dlError || !blob) throw dlError || new Error('Download returned empty blob');
      log('image downloaded', { ms: Date.now() - dlStart, mime: blob.type, bytes: blob.size });

      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      const mime = blob.type || 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${b64}`;
      imageSizeKb = Math.round(buf.length / 1024);
      log('image encoded', { sizeKb: imageSizeKb });
    } catch (e) {
      logErr('Failed to fetch/encode receipt image', e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ error: 'تعذر تحميل صورة الوصل' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log('calling AI gateway', { model: 'google/gemini-3-flash-preview', payloadKb: imageSizeKb });
    const aiStart = Date.now();
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are a CCP (Compte Courant Postal) receipt verification expert for Algeria Post. Your job is to analyze receipt images and detect potential fraud or forgery.

Analyze the receipt image and check for:
1. Is this a genuine CCP receipt from Algeria Post (Algérie Poste)?
2. Are the fonts, layout, and formatting consistent with real CCP receipts?
3. Are there signs of digital manipulation (inconsistent shadows, misaligned text, artifacts)?
4. Is the amount clearly readable?
5. Is there a valid date and transaction reference?
6. Any signs of copy-paste, Photoshop manipulation, or AI generation?

Respond ONLY in valid JSON with this exact structure:
{
  "is_genuine": true/false,
  "confidence": 0-100,
  "amount_detected": "amount or null",
  "date_detected": "date or null",
  "reference_detected": "reference or null",
  "fraud_indicators": ["list of any suspicious findings"],
  "analysis_summary_ar": "ملخص التحليل بالعربية",
  "recommendation": "approve" | "review" | "reject"
}`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this CCP payment receipt for authenticity. Check for any signs of forgery or manipulation.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'verify_receipt',
              description: 'Return the receipt verification result',
              parameters: {
                type: 'object',
                properties: {
                  is_genuine: { type: 'boolean' },
                  confidence: { type: 'number' },
                  amount_detected: { type: 'string' },
                  date_detected: { type: 'string' },
                  reference_detected: { type: 'string' },
                  fraud_indicators: { type: 'array', items: { type: 'string' } },
                  analysis_summary_ar: { type: 'string' },
                  recommendation: { type: 'string', enum: ['approve', 'review', 'reject'] },
                },
                required: ['is_genuine', 'confidence', 'fraud_indicators', 'analysis_summary_ar', 'recommendation'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'verify_receipt' } },
      }),
    });
    log('AI gateway responded', { ms: Date.now() - aiStart, status: aiResponse.status });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      logErr(`AI gateway non-OK ${aiResponse.status}`, errText.slice(0, 500));

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات، حاول مرة أخرى لاحقاً' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'رصيد غير كافٍ، يرجى إعادة الشحن' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'AI verification failed', details: errText.slice(0, 200) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    let verificationResult: any;
    let parseSource = 'unknown';

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        verificationResult = JSON.parse(toolCall.function.arguments);
        parseSource = 'tool_call';
      } catch (e) {
        logErr('Failed to JSON.parse tool_call args', e instanceof Error ? e.message : e);
        verificationResult = { is_genuine: false, confidence: 0, fraud_indicators: ['Failed to parse AI response'], analysis_summary_ar: 'فشل في تحليل الوصل', recommendation: 'review' };
        parseSource = 'fallback_tool_parse_error';
      }
    } else {
      const content = aiData.choices?.[0]?.message?.content || '';
      try {
        verificationResult = JSON.parse(content);
        parseSource = 'content_json';
      } catch {
        logErr('No tool_call and content not JSON', { contentSample: String(content).slice(0, 200) });
        verificationResult = { is_genuine: false, confidence: 0, fraud_indicators: ['No structured response'], analysis_summary_ar: 'لم يتمكن النظام من تحليل الوصل', recommendation: 'review' };
        parseSource = 'fallback_no_structure';
      }
    }
    log('AI result parsed', {
      source: parseSource,
      recommendation: verificationResult?.recommendation,
      confidence: verificationResult?.confidence,
      is_genuine: verificationResult?.is_genuine,
      fraud_indicators_count: Array.isArray(verificationResult?.fraud_indicators) ? verificationResult.fraud_indicators.length : 0,
    });

    const fraudDetected = verificationResult.recommendation === 'reject' ||
      (!verificationResult.is_genuine && verificationResult.confidence > 60);

    const { error: updateError } = await supabase
      .from('subscription_requests')
      .update({
        ai_verification_result: verificationResult,
        ai_fraud_detected: fraudDetected,
      })
      .eq('id', requestId);
    if (updateError) {
      logErr('Failed to update subscription_requests', updateError);
    } else {
      log('subscription_requests updated', { requestId, fraudDetected });
    }

    log('✔ done', { totalMs: Date.now() - t0 });
    return new Response(JSON.stringify({ success: true, verification: verificationResult, fraudDetected }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    logErr('Unhandled error', error instanceof Error ? error.stack || error.message : error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
