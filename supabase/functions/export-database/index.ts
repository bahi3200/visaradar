import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// @ts-ignore - deno specifier
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "chat_conversations",
  "chat_messages",
  "contact_messages",
  "email_notifications",
  "expiry_reminder_log",
  "notification_preferences",
  "packages",
  "payment_settings",
  "profiles",
  "push_subscriptions",
  "referral_reward_log",
  "referrals",
  "reviews",
  "settings_audit_log",
  "site_settings",
  "subscription_requests",
  "subscriptions",
  "user_devices",
  "user_roles",
  "visa_monitor_checks",
  "visa_notifications",
];

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return "\uFEFF" + lines.join("\n"); // UTF-8 BOM
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleCheck } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = new JSZip();
    const summary: { table: string; rows: number }[] = [];
    const fullJson: Record<string, any[]> = {};

    for (const table of TABLES) {
      try {
        const { data, error } = await admin
          .from(table)
          .select("*")
          .limit(50000);
        if (error) {
          console.error(`Error exporting ${table}:`, error);
          summary.push({ table, rows: -1 });
          zip.file(`${table}.csv`, "\uFEFFerror," + (error.message ?? "unknown"));
          continue;
        }
        const rows = data ?? [];
        zip.file(`${table}.csv`, toCSV(rows));
        fullJson[table] = rows;
        summary.push({ table, rows: rows.length });
      } catch (e) {
        console.error(`Exception ${table}:`, e);
        summary.push({ table, rows: -1 });
      }
    }

    // Summary file
    const summaryMd =
      `# Database Backup\n\nExported at: ${new Date().toISOString()}\n\n` +
      `| Table | Rows |\n|-------|------|\n` +
      summary.map((s) => `| ${s.table} | ${s.rows} |`).join("\n");
    zip.file("SUMMARY.md", summaryMd);
    zip.file(
      "full-backup.json",
      JSON.stringify(
        { exported_at: new Date().toISOString(), tables: fullJson },
        null,
        2,
      ),
    );

    const zipBlob = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `backup-${new Date().toISOString().slice(0, 10)}.zip`;

    return new Response(zipBlob, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Backup-Summary": JSON.stringify(summary),
      },
    });
  } catch (e) {
    console.error("Export failed:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Export failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
