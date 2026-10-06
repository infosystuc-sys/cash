const nf = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Moneda = "ARS" | "USD";

/** $ 1.234,56 / U$S 1.234,56 */
export function money(value: number | null | undefined, moneda: Moneda = "ARS") {
  const n = Number(value ?? 0);
  const sign = n < 0 ? "-" : "";
  return `${sign}${moneda === "USD" ? "U$S" : "$"} ${nf.format(Math.abs(n))}`;
}

/** +$ 1.234,56 / -$ 1.234,56 */
export function signedMoney(value: number, moneda: Moneda = "ARS") {
  return (value >= 0 ? "+" : "") + money(value, moneda);
}

export function number(value: number | null | undefined) {
  return nf.format(Number(value ?? 0));
}

/** Convierte "1.800.000,50" o "1800000.5" a número. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  // Solo puntos: si hay más de uno o el último grupo tiene 3 dígitos, son separadores de miles
  const parts = t.split(".");
  if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) return Number(parts.join(""));
  return Number(t);
}

/** "2026-10-05" -> "05/10/2026" */
export function fecha(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-05" -> "05/10" */
export function fechaCorta(iso: string | null | undefined) {
  return fecha(iso).slice(0, 5);
}

/** Fecha de hoy en Buenos Aires como YYYY-MM-DD */
export function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function sumarMeses(iso: string, meses: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function diasHasta(iso: string) {
  const a = new Date(hoyISO() + "T12:00:00").getTime();
  const b = new Date(iso.slice(0, 10) + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "Vence en 4 días" / "Vencido hace 9 días" / "Vence hoy" */
export function textoVencimiento(iso: string | null | undefined, prefijo = "Vence") {
  if (!iso) return "";
  const d = diasHasta(iso);
  if (d === 0) return `${prefijo} hoy`;
  if (d > 0) return `${prefijo} en ${d} día${d === 1 ? "" : "s"}`;
  return `Vencido hace ${-d} día${d === -1 ? "" : "s"}`;
}

export function iniciales(nombre: string | null | undefined) {
  return (nombre ?? "?")
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function porcentaje(parte: number, total: number) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}
