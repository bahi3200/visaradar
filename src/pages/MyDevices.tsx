import { useMyDevices } from "@/hooks/useDeviceCheck";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, Laptop, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function getDeviceIcon(os: string | null) {
  if (!os) return <Monitor className="w-8 h-8" />;
  const lower = os.toLowerCase();
  if (lower.includes("android") || lower.includes("ios")) return <Smartphone className="w-8 h-8" />;
  if (lower.includes("mac")) return <Laptop className="w-8 h-8" />;
  return <Monitor className="w-8 h-8" />;
}

export default function MyDevices() {
  const { devices, loading, deactivateDevice } = useMyDevices();

  const handleDeactivate = async (deviceId: string, deviceName: string | null) => {
    await deactivateDevice(deviceId);
    toast.success(`تم إلغاء تفعيل "${deviceName || "الجهاز"}"`);
  };

  const activeDevices = devices.filter((d) => d.is_active);
  const inactiveDevices = devices.filter((d) => !d.is_active);

  return (
    <Layout>
      <div className="container py-8 max-w-2xl" dir="rtl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">أجهزتي</h1>
          <p className="text-muted-foreground text-sm">
            يمكنك استخدام حسابك على جهازين كحد أقصى. قم بإلغاء تفعيل جهاز لتتمكن من الدخول من جهاز جديد.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{activeDevices.length}</div>
              <div className="text-xs text-muted-foreground">أجهزة نشطة</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{inactiveDevices.length}</div>
              <div className="text-xs text-muted-foreground">أجهزة معطلة</div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : devices.length === 0 ? (
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-8 text-center text-muted-foreground">
              لا توجد أجهزة مسجلة بعد.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Active Devices */}
            {activeDevices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  الأجهزة النشطة ({activeDevices.length}/2)
                </h2>
                <div className="space-y-3">
                  {activeDevices.map((device) => (
                    <Card key={device.id} className="bg-card/60 border-primary/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="text-primary mt-1">{getDeviceIcon(device.os)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-foreground truncate">
                                {device.device_name || "جهاز غير معروف"}
                              </span>
                              <Badge variant="default" className="bg-green-500/20 text-green-400 text-[10px]">
                                نشط
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>المتصفح: {device.browser || "غير معروف"}</div>
                              <div>النظام: {device.os || "غير معروف"}</div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                آخر نشاط: {format(new Date(device.last_active_at), "dd MMM yyyy - HH:mm", { locale: ar })}
                              </div>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>إلغاء تفعيل الجهاز</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل أنت متأكد من إلغاء تفعيل "{device.device_name || "الجهاز"}"؟
                                  سيتم تسجيل خروجك من هذا الجهاز.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-row-reverse gap-2">
                                <AlertDialogAction
                                  onClick={() => handleDeactivate(device.id, device.device_name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  إلغاء التفعيل
                                </AlertDialogAction>
                                <AlertDialogCancel>تراجع</AlertDialogCancel>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Inactive Devices */}
            {inactiveDevices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  أجهزة معطلة ({inactiveDevices.length})
                </h2>
                <div className="space-y-3">
                  {inactiveDevices.map((device) => (
                    <Card key={device.id} className="bg-card/30 border-border/20 opacity-60">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="text-muted-foreground mt-1">{getDeviceIcon(device.os)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-muted-foreground truncate">
                                {device.device_name || "جهاز غير معروف"}
                              </span>
                              <Badge variant="outline" className="text-[10px]">معطل</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground/70">
                              <div>المتصفح: {device.browser || "غير معروف"}</div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                آخر نشاط: {format(new Date(device.last_active_at), "dd MMM yyyy - HH:mm", { locale: ar })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
