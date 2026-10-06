/** Descarga un CSV (separador ";" para que Excel en español lo abra por columnas). */
export function exportCsv(nombre: string, filas: Record<string, unknown>[]) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(";"), ...filas.map((f) => cols.map((c) => esc(f[c])).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
