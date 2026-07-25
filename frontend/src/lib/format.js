export const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function money(n) {
  if (n == null || isNaN(n)) return ARS.format(0);
  return ARS.format(Math.round(n));
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function fmtNumber(n, decimals = 2) {
  if (n == null || isNaN(n)) return "0";
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function kg(n) {
  return `${fmtNumber(n, 3)} kg`;
}
