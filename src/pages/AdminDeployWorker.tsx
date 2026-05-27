import { useState } from "react";
import { Copy, Check, Server, Rocket, AlertTriangle, Terminal } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "vrw_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function CopyBtn({ text, label = "نسخ" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        toast.success("تم النسخ");
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="w-3 h-3 ml-1" /> : <Copy className="w-3 h-3 ml-1" />}
      {label}
    </Button>
  );
}

export default function AdminDeployWorker() {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState<string>(
    localStorage.getItem("vr_repo_url") || ""
  );
  const [proxyUrl, setProxyUrl] = useState<string>(
    localStorage.getItem("vr_proxy_url") ||
      "http://brd-customer-hl_f0d8164b-zone-residential_proxy1:s8423k8sh3f2@brd.superproxy.io:33335"
  );
  const [targetsJson, setTargetsJson] = useState<string>(
    localStorage.getItem("vr_targets_json") ||
      '[{"country_code":"DZ","provider":"tlscontact","url":"https://visas-fr.tlscontact.com/visa/dz","homepage":"https://visas-fr.tlscontact.com/"}]'
  );

  // persist convenience inputs
  const persist = (k: string, v: string) => {
    try { localStorage.setItem(k, v); } catch {}
  };

  const create = async () => {
    const trimmed = name.trim() || `worker-${Date.now()}`;
    setCreating(true);
    try {
      const t = genToken();
      const hash = await sha256Hex(t);
      const { error } = await supabase
        .from("browser_worker_tokens")
        .insert({ worker_name: trimmed, token_hash: hash });
      if (error) throw error;
      setToken(t);
      setWorkerName(trimmed);
      toast.success("تم إنشاء الـ Worker — انسخ الـ token الآن، لن يظهر مرة أخرى!");
    } catch (e: any) {
      toast.error(e.message || "فشل الإنشاء");
    } finally {
      setCreating(false);
    }
  };

  const envBlock = token
    ? `SUPABASE_URL=${SUPABASE_URL}
WORKER_TOKEN=${token}
INTERVAL_MINUTES=5
SCAN_JITTER_PCT=35
HEADFUL_PROBABILITY=0.15
BETWEEN_TARGET_MIN_S=20
BETWEEN_TARGET_MAX_S=40
REQUIRE_RESIDENTIAL_PROXY=true
DECODO_PROXY=${proxyUrl}
TARGETS_JSON=${targetsJson}`
    : "";

  const deployScript = token
    ? `#!/usr/bin/env bash
# VisaRadar — One-shot deploy on a fresh Ubuntu 22.04+ VPS (root)
set -e

echo "[1/5] System deps…"
apt update -y
apt install -y curl git ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

echo "[2/5] Clone worker…"
rm -rf /opt/visaradar-worker
git clone ${repoUrl || "<YOUR_REPO_URL>"} /opt/visaradar-worker
cd /opt/visaradar-worker/vps-worker

echo "[3/5] Install Playwright + Chromium…"
npm install
npx playwright install --with-deps chromium

echo "[4/5] Write .env (worker=${workerName})…"
cat > .env <<'ENV'
${envBlock}
ENV

echo "[5/5] Start as pm2 service…"
pm2 start worker.js --name visaradar-worker --time
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "✅ Worker started. Logs: pm2 logs visaradar-worker"`
    : "";

  return (
    <AdminLayout title="Deploy Worker" subtitle="إنشاء worker token وسكريبت تثبيت جاهز للـ VPS">
      <div className="space-y-6 max-w-4xl">
        {/* Step 1 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">1</Badge>
            <h2 className="font-heading text-lg flex items-center gap-2">
              <Server className="w-5 h-5" /> أنشئ Worker Token
            </h2>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">اسم الـ Worker</Label>
              <Input
                placeholder="vps-paris-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating || !!token}
              />
            </div>
            <Button onClick={create} disabled={creating || !!token}>
              <Rocket className="w-4 h-4 ml-2" />
              {creating ? "جاري…" : "إنشاء Token"}
            </Button>
          </div>
          {token && (
            <div className="space-y-2 rounded border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-start gap-2 text-xs text-warning-foreground">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>هذا الـ token لن يُعرَض مرة أخرى — انسخه الآن واحفظه في مكان آمن.</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-background/60 rounded p-2 break-all">{token}</code>
                <CopyBtn text={token} />
              </div>
            </div>
          )}
        </Card>

        {/* Inputs: repo + proxy + targets */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">★</Badge>
            <h2 className="font-heading text-lg">إعدادات السكريبت</h2>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">رابط مستودع GitHub (يحتوي مجلد vps-worker/)</Label>
              <Input
                placeholder="https://github.com/USERNAME/REPO.git"
                value={repoUrl}
                onChange={(e) => { setRepoUrl(e.target.value); persist("vr_repo_url", e.target.value); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                اربط مشروع Lovable بـ GitHub (الزر أعلى يمين الشاشة) ثم الصق رابط الـ .git هنا.
              </p>
            </div>
            <div>
              <Label className="text-xs">Residential Proxy URL</Label>
              <Input
                placeholder="http://user:pass@host:port"
                value={proxyUrl}
                onChange={(e) => { setProxyUrl(e.target.value); persist("vr_proxy_url", e.target.value); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                BrightData / Decodo / Smartproxy. سيُحفظ في <code>DECODO_PROXY</code>.
              </p>
            </div>
            <div>
              <Label className="text-xs">TARGETS_JSON (المواقع المراقبة)</Label>
              <textarea
                className="w-full rounded border border-input bg-background p-2 text-xs font-mono min-h-[80px]"
                value={targetsJson}
                onChange={(e) => { setTargetsJson(e.target.value); persist("vr_targets_json", e.target.value); }}
              />
            </div>
          </div>
        </Card>

        {/* Step 2 */}
        <Card className={`p-5 space-y-4 ${!token ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2">
            <Badge variant="outline">2</Badge>
            <h2 className="font-heading text-lg">ملف .env الجاهز</h2>
          </div>

          <p className="text-xs text-muted-foreground">
            عدّل <code>DECODO_PROXY</code> / <code>PROVIDER_PROXY_POOLS</code> و
            <code> TARGETS_JSON</code> حسب احتياجك قبل التشغيل.
          </p>

          <pre className="bg-muted/30 rounded p-3 text-[11px] font-mono overflow-auto max-h-72 border border-border">
            {envBlock || "أنشئ الـ token أولاً…"}
          </pre>

          {token && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                className="flex-1 gap-2"
                variant="default"
                onClick={async () => {
                  await navigator.clipboard.writeText(envBlock);
                  toast.success("تم نسخ ملف .env كامل — الصقه مباشرة في VPS");
                }}
              >
                <Copy className="w-4 h-4" />
                إنشاء ونسخ ملف .env كامل
              </Button>
              <div className="text-[11px] text-muted-foreground flex-1">
                انسخ هذا الملف ثم الصقه في المسار <code>/opt/visaradar-worker/vps-worker/.env</code> على VPS لتجنب أخطاء الكتابة اليدوية.
              </div>
            </div>
          )}
        </Card>

        {/* Step 3 */}
        <Card className={`p-5 space-y-3 ${!token ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2">
            <Badge variant="outline">3</Badge>
            <h2 className="font-heading text-lg flex items-center gap-2">
              <Terminal className="w-5 h-5" /> سكريبت التثبيت على VPS
            </h2>
            {token && <CopyBtn text={deployScript} label="نسخ السكريبت" />}
          </div>
          <p className="text-xs text-muted-foreground">
            نفّذ السكريبت كـ <b>root</b> على Ubuntu 22.04+ (≥1GB RAM). إذا تركت رابط GitHub فارغاً ستحتاج إلى استبداله يدوياً.
          </p>
          {token && (
            <div className="rounded border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
              <div className="font-semibold">⚡ أمر واحد للتشغيل على VPS:</div>
              <code className="block bg-background/60 rounded p-2 text-[11px] break-all">
                ssh root@YOUR_VPS_IP
              </code>
              <div className="text-muted-foreground">ثم الصق السكريبت أدناه كاملاً واضغط Enter.</div>
            </div>
          )}
          <pre className="bg-muted/30 rounded p-3 text-[11px] font-mono overflow-auto max-h-96 leading-relaxed">
            {deployScript || "أنشئ الـ token أولاً…"}
          </pre>
        </Card>

        <Card className="p-4 text-xs text-muted-foreground space-y-1">
          <div><b>الحدّ الأدنى للـ VPS:</b> 1 vCPU, 1GB RAM, 10GB SSD (DigitalOcean / Hetzner / Contabo ~$6/شهر)</div>
          <div><b>للتحقق بعد التشغيل:</b> ستظهر النتائج تلقائياً في صفحة <b>Anti-Bot Evasion</b> و <b>Stealth Analytics</b> خلال دقائق.</div>
          <div><b>للسجلات الحيّة:</b> <code>pm2 logs visaradar-worker</code></div>
        </Card>
      </div>
    </AdminLayout>
  );
}