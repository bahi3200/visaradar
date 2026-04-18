import { useMemo } from "react";

export type StrengthLevel = "weak" | "medium" | "strong";

export function evaluatePasswordStrength(password: string): {
  score: number; // 0-4
  level: StrengthLevel;
  label: string;
  hints: string[];
} {
  const hints: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else hints.push("8 أحرف على الأقل");

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else hints.push("أحرف كبيرة وصغيرة");

  if (/[0-9]/.test(password)) score++;
  else hints.push("رقم واحد على الأقل");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else hints.push("رمز خاص (!@#$...)");

  if (password.length >= 12) score = Math.min(score + 1, 4);

  let level: StrengthLevel = "weak";
  let label = "ضعيفة";
  if (score >= 4) {
    level = "strong";
    label = "قوية";
  } else if (score >= 2) {
    level = "medium";
    label = "متوسطة";
  }

  return { score, level, label, hints };
}

interface Props {
  password: string;
  className?: string;
}

const PasswordStrength = ({ password, className = "" }: Props) => {
  const { score, level, label, hints } = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );

  if (!password) return null;

  const segments = 4;
  const filled = Math.max(1, Math.min(score, segments));

  const colorClass =
    level === "strong"
      ? "bg-emerald-500"
      : level === "medium"
      ? "bg-amber-500"
      : "bg-destructive";

  const textColorClass =
    level === "strong"
      ? "text-emerald-600"
      : level === "medium"
      ? "text-amber-600"
      : "text-destructive";

  return (
    <div className={`mt-2 space-y-1.5 ${className}`} aria-live="polite">
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={segments} aria-valuenow={filled}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filled ? colorClass : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColorClass}`}>قوة كلمة المرور: {label}</span>
        {level !== "strong" && hints.length > 0 && (
          <span className="text-muted-foreground truncate ms-2">
            أضف: {hints.slice(0, 2).join("، ")}
          </span>
        )}
      </div>
    </div>
  );
};

export default PasswordStrength;
