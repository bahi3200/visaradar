// Arabic relative time formatter (e.g., "منذ 3 أيام", "منذ ساعتين")

export function formatRelativeArabic(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const month = Math.round(day / 30);
  const year = Math.round(day / 365);

  let phrase: string;
  if (sec < 45) phrase = "قبل لحظات";
  else if (min < 2) phrase = "قبل دقيقة";
  else if (min === 2) phrase = "قبل دقيقتين";
  else if (min < 11) phrase = `قبل ${min} دقائق`;
  else if (min < 60) phrase = `قبل ${min} دقيقة`;
  else if (hr < 2) phrase = "قبل ساعة";
  else if (hr === 2) phrase = "قبل ساعتين";
  else if (hr < 11) phrase = `قبل ${hr} ساعات`;
  else if (hr < 24) phrase = `قبل ${hr} ساعة`;
  else if (day < 2) phrase = "قبل يوم";
  else if (day === 2) phrase = "قبل يومين";
  else if (day < 11) phrase = `قبل ${day} أيام`;
  else if (day < 30) phrase = `قبل ${day} يوماً`;
  else if (month < 2) phrase = "قبل شهر";
  else if (month === 2) phrase = "قبل شهرين";
  else if (month < 11) phrase = `قبل ${month} أشهر`;
  else if (month < 12) phrase = `قبل ${month} شهراً`;
  else if (year < 2) phrase = "قبل سنة";
  else if (year === 2) phrase = "قبل سنتين";
  else if (year < 11) phrase = `قبل ${year} سنوات`;
  else phrase = `قبل ${year} سنة`;

  return future ? phrase.replace("قبل", "خلال") : phrase;
}

export function formatLinkedSince(input: string | Date | null | undefined): string {
  const rel = formatRelativeArabic(input);
  if (!rel) return "";
  // "قبل 3 أيام" → "مرتبط منذ 3 أيام"
  return rel.replace(/^قبل\s/, "مرتبط منذ ");
}

export function formatFullDateAr(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString("ar-DZ", {
      timeZone: "Africa/Algiers",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date.toISOString();
  }
}
