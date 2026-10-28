import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, PieChart } from "lucide-react";
import { cn } from "../lib/utils";
import { supabase, check, type Row } from "../lib/supabase";
import { useData } from "../lib/useData";
import { fecha, hoyISO, money, porcentaje, sumarDias, sumarMeses } from "../lib/format";
import { ErrorBanner, Loading, Segmented } from "./ui";
import { useDetalle, tarjetaClickeable } from "./Detalle";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesLargo = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type Periodo = "mes" | "mes_anterior" | "anio";
type Egreso = Pick<Row<"v_egresos">, "id" | "fecha" | "concepto" | "proveedor" | "categoria" | "categoria_color" | "cuenta" | "medio" | "cheque_numero" | "importe_ars">;
type Fila = { categoria: string; color: string; total: number; comparativo: number; egresos: Egreso[] };

/** Egresos por categoría (importes en ARS al TC de cada egreso, igual que en el módulo Egresos). */
export function ReporteEgresos() {
  const mesActual = hoyISO().slice(0, 8) + "01";
  const finMes = sumarDias(sumarMeses(mesActual, 1), -1);
  // 12 meses + 2 anteriores para los comparativos de "mes anterior"
  const desde = sumarMeses(mesActual, -13);

  const { data, loading, error } = useData(
    async () =>
      check(
        await supabase
          .from("v_egresos")
          .select("id, fecha, concepto, proveedor, categoria, categoria_color, cuenta, medio, cheque_numero, importe_ars")
          .gte("fecha", desde)
          .lte("fecha", finMes)
          .order("fecha"),
      ),
    [desde, finMes],
  );

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const detalle = useDetalle();

  // Rango elegido y rango con el que se compara (mes contra el mes previo; 12 meses sin comparativo)
  const r = useMemo(() => {
    if (periodo === "anio") return { ini: sumarMeses(mesActual, -11), fin: finMes, titulo: `${mesLargo(sumarMeses(mesActual, -11))} a ${mesLargo(mesActual)}`, comp: null };
    const ini = periodo === "mes" ? mesActual : sumarMeses(mesActual, -1);
    const compIni = sumarMeses(ini, -1);
    return { ini, fin: sumarDias(sumarMeses(ini, 1), -1), titulo: mesLargo(ini), comp: { ini: compIni, fin: sumarDias(ini, -1), titulo: mesLargo(compIni) } };
  }, [periodo, mesActual, finMes]);

  const reporte = useMemo(() => {
    const filas = new Map<string, Fila>();
    for (const e of data ?? []) {
      const f = e.fecha ?? "";
      const enPeriodo = f >= r.ini && f <= r.fin;
      const enComp = r.comp && f >= r.comp.ini && f <= r.comp.fin;
      if (!enPeriodo && !enComp) continue;
      const k = e.categoria ?? "Sin categoría";
      const fila = filas.get(k) ?? { categoria: k, color: e.categoria_color ?? "#75777D", total: 0, comparativo: 0, egresos: [] };
      if (enPeriodo) {
        fila.total += e.importe_ars ?? 0;
        fila.egresos.push(e);
      } else fila.comparativo += e.importe_ars ?? 0;
      filas.set(k, fila);
    }
    const lista = [...filas.values()].sort((a, b) => b.total - a.total || b.comparativo - a.comparativo);
    return { lista, total: lista.reduce((s, x) => s + x.total, 0), comparativo: lista.reduce((s, x) => s + x.comparativo, 0) };
  }, [data, r]);

  const meses = periodo === "anio" ? 12 : 1;

  function verEgresos(titulo: string, egresos: Egreso[]) {
    detalle.abrir<Egreso>({
      titulo,
      subtitulo: `${r.titulo} (${fecha(r.ini)} al ${fecha(r.fin)}) • ARS al TC de cada egreso`,
      filas: [...egresos].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")),
      columnas: [
        { titulo: "Fecha", valor: (e) => fecha(e.fecha) },
        { titulo: "Concepto", valor: (e) => <strong className="text-primary">{e.concepto}</strong> },
        { titulo: "Proveedor", valor: (e) => e.proveedor ?? "—" },
        { titulo: "Categoría", valor: (e) => e.categoria },
        { titulo: "Medio", valor: (e) => (e.medio === "cheque_endosado" ? `Cheque #${e.cheque_numero}` : e.cuenta) },
        { titulo: "Importe ARS", valor: (e) => money(e.importe_ars), alinear: "right" },
      ],
      total: money(egresos.reduce((s, e) => s + (e.importe_ars ?? 0), 0)),
    });
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold text-error uppercase tracking-widest">Operativo</span>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <PieChart className="w-5 h-5 text-error" /> Egresos por Categoría
          </h2>
          <p className="text-xs text-on-surface-variant">Egresos registrados por fecha. En ARS; USD al TC de cada egreso. Click en una categoría para ver el detalle.</p>
        </div>
        <Segmented
          value={periodo}
          onChange={setPeriodo}
          options={[
            { value: "mes", label: "Este mes" },
            { value: "mes_anterior", label: "Mes anterior" },
            { value: "anio", label: "12 meses" },
          ]}
        />
      </div>

      {detalle.modal}
      <ErrorBanner message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => verEgresos(`Egresos ${r.titulo}`, reporte.lista.flatMap((f) => f.egresos))}
              title="Ver detalle"
              className={cn("p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10", tarjetaClickeable)}
            >
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Egresos {r.titulo}</span>
              <div className="text-xl font-bold font-numeric text-error mt-1">{money(reporte.total)}</div>
              <span className="text-[10px] text-on-surface-variant">
                {reporte.lista.reduce((s, f) => s + f.egresos.length, 0)} egresos • {reporte.lista.filter((f) => f.total > 0).length} categorías • ver detalle
              </span>
            </div>
            {r.comp ? (
              <Variacion titulo={`vs ${r.comp.titulo}`} actual={reporte.total} base={reporte.comparativo} />
            ) : (
              <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
                <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Promedio mensual</span>
                <div className="text-xl font-bold font-numeric text-primary mt-1">{money(reporte.total / 12)}</div>
                <span className="text-[10px] text-on-surface-variant">últimos 12 meses</span>
              </div>
            )}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Mayor categoría</span>
              <div className="text-xl font-bold text-primary mt-1 truncate">{reporte.lista[0]?.total ? reporte.lista[0].categoria : "—"}</div>
              <span className="text-[10px] text-on-surface-variant font-numeric">
                {reporte.lista[0]?.total ? `${money(reporte.lista[0].total)} • ${porcentaje(reporte.lista[0].total, reporte.total)}% del total` : "Sin egresos en el período"}
              </span>
            </div>
          </div>

          {reporte.lista.length === 0 ? (
            <p className="text-xs text-outline py-4">Sin egresos en el período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="py-2 pr-4">Categoría</th>
                    <th className="py-2 px-3 text-right">{periodo === "anio" ? "12 meses" : r.titulo}</th>
                    <th className="py-2 pl-4 sm:w-48">% del total</th>
                    {r.comp ? (
                      <>
                        <th className="py-2 px-3 text-right whitespace-nowrap">{r.comp.titulo}</th>
                        <th className="py-2 pl-3 text-right">Variación</th>
                      </>
                    ) : (
                      <th className="py-2 pl-3 text-right whitespace-nowrap">Prom. mensual</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {reporte.lista.map((f) => {
                    const pct = porcentaje(f.total, reporte.total);
                    return (
                      <tr
                        key={f.categoria}
                        onClick={() => f.egresos.length && verEgresos(`${f.categoria} • ${r.titulo}`, f.egresos)}
                        title={f.egresos.length ? "Ver detalle" : undefined}
                        className={cn(f.egresos.length > 0 && "cursor-pointer hover:bg-surface-container-low")}
                      >
                        <td className="py-2 pr-4 font-bold text-primary whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ backgroundColor: f.color }} />
                          {f.categoria}
                        </td>
                        <td className="py-2 px-3 text-right font-numeric font-bold whitespace-nowrap">{f.total ? money(f.total) : "—"}</td>
                        <td className="py-2 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="hidden sm:block flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: f.color }} />
                            </div>
                            <span className="text-[10px] font-bold font-numeric text-on-surface-variant w-10 text-right ml-auto">{pct}%</span>
                          </div>
                        </td>
                        {r.comp ? (
                          <>
                            <td className="py-2 px-3 text-right font-numeric text-on-surface-variant whitespace-nowrap">{f.comparativo ? money(f.comparativo) : "—"}</td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap">
                              <Delta actual={f.total} base={f.comparativo} />
                            </td>
                          </>
                        ) : (
                          <td className="py-2 pl-3 text-right font-numeric text-on-surface-variant whitespace-nowrap">{money(f.total / meses)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-outline-variant/20 font-bold">
                    <td className="py-2 pr-4 text-primary">Total</td>
                    <td className="py-2 px-3 text-right font-numeric text-error whitespace-nowrap">{money(reporte.total)}</td>
                    <td />
                    {r.comp ? (
                      <>
                        <td className="py-2 px-3 text-right font-numeric whitespace-nowrap">{money(reporte.comparativo)}</td>
                        <td className="py-2 pl-3 text-right whitespace-nowrap">
                          <Delta actual={reporte.total} base={reporte.comparativo} />
                        </td>
                      </>
                    ) : (
                      <td className="py-2 pl-3 text-right font-numeric whitespace-nowrap">{money(reporte.total / meses)}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Variación porcentual de un gasto: subir es malo (rojo), bajar es bueno (verde). */
function Delta({ actual, base, grande = false }: { actual: number; base: number; grande?: boolean }) {
  if (!base) return <span className="text-[10px] text-outline">{actual ? "nuevo" : "—"}</span>;
  const pct = Math.round(((actual - base) / base) * 1000) / 10;
  const Icono = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-bold font-numeric", grande ? "text-xl" : "text-[10px]", pct > 0 ? "text-error" : pct < 0 ? "text-on-tertiary-container" : "text-outline")}>
      <Icono className={grande ? "w-5 h-5" : "w-3 h-3"} />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function Variacion({ titulo, actual, base }: { titulo: string; actual: number; base: number }) {
  const dif = actual - base;
  return (
    <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
      <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{titulo}</span>
      {base === 0 ? (
        <>
          <div className="text-xl font-bold text-outline mt-1">—</div>
          <span className="text-[10px] text-on-surface-variant">Sin egresos en ese mes para comparar</span>
        </>
      ) : (
        <>
          <div className="mt-1">
            <Delta actual={actual} base={base} grande />
          </div>
          <span className="text-[10px] text-on-surface-variant font-numeric">
            {dif >= 0 ? "+" : ""}
            {money(dif)} • base {money(base)}
          </span>
        </>
      )}
    </div>
  );
}
