const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function formatCurrency(
  amount: number,
  currency: string,
  locale = "en-AU"
): string {
  const normalizedCurrency = currency.toUpperCase();
  const isZeroDecimal = zeroDecimalCurrencies.has(normalizedCurrency);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(amount);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!mins) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function formatDateTime(isoString: string, locale = "en-AU"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoString));
}
