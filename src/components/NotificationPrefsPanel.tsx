import { useState } from "react";
import { Volume2, Vibrate, BellOff, Settings2, Play, Send, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type AlertMode,
  getAlertMode,
  getVolume,
  setAlertMode,
  setVolume,
  triggerAlert,
} from "@/lib/notificationPrefs";

const OPTIONS: { value: AlertMode; label: string; icon: typeof Volume2 }[] = [
  { value: "sound", label: "صوت", icon: Volume2 },
  { value: "vibrate", label: "اهتزاز", icon: Vibrate },
  { value: "silent", label: "بدون", icon: BellOff },
];

export default function NotificationPrefsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [mode, setMode] = useState<AlertMode>(() => getAlertMode());
  const [volume, setVolumeState] = useState<number>(() => getVolume());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-test-visa-notification", {
        body: { countryCode: "IT" },
      });
      if (error) throw error;
      toast.success("تم إرسال الإشعار التجريبي ✅");
    } catch (e: any) {
      toast.error("فشل إرسال الإشعار", { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  const handleMode = (m: AlertMode) => {
    setMode(m);
    setAlertMode(m);
  };

  const handleVolume = (vals: number[]) => {
    const v = (vals[0] ?? 60) / 100;
    setVolumeState(v);
    setVolume(v);
  };

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3 h-3" />
          إعدادات التنبيه
        </span>
        <span className="opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 bg-secondary/20">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">نوع التنبيه</p>
            <div className="grid grid-cols-3 gap-1">
              {OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleMode(value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md text-[10px] transition-colors ${
                    mode === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {mode === "sound" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-muted-foreground">مستوى الصوت</p>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  value={[Math.round(volume * 100)]}
                  onValueChange={handleVolume}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => triggerAlert(mode, volume)}
                  className="p-1.5 rounded-md bg-background hover:bg-secondary text-muted-foreground transition-colors"
                  aria-label="تجربة"
                >
                  <Play className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          {mode === "vibrate" && (
            <button
              type="button"
              onClick={() => triggerAlert(mode, volume)}
              className="w-full py-1.5 rounded-md bg-background hover:bg-secondary text-[10px] text-muted-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              تجربة الاهتزاز
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={sendTest}
              disabled={sending}
              className="w-full py-2 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              إرسال إشعار تجريبي
            </button>
          )}
        </div>
      )}
    </div>
  );
}