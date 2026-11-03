import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { supabase, check } from "../lib/supabase";
import { useData } from "../lib/useData";
import { exportCsv } from "../lib/csv";
import { fecha, fechaCorta, sumarDias } from "../lib/format";
import { ErrorBanner, Loading, Segmented } from "./ui";

/**
 * Cash flow en formato horizontal (tipo planilla): una columna por período y una fila por elemento
 * (cada cobro, pago, cheque, egreso…). Los períodos pasados muestran los movimientos reales y, desde el
 * período de hoy, lo pendiente de cobro y pago (igual que fn_cashflow / fn_cashflow_detalle).
 */

export type PeriodoFlujo = "day" | "week" | "month";

type FilaPeriodo = {
  periodo_inicio: string;
  periodo_fin: string;
  saldo_inicial: number;
  ingresos: number;
  egresos: number;
  neto: number;
  saldo_final: number;
  proyectado: boolean;
};

type Mov = { fecha: string; proyectado: boolean; origen: string; concepto: string; detalle: string | null; ars: number; ref_id: number; fecha_real: string };

type Elemento = { clave: string; origen: string; concepto: string; detalle: string; valores: number[]; total: number; fechas: string[][] };

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const num = (n: number) => (Math.abs(n) < 0.5 ? "" : entero.format(n));

export function CashflowHorizontal({
  periodo,
  onPeriodo,
  opciones,
  filas,
  etiqueta,
  origenes,
  hoy,
}: {
  periodo: PeriodoFlujo;
  onPeriodo: (p: PeriodoFlujo) => void;
  opciones: { value: PeriodoFlujo; label: string }[];
  filas: FilaPeriodo[] | null;
  etiqueta: (ini: string) => string;
  origenes: Record<string, string>;
  hoy: string;
}) {
  const [abiertos, setAbiertos] = useState({ ingresos: true, egresos: true });
  const [busqueda, setBusqueda] = useState("");

  // Detalle de todos los períodos: los pasados con movimientos reales, desde el de hoy lo pendiente
  const primero = filas?.[0];
  const ultimo = filas?.[filas.length - 1];
  const primerProy = filas?.find((f) => f.proyectado);
  const movs = useData(async () => {
    if (!primero || !ultimo) return [] as Mov[];
    const llamadas = [];
    const finPasado = primerProy ? sumarDias(primerProy.periodo_inicio, -1) : ultimo.periodo_fin;
    if (primero.periodo_inicio <= finPasado) llamadas.push(supabase.rpc("fn_cashflow_detalle", { p_desde: primero.periodo_inicio, p_hasta: finPasado }));
    if (primerProy) llamadas.push(supabase.rpc("fn_cashflow_detalle", { p_desde: primerProy.periodo_inicio, p_hasta: ultimo.periodo_fin }));
    const res = await Promise.all(llamadas);
    return res.flatMap((r) => check(r)) as Mov[];
  }, [primero?.periodo_inicio, ultimo?.periodo_fin, primerProy?.periodo_inicio]);

  const grilla = useMemo(() => {
    if (!filas || !movs.data) return null;
    const idx = (f: string) => filas.findIndex((p) => f >= p.periodo_inicio && f <= p.periodo_fin);
    const mapa = new Map<string, Elemento>();
    for (const m of movs.data) {
      const i = idx(m.fecha);
      if (i < 0 || !m.ars) continue;
      const signo = m.ars > 0 ? "+" : "-";
      // Un mismo concepto recurrente (mismo tipo, concepto y contraparte) comparte fila
      const clave = `${signo}|${m.origen}|${m.concepto}|${m.detalle ?? ""}`;
      let e = mapa.get(clave);
      if (!e) {
        e = { clave, origen: m.origen, concepto: m.concepto, detalle: m.detalle ?? "", valores: filas.map(() => 0), total: 0, fechas: filas.map(() => []) };
        mapa.set(clave, e);
      }
      e.valores[i] += m.ars;
      e.total += m.ars;
      e.fechas[i].push(m.proyectado && m.fecha_real < m.fecha ? `vencía ${fecha(m.fecha_real)}` : fecha(m.fecha));
    }
    const q = busqueda.trim().toLowerCase();
    const todos = [...mapa.values()].filter((e) => !q || `${e.concepto} ${e.detalle} ${origenes[e.origen] ?? e.origen}`.toLowerCase().includes(q));
    // Primero el que tiene movimiento más temprano, después el de mayor importe
    const orden = (a: Elemento, b: Elemento) => a.valores.findIndex((v) => v) - b.valores.findIndex((v) => v) || Math.abs(b.total) - Math.abs(a.total);
    const ingresos = todos.filter((e) => e.clave.startsWith("+")).sort(orden);
    const egresos = todos.filter((e) => e.clave.startsWith("-")).sort(orden);
    const sumar = (l: Elemento[]) => filas.map((_, i) => l.reduce((s, e) => s + e.valores[i], 0));
    return { ingresos, egresos, totIng: sumar(ingresos), totEgr: sumar(egresos) };
  }, [filas, movs.data, busqueda, origenes]);

  const esHoy = (f: FilaPeriodo) => f.periodo_inicio <= hoy && hoy <= f.periodo_fin;
  const total = (l: number[]) => l.reduce((s, v) => s + v, 0);

  function exportar() {
    if (!filas || !grilla) return;
    const col = (f: FilaPeriodo) => `${etiqueta(f.periodo_inicio)}${f.proyectado ? " (proy.)" : ""}`;
    const fila = (tipo: string, concepto: string, detalle: string, valores: number[], tot: number | string) =>
      Object.fromEntries([["Tipo", tipo], ["Concepto", concepto], ["Detalle", detalle], ...filas.map((f, i) => [col(f), Math.round(valores[i] * 100) / 100]), ["Total", tot]]);
    exportCsv(`cashflow-${periodo}-${hoy}`, [
      fila("", "Saldo inicial", "", filas.map((f) => f.saldo_inicial), ""),
      ...grilla.ingresos.map((e) => fila(origenes[e.origen] ?? e.origen, e.concepto, e.detalle, e.valores, Math.round(e.total * 100) / 100)),
      fila("", "Total ingresos", "", grilla.totIng, Math.round(total(grilla.totIng) * 100) / 100),
      ...grilla.egresos.map((e) => fila(origenes[e.origen] ?? e.origen, e.concepto, e.detalle, e.valores, Math.round(e.total * 100) / 100)),
      fila("", "Total egresos", "", grilla.totEgr, Math.round(total(grilla.totEgr) * 100) / 100),
      fila("", "Flujo neto", "", filas.map((f) => f.neto), Math.round(total(filas.map((f) => f.neto)) * 100) / 100),
      fila("", "Saldo final", "", filas.map((f) => f.saldo_final), ""),
    ]);
  }

  const celdaBase = "px-3 py-2 text-right font-numeric whitespace-nowrap";
  const colHoy = "bg-secondary-fixed/25";
  const sticky = "sticky left-0 z-10 bg-surface-container-lowest";

  const filaTotales = (titulo: string, valores: number[], clase: string, extra?: { onClick?: () => void; abierto?: boolean; cantidad?: number; totalFila?: number }) => (
    <tr className={cn("border-t border-outline-variant/20", extra?.onClick && "cursor-pointer hover:bg-surface-container-low/60")} onClick={extra?.onClick}>
      <td className={cn(sticky, "px-4 py-2.5 font-bold text-xs whitespace-nowrap", clase)}>
        <span className="inline-flex items-center gap-1">
          {extra?.onClick && (extra.abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
          {titulo}
          {extra?.cantidad != null && <span className="text-[10px] font-medium text-outline">({extra.cantidad})</span>}
        </span>
      </td>
      {filas!.map((f, i) => (
        <td key={f.periodo_inicio} className={cn(celdaBase, "font-bold", clase, esHoy(f) && colHoy)}>
          {num(valores[i])}
        </td>
      ))}
      <td className={cn(celdaBase, "font-bold bg-surface-container-low/60", clase)}>{extra?.totalFila != null ? num(extra.totalFila) : ""}</td>
    </tr>
  );

  const filaElemento = (e: Elemento) => (
    <tr key={e.clave} className="border-t border-outline-variant/10 hover:bg-surface-container-low/40">
      <td className={cn(sticky, "px-4 py-1.5 pl-9 max-w-[280px]")}>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-primary truncate" title={e.concepto}>
            {e.concepto}
          </span>
          <span className="text-[10px] text-on-surface-variant truncate" title={e.detalle}>
            <span className="font-bold uppercase text-[9px] text-outline">{origenes[e.origen] ?? e.origen}</span>
            {e.detalle && ` • ${e.detalle}`}
          </span>
        </div>
      </td>
      {filas!.map((f, i) => (
        <td
          key={f.periodo_inicio}
          title={e.fechas[i].length ? e.fechas[i].join(", ") : undefined}
          className={cn(celdaBase, "text-xs", e.valores[i] < 0 ? "text-error" : "text-on-tertiary-container", esHoy(f) && colHoy)}
        >
          {num(e.valores[i])}
        </td>
      ))}
      <td className={cn(celdaBase, "text-xs font-bold bg-surface-container-low/60", e.total < 0 ? "text-error" : "text-on-tertiary-container")}>{num(e.total)}</td>
    </tr>
  );

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-outline-variant/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-primary">Cash Flow Horizontal • Detalle por Elemento</h3>
          <p className="text-xs text-on-surface-variant">
            Una columna por período y una fila por cada cobro, pago, cheque o egreso. Hasta ayer, movimientos reales; desde hoy, lo pendiente (los vencidos se
            proyectan a hoy). Importes en ARS sin decimales; USD al TC actual. Pasá el mouse por una celda para ver las fechas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={periodo} onChange={onPeriodo} options={opciones} />
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-outline" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar elementos…"
              className="w-full h-9 pl-8 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none"
            />
          </div>
          <button
            onClick={exportar}
            disabled={!grilla}
            className="inline-flex items-center gap-2 px-3 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4 text-outline" />
            Excel
          </button>
        </div>
      </div>
      <ErrorBanner message={movs.error} />
      {!filas || !grilla ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="border-collapse text-left min-w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-surface-container-low text-[10px] font-bold text-outline uppercase tracking-wider">
                <th className="sticky left-0 z-30 bg-surface-container-low px-4 py-3 min-w-[240px]">Concepto</th>
                {filas.map((f) => (
                  <th key={f.periodo_inicio} className={cn("px-3 py-2 text-right whitespace-nowrap min-w-[110px] align-bottom", esHoy(f) && "bg-secondary-fixed/50")}>
                    <div className={cn("text-xs normal-case tracking-normal", esHoy(f) ? "text-secondary" : "text-primary")}>{etiqueta(f.periodo_inicio)}</div>
                    {periodo !== "day" && (
                      <div className="text-[9px] font-medium normal-case tracking-normal">
                        {fechaCorta(f.periodo_inicio)} al {fechaCorta(f.periodo_fin)}
                      </div>
                    )}
                    <div className={cn("text-[9px]", f.proyectado ? "text-secondary" : "text-outline")}>{esHoy(f) ? "Hoy" : f.proyectado ? "Proyectado" : "Real"}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right bg-surface-container-high/60 min-w-[120px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {filaTotales("Saldo inicial", filas.map((f) => f.saldo_inicial), "text-on-surface-variant")}
              {filaTotales("Ingresos", grilla.totIng, "text-on-tertiary-container", {
                onClick: () => setAbiertos((a) => ({ ...a, ingresos: !a.ingresos })),
                abierto: abiertos.ingresos,
                cantidad: grilla.ingresos.length,
                totalFila: total(grilla.totIng),
              })}
              {abiertos.ingresos && grilla.ingresos.map(filaElemento)}
              {filaTotales("Egresos", grilla.totEgr, "text-error", {
                onClick: () => setAbiertos((a) => ({ ...a, egresos: !a.egresos })),
                abierto: abiertos.egresos,
                cantidad: grilla.egresos.length,
                totalFila: total(grilla.totEgr),
              })}
              {abiertos.egresos && grilla.egresos.map(filaElemento)}
              {filaTotales("Flujo neto", filas.map((f) => f.neto), "text-primary", { totalFila: total(filas.map((f) => f.neto)) })}
              <tr className="border-t-2 border-secondary/30 bg-secondary-fixed/10">
                <td className={cn(sticky, "px-4 py-3 font-bold text-sm text-secondary bg-secondary-fixed/10")}>Saldo final</td>
                {filas.map((f) => (
                  <td key={f.periodo_inicio} className={cn(celdaBase, "font-bold text-sm", f.saldo_final < 0 ? "text-error" : "text-secondary", esHoy(f) && colHoy)}>
                    {entero.format(f.saldo_final)}
                  </td>
                ))}
                <td className={cn(celdaBase, "bg-surface-container-low/60")} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {busqueda && (
        <p className="px-6 py-2 text-[10px] text-outline italic">Con filtro: los totales de ingresos y egresos suman solo los elementos visibles; saldos y flujo neto son los del período completo.</p>
      )}
    </div>
  );
}
