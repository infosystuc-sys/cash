import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus, Table2 } from "lucide-react";
import { cn } from "../lib/utils";
import { supabase, check } from "../lib/supabase";
import { useData } from "../lib/useData";
import { hoyISO, money, porcentaje, sumarMeses } from "../lib/format";
import { ErrorBanner, Loading, Segmented } from "./ui";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesCorto = (iso: string) => `${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const mesLargo = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

type Mes = { mes: string; sistema: number; historico: number; total: number; cobrado: number };

/** Reporte de ventas: facturas del sistema (por fecha de factura) + ventas históricas, en ARS (USD al TC actual). */
export function ReporteVentas({ tc }: { tc: number }) {
  const mesActual = hoyISO().slice(0, 8) + "01";
  // 12 meses del gráfico + el mismo mes del año anterior para el comparativo
  const desde = sumarMeses(mesActual, -12);

  const { data, loading, error } = useData(
    async () => check(await supabase.from("v_ventas_mensuales").select("*").gte("mes", desde).lte("mes", mesActual)),
    [desde, mesActual],
  );

  const [periodoTipos, setPeriodoTipos] = useState<"mes" | "anio">("mes");
  const [verTabla, setVerTabla] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const ars = (moneda: string | null, v: number | null) => (moneda === "USD" ? (v ?? 0) * tc : v ?? 0);

  const meses = useMemo(() => {
    const m = new Map<string, Mes>();
    for (let k = 12; k >= 0; k--) {
      const iso = sumarMeses(mesActual, -k);
      m.set(iso, { mes: iso, sistema: 0, historico: 0, total: 0, cobrado: 0 });
    }
    (data ?? []).forEach((r) => {
      const x = m.get(r.mes ?? "");
      if (!x) return;
      const v = ars(r.moneda, r.importe);
      if (r.origen === "historico") x.historico += v;
      else {
        x.sistema += v;
        x.cobrado += ars(r.moneda, r.cobrado);
      }
      x.total += v;
    });
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tc, mesActual]);

  const actual = meses[meses.length - 1];
  const anterior = meses[meses.length - 2];
  const anioAnterior = meses[0];
  const grafico = meses.slice(1); // últimos 12 meses, incluido el actual
  const max = Math.max(1, ...grafico.map((m) => m.total));
  const escala = escalaEje(max);

  const porTipo = useMemo(() => {
    const t = new Map<string, number>();
    (data ?? [])
      .filter((r) => (periodoTipos === "mes" ? r.mes === mesActual : (r.mes ?? "") > anioAnterior.mes))
      .forEach((r) => t.set(r.tipo_ingreso ?? "Sin tipo", (t.get(r.tipo_ingreso ?? "Sin tipo") ?? 0) + ars(r.moneda, r.importe)));
    const lista = [...t.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total);
    return { lista, total: lista.reduce((s, x) => s + x.total, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, periodoTipos, tc]);

  const conFacturas = grafico.filter((m) => m.sistema > 0).reverse().slice(0, 6);
  const hayHistorico = grafico.some((m) => m.historico > 0);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Comercial</span>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-secondary" /> Reporte de Ventas
          </h2>
          <p className="text-xs text-on-surface-variant">
            Facturas de Ingresos por fecha de factura + ventas históricas cargadas en Configuración. En ARS; USD al TC actual.
          </p>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          {/* Comparativos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Tile titulo={`Ventas ${mesLargo(mesActual)}`} valor={money(actual.total)} detalle={`${mesLargo(mesActual)} en curso`} />
            <Comparativo titulo={`vs ${mesLargo(anterior.mes)}`} actual={actual.total} base={anterior.total} />
            <Comparativo titulo={`vs ${mesLargo(anioAnterior.mes)}`} actual={actual.total} base={anioAnterior.total} />
          </div>

          {/* Ventas por mes */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-primary">Ventas por mes • últimos 12 meses</h3>
              <div className="flex items-center gap-4">
                {hayHistorico && (
                  <div className="flex items-center gap-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-secondary" /> Facturado en el sistema
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-secondary/40 rayado" /> Histórico cargado
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setVerTabla((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-secondary hover:underline"
                  title={verTabla ? "Ver gráfico" : "Ver como tabla"}
                >
                  {verTabla ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                  {verTabla ? "Gráfico" : "Tabla"}
                </button>
              </div>
            </div>

            {verTabla ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest">
                      <th className="px-4 py-2">Mes</th>
                      <th className="px-4 py-2 text-right">Sistema</th>
                      <th className="px-4 py-2 text-right">Histórico</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {[...grafico].reverse().map((m) => (
                      <tr key={m.mes}>
                        <td className="px-4 py-2 font-bold text-primary">{mesLargo(m.mes)}</td>
                        <td className="px-4 py-2 text-right font-numeric">{m.sistema ? money(m.sistema) : "—"}</td>
                        <td className="px-4 py-2 text-right font-numeric">{m.historico ? money(m.historico) : "—"}</td>
                        <td className="px-4 py-2 text-right font-numeric font-bold">{money(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* Eje Y */}
                <div className="relative w-12 h-56 shrink-0 text-[9px] text-outline font-numeric">
                  {escala.map((v) => (
                    <span key={v} className="absolute right-1 -translate-y-1/2" style={{ bottom: `${(v / escala[escala.length - 1]) * 100}%` }}>
                      {compacto.format(v)}
                    </span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="relative h-56">
                    {escala.map((v) => (
                      <div
                        key={v}
                        className={cn("absolute inset-x-0 border-t", v === 0 ? "border-outline-variant/60" : "border-dashed border-outline-variant/25")}
                        style={{ bottom: `${(v / escala[escala.length - 1]) * 100}%` }}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-end gap-[2px]">
                      {grafico.map((m) => {
                        const tope = escala[escala.length - 1];
                        const hS = (m.sistema / tope) * 100;
                        const hH = (m.historico / tope) * 100;
                        const esActual = m.mes === mesActual;
                        const activo = hover === m.mes;
                        return (
                          <div
                            key={m.mes}
                            className="relative flex-1 h-full flex flex-col justify-end items-center cursor-default"
                            onMouseEnter={() => setHover(m.mes)}
                            onMouseLeave={() => setHover(null)}
                          >
                            {(esActual || m.total === max) && m.total > 0 && (
                              <span className="text-[9px] font-bold font-numeric text-on-surface-variant mb-1 whitespace-nowrap">{compacto.format(m.total)}</span>
                            )}
                            <div className={cn("w-full max-w-10 flex flex-col gap-[2px] transition-opacity", hover && !activo && "opacity-50")}>
                              {m.historico > 0 && <div className="w-full bg-secondary/40 rayado rounded-t" style={{ height: `${(hH / 100) * 224}px` }} />}
                              {m.sistema > 0 && (
                                <div className={cn("w-full bg-secondary", m.historico > 0 ? "" : "rounded-t")} style={{ height: `${(hS / 100) * 224}px` }} />
                              )}
                            </div>
                            {activo && (
                              <div className="absolute bottom-full mb-2 z-10 px-3 py-2 rounded-lg bg-primary text-on-primary text-[10px] shadow-lg whitespace-nowrap pointer-events-none">
                                <div className="font-bold">{mesLargo(m.mes)}</div>
                                <div className="font-numeric">Total {money(m.total)}</div>
                                {m.historico > 0 && (
                                  <>
                                    <div className="font-numeric opacity-80">Sistema {money(m.sistema)}</div>
                                    <div className="font-numeric opacity-80">Histórico {money(m.historico)}</div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-[2px] mt-1.5">
                    {grafico.map((m) => (
                      <span key={m.mes} className={cn("flex-1 text-center text-[9px] font-bold", m.mes === mesActual ? "text-secondary" : "text-outline")}>
                        {mesCorto(m.mes)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Por tipo de ingreso */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-primary">Por tipo de ingreso</h3>
                <Segmented
                  value={periodoTipos}
                  onChange={setPeriodoTipos}
                  options={[
                    { value: "mes", label: "Este mes" },
                    { value: "anio", label: "12 meses" },
                  ]}
                />
              </div>
              {porTipo.lista.length === 0 && <p className="text-xs text-outline py-4">Sin ventas en el período.</p>}
              <div className="space-y-2.5">
                {porTipo.lista.map((t) => (
                  <div key={t.tipo} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-on-surface">{t.tipo}</span>
                      <span className="font-numeric">
                        <strong className="text-primary">{money(t.total)}</strong>
                        <span className="text-on-surface-variant ml-2">{porcentaje(t.total, porTipo.total)}%</span>
                      </span>
                    </div>
                    <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-secondary rounded-full" style={{ width: `${porTipo.total ? (t.total / porTipo.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facturado vs cobrado */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-primary">Facturado vs cobrado</h3>
                <p className="text-[11px] text-on-surface-variant">Facturas del sistema de cada mes y cuánto se cobró de ellas a hoy.</p>
              </div>
              {conFacturas.length === 0 ? (
                <p className="text-xs text-outline py-4">Todavía no hay facturas cargadas en Ingresos.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                      <th className="py-2">Mes</th>
                      <th className="py-2 text-right">Facturado</th>
                      <th className="py-2 text-right">Cobrado</th>
                      <th className="py-2 pl-4 w-32">% cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {conFacturas.map((m) => {
                      const pct = porcentaje(m.cobrado, m.sistema);
                      return (
                        <tr key={m.mes}>
                          <td className="py-2 font-bold text-primary whitespace-nowrap">{mesLargo(m.mes)}</td>
                          <td className="py-2 text-right font-numeric">{money(m.sistema)}</td>
                          <td className="py-2 text-right font-numeric">{money(m.cobrado)}</td>
                          <td className="py-2 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                                <div className="h-full bg-on-tertiary-container rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-[10px] font-bold font-numeric text-on-surface-variant w-10 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Marcas del eje Y: 0 y 4 pasos "redondos" que cubren el máximo. */
function escalaEje(max: number) {
  const bruto = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? bruto;
  return [0, paso, paso * 2, paso * 3, paso * 4];
}

function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
      <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{titulo}</span>
      <div className="text-xl font-bold font-numeric text-primary mt-1">{valor}</div>
      <span className="text-[10px] text-on-surface-variant">{detalle}</span>
    </div>
  );
}

function Comparativo({ titulo, actual, base }: { titulo: string; actual: number; base: number }) {
  const dif = actual - base;
  const pct = base ? Math.round((dif / base) * 1000) / 10 : null;
  const Icono = dif > 0 ? ArrowUpRight : dif < 0 ? ArrowDownRight : Minus;
  return (
    <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
      <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{titulo}</span>
      {base === 0 ? (
        <>
          <div className="text-xl font-bold text-outline mt-1">—</div>
          <span className="text-[10px] text-on-surface-variant">Sin ventas en ese mes para comparar</span>
        </>
      ) : (
        <>
          <div className={cn("text-xl font-bold font-numeric mt-1 flex items-center gap-1", dif > 0 ? "text-on-tertiary-container" : dif < 0 ? "text-error" : "text-primary")}>
            <Icono className="w-5 h-5" />
            {pct! > 0 ? "+" : ""}
            {pct}%
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
