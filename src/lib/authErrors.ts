/**
 * Translates Supabase auth errors to friendly Arabic messages.
 * Returns null when no specific translation matches (caller should fall back).
 */
export function translateAuthError(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  const msg = (error.message || "").toLowerCase();
  const code = (error.code || "").toLowerCase();

  // Leaked / weak password (HaveIBeenPwned)
  if (
    code === "weak_password" ||
    msg.includes("pwned") ||
    msg.includes("known to be weak") ||
    msg.includes("easy to guess")
  ) {
    return "كلمة المرور هذه معروفة ومسربة. الرجاء اختيار كلمة أقوى وأكثر أماناً.";
  }

  if (msg.includes("password should be at least") || msg.includes("password is too short")) {
    return "كلمة المرور قصيرة جداً، يجب أن تكون 6 أحرف على الأقل.";
  }

  if (msg.includes("already registered") || msg.includes("user already registered")) {
    return "هذا البريد الإلكتروني مسجل بالفعل.";
  }

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  }

  if (msg.includes("email not confirmed")) {
    return "يرجى تأكيد بريدك الإلكتروني أولاً.";
  }

  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return "محاولات كثيرة. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى.";
  }

  return null;
}
