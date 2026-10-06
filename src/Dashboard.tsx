import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Calendar, TrendingUp, BadgeCheck, AlertTriangle, Terminal, History, Landmark, DollarSign, Receipt, Wallet, TrendingDown } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { fecha, fechaCorta, hoyISO, money, signedMoney, sumarDias, sumarMeses, type Moneda } from "./lib/format";
import { ErrorBanner, Loading, Segmented } from "./components/ui";
import { useDetalle, tarjetaClickeable, type ColumnaDetalle } from "./components/Detalle";

type Periodo = "day" | "week" | "month";

const RANGOS: Record<Periodo, { atras: (h: string) => string; adelante: (h: string) => string; label: string }> = {
  day: { atras: (h) => sumarDias(h, -7), adelante: (h) => sumarDias(h, 21), label: "Diario" },
  week: { atras: (h) => sumarDias(h, -21), adelante: (h) => sumarDias(h, 35), label: "Semanal" },
  month: { atras: (h) => sumarMeses(h, -3), adelante: (h) => sumarMeses(h, 3), label: "Mensual" },
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function semanaISO(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86_400_000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
}

function etiquetaPeriodo(p: Periodo, ini: string) {
  if (p === "day") return fecha(ini);
  if (p === "week") return `Semana ${semanaISO(ini)}`;
  return `${MESES[Number(ini.slice(5, 7)) - 1]} ${ini.slice(0, 4)}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const detalle = useDetalle();
  const [periodo, setPeriodo] = useState<Periodo>("week");
  const hoy = hoyISO();
  const desde = RANGOS[periodo].atras(hoy);
  const hasta = RANGOS[periodo].adelante(hoy);
  const en30 = sumarDias(hoy, 30);

  const { data, loading, error } = useData(async () => {
    const [cuentas, cheques, cobros, pagos, tc] = await Promise.all([
      supabase.from("v_cuentas_saldo").select("id, nombre, tipo, moneda, saldo, saldo_ars").eq("activa", true).order("id"),
      supabase.from("cheques").select("importe").eq("estado", "en_cartera"),
      supabase
        .from("v_ingreso_vencimientos")
        .select("id, fecha_vencimiento, saldo, moneda, estado, medio_previsto, cuentas(nombre), ingresos(descripcion, clientes(razon_social), tipos_ingreso(nombre))")
        .gt("saldo", 0)
        .lte("fecha_vencimiento", en30)
        .order("fecha_vencimiento"),
      supabase
        .from("v_deuda_cuotas")
        .select("id, numero, fecha_vencimiento, saldo, moneda, estado, deudas(concepto, proveedores(razon_social), categorias_egreso(nombre))")
        .gt("saldo", 0)
        .lte("fecha_vencimiento", en30)
        .order("fecha_vencimiento"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return {
      cuentas: check(cuentas),
      cartera: check(cheques),
      cobros: check(cobros),
      pagos: check(pagos),
      tc: tc.data?.venta ?? 0,
    };
  });

  const flujo = useData(async () => check(await supabase.rpc("fn_cashflow", { p_desde: desde, p_hasta: hasta, p_periodo: periodo })), [desde, hasta, periodo]);

  const k = useMemo(() => {
    if (!data) return null;
    const ars = (m: string | null, v: number | null) => (m === "USD" ? (v ?? 0) * data.tc : v ?? 0);
    const cuentas = data.cuentas.reduce((s, c) => s + (c.saldo_ars ?? 0), 0);
    const cartera = data.cartera.reduce((s, c) => s + c.importe, 0);
    const cobrar = data.cobros.reduce((s, v) => s + ars(v.moneda, v.saldo), 0);
    const pagar = data.pagos.reduce((s, q) => s + ars(q.moneda, q.saldo), 0);
    const consolidado = cuentas + cartera;
    return { cuentas, cartera, consolidado, cobrar, pagar, proyectado: consolidado + cobrar - pagar };
  }, [data]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Módulo de Tesorería</span>
            <span className="text-outline text-xs">•</span>
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Buenos Aires Hub</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Tablero de Cash Flow</h1>
          <p className="text-sm text-on-surface-variant">Proyección y consolidación de tesorería en pesos argentinos ($ ARS)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={periodo}
            onChange={setPeriodo}
            options={(Object.keys(RANGOS) as Periodo[]).map((p) => ({ value: p, label: RANGOS[p].label }))}
          />

          <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 text-outline" />
            <span className="text-xs font-bold text-on-surface">
              {fecha(desde)} al {fecha(hasta)}
            </span>
          </div>

          <button
            onClick={() => navigate("/ingresos?nuevo=1")}
            className="flex items-center gap-2 bg-secondary text-on-secondary px-5 py-2 rounded-lg text-xs font-bold hover:bg-secondary-container transition-all shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            Nuevo Ingreso
          </button>
          <button
            onClick={() => navigate("/egresos?nuevo=1")}
            className="flex items-center gap-2 bg-surface-container-lowest text-primary border border-outline-variant/30 px-5 py-2 rounded-lg text-xs font-bold hover:bg-surface-container-low transition-all shadow-sm"
          >
            <TrendingDown className="w-4 h-4" />
            Nuevo Egreso
          </button>
        </div>
      </div>

      <ErrorBanner message={error || flujo.error} />
      {detalle.modal}
      {loading && !data && <Loading />}

      {data && k && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <KpiCard
              title="Saldo Total Consolidado"
              value={money(k.consolidado)}
              tag={`${data.cuentas.length} cuentas`}
              subtitle="Cuentas + cartera de cheques"
              stats={`Cartera ${money(k.cartera)}`}
              onClick={() =>
                detalle.abrir<FilaSaldo>({
                  titulo: "Saldo Total Consolidado",
                  subtitulo: "Saldo de cada cuenta (USD al TC actual) y cheques en cartera",
                  cargar: async () => {
                    const cheques = check(
                      await supabase.from("v_cheques").select("numero, banco_emisor, importe, fecha_pago, cliente, librador").eq("estado", "en_cartera").order("fecha_pago"),
                    );
                    return [
                      ...data.cuentas.map((c) => ({
                        tipo: "Cuenta",
                        nombre: c.nombre ?? "",
                        detalle: c.moneda === "USD" ? `${money(c.saldo, "USD")} × TC ${money(data.tc)}` : "",
                        importe: c.saldo_ars ?? 0,
                      })),
                      ...cheques.map((ch) => ({
                        tipo: "Cheque en cartera",
                        nombre: `#${ch.numero} ${ch.banco_emisor}`,
                        detalle: `${ch.cliente ?? ch.librador ?? ""} • pago ${fecha(ch.fecha_pago)}`,
                        importe: ch.importe ?? 0,
                      })),
                    ];
                  },
                  columnas: colsSaldo,
                  total: money(k.consolidado),
                })
              }
            />
            <KpiCard
              title="A Cobrar (Próx. 30 días)"
              value={money(k.cobrar)}
              tag={`${data.cobros.length} cobros`}
              subtitle="Vencimientos facturados (incl. vencidos)"
              stats={`${data.cobros.filter((c) => c.estado === "vencido").length} vencidos`}
              statsColor="text-error"
              onClick={() =>
                detalle.abrir({
                  titulo: "A Cobrar (Próx. 30 días)",
                  subtitulo: `Vencimientos pendientes hasta el ${fecha(en30)}, incluidos los vencidos`,
                  filas: data.cobros,
                  columnas: [
                    { titulo: "Vencimiento", valor: (v) => <span className={v.estado === "vencido" ? "text-error font-bold" : ""}>{fecha(v.fecha_vencimiento)}</span> },
                    { titulo: "Cliente", valor: (v) => <strong className="text-primary">{v.ingresos?.clientes?.razon_social}</strong> },
                    { titulo: "Descripción", valor: (v) => v.ingresos?.descripcion },
                    { titulo: "Saldo", valor: (v) => money(v.moneda === "USD" ? (v.saldo ?? 0) * data.tc : v.saldo, "ARS"), alinear: "right" },
                  ],
                  total: money(k.cobrar),
                })
              }
            />
            <KpiCard
              title="A Pagar (Próx. 30 días)"
              value={money(k.pagar)}
              tag={`${data.pagos.length} vencimientos`}
              tagColor="bg-error-container text-error"
              subtitle="Cuotas de deudas pendientes"
              stats={data.tc ? `TC ${money(data.tc)}` : "Sin TC"}
              onClick={() =>
                detalle.abrir({
                  titulo: "A Pagar (Próx. 30 días)",
                  subtitulo: `Cuotas de deudas pendientes hasta el ${fecha(en30)}, incluidas las vencidas`,
                  filas: data.pagos,
                  columnas: [
                    { titulo: "Vencimiento", valor: (q) => <span className={q.estado === "vencida" ? "text-error font-bold" : ""}>{fecha(q.fecha_vencimiento)}</span> },
                    { titulo: "Acreedor", valor: (q) => <strong className="text-primary">{q.deudas?.proveedores?.razon_social}</strong> },
                    { titulo: "Concepto", valor: (q) => `${q.deudas?.concepto ?? ""} • cuota ${q.numero}` },
                    { titulo: "Saldo", valor: (q) => money(q.moneda === "USD" ? (q.saldo ?? 0) * data.tc : q.saldo, "ARS"), alinear: "right" },
                  ],
                  total: money(k.pagar),
                })
              }
            />
            <div
              title="Ver detalle"
              onClick={() =>
                detalle.abrir<FilaSaldo>({
                  titulo: "Saldo Proyectado 30 días",
                  subtitulo: "Saldo actual + cobros previstos − pagos previstos",
                  filas: [
                    { tipo: "Saldo actual", nombre: "Cuentas + cartera de cheques", detalle: "", importe: k.consolidado },
                    { tipo: "+ Cobros", nombre: "A cobrar próximos 30 días", detalle: `${data.cobros.length} vencimientos`, importe: k.cobrar },
                    { tipo: "− Pagos", nombre: "A pagar próximos 30 días", detalle: `${data.pagos.length} cuotas`, importe: -k.pagar },
                  ],
                  columnas: colsSaldo,
                  total: money(k.proyectado),
                })
              }
              className={cn("bg-primary text-on-primary rounded-xl p-6 shadow-md flex flex-col justify-between relative overflow-hidden transition-all", tarjetaClickeable)}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-on-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-primary-fixed uppercase tracking-widest">Saldo Proyectado 30d</span>
                <div className="px-2 py-0.5 rounded bg-on-primary/10 text-[9px] font-bold text-tertiary-fixed flex items-center gap-1 border border-on-primary/10">
                  {k.proyectado >= 0 ? <BadgeCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {k.proyectado >= 0 ? "Solvencia Positiva" : "Déficit proyectado"}
                </div>
              </div>
              <div className="text-2xl font-bold font-numeric tracking-tight">{money(k.proyectado)}</div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-on-primary/10 text-[10px]">
                <span className="text-primary-fixed/80">Saldo actual + Cobros - Pagos</span>
                <span className="font-bold text-secondary-fixed">{signedMoney(k.cobrar - k.pagar)} neto</span>
              </div>
            </div>
          </div>

          {/* Quick Entry Banner */}
          <div className="bg-surface-container-lowest border border-outline-variant/20 p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary border border-outline-variant/30">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <div className="font-bold text-primary text-sm">Emisión Rápida de Honorarios de Consultoría</div>
                <p className="text-xs text-on-surface-variant">Registrá la factura y su plan de vencimientos en un solo paso.</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/ingresos?nuevo=1")}
              className="px-4 py-1.5 bg-surface-container-high text-primary rounded-lg text-xs font-bold hover:bg-surface-container-highest transition-colors border border-outline-variant/30"
            >
              Nueva Factura de Servicios
            </button>
          </div>
        </>
      )}

      {/* Main Content: Chart and Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-lg font-bold text-primary">Evolución y Proyección de Flujo de Fondos ({RANGOS[periodo].label})</h2>
                <p className="text-xs text-on-surface-variant">Movimientos reales hasta hoy y vencimientos programados en adelante</p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm bg-on-tertiary-container" /> Ingresos
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm bg-error" /> Egresos
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-secondary rounded-full" /> Saldo
                </div>
              </div>
            </div>

            <div className="h-64 relative bg-surface-container-low/30 rounded-xl border border-outline-variant/10 p-4">
              {flujo.data ? <Grafico filas={flujo.data} /> : <Loading />}
            </div>

            <div className="flex items-center justify-between mt-4 text-[10px] text-outline font-medium italic">
              <span>* Períodos desde hoy proyectados con vencimientos a cobrar, cheques en cartera y cuotas de deuda</span>
              {flujo.data && (
                <div className="flex items-center gap-2 not-italic">
                  <span className="text-on-surface-variant font-bold uppercase tracking-wider">Máximo Proyectado:</span>
                  <span className="text-secondary font-numeric text-xs font-bold">{money(Math.max(...flujo.data.map((f) => f.saldo_final)))}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10">
              <h3 className="text-sm font-bold text-primary">Detalle de Movimientos por Período</h3>
              <p className="text-xs text-on-surface-variant">Consolidado en ARS; USD valuado al TC MEP actual</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest">
                    <th className="px-6 py-3">Período</th>
                    <th className="px-4 py-3 text-right">Saldo Inicial</th>
                    <th className="px-4 py-3 text-right">Ingresos</th>
                    <th className="px-4 py-3 text-right">Egresos</th>
                    <th className="px-4 py-3 text-right">Flujo Neto</th>
                    <th className="px-4 py-3 text-right">Saldo Final</th>
                    <th className="px-6 py-3 text-center">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 text-xs">
                  {flujo.data?.map((f) => {
                    const neg = f.neto < 0;
                    return (
                      <tr key={f.periodo_inicio} className={cn("hover:bg-surface-container-low/60 transition-colors", neg && "bg-error-container/5")}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className={cn("font-bold text-sm", neg ? "text-error" : "text-primary")}>{etiquetaPeriodo(periodo, f.periodo_inicio)}</span>
                            {periodo !== "day" && (
                              <span className="text-[10px] text-outline font-numeric">
                                {fechaCorta(f.periodo_inicio)} al {fechaCorta(f.periodo_fin)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-on-surface-variant font-numeric">{money(f.saldo_inicial)}</td>
                        <td className="px-4 py-4 text-right text-on-tertiary-container font-bold font-numeric">{signedMoney(f.ingresos)}</td>
                        <td className="px-4 py-4 text-right text-error font-bold font-numeric">{money(-f.egresos)}</td>
                        <td className={cn("px-4 py-4 text-right font-bold font-numeric", neg ? "text-error" : "text-on-tertiary-container")}>{signedMoney(f.neto)}</td>
                        <td className="px-4 py-4 text-right font-bold font-numeric text-primary">{money(f.saldo_final)}</td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                              f.proyectado ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container-high text-on-surface-variant",
                            )}
                          >
                            {f.proyectado ? "Proyectado" : "Real"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {data && k && (
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Tesorería Activa</span>
                  <h3 className="text-sm font-bold text-primary">Saldo por Cuenta</h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container text-secondary text-[9px] font-bold uppercase">Hoy</span>
              </div>
              <div className="space-y-2">
                {data.cuentas.map((c) => (
                  <AccountRow
                    key={c.id}
                    name={c.nombre ?? ""}
                    type={c.moneda === "USD" ? money(c.saldo, "USD") : c.tipo === "efectivo" ? "Efectivo ARS" : "Cuenta ARS"}
                    balance={c.saldo_ars != null ? money(c.saldo_ars) : "—"}
                    icon={c.moneda === "USD" ? "usd" : c.tipo === "efectivo" ? "cash" : "bank"}
                  />
                ))}
                <AccountRow name="Cartera de Cheques" type={`${data.cartera.length} cheques en cartera`} balance={money(k.cartera)} icon="cheque" />
              </div>
              <div className="mt-4 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
                <span className="text-xs font-bold text-primary">Consolidado Total ARS</span>
                <span className="text-sm font-bold text-secondary font-numeric">{money(k.consolidado)}</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-on-tertiary-container uppercase tracking-widest">Entradas Programadas</span>
                  <h3 className="text-sm font-bold text-primary">Próximos Cobros</h3>
                </div>
                <span className="text-[9px] font-bold text-outline uppercase">{data.cobros.filter((c) => c.estado === "vencido").length} vencidos</span>
              </div>
              <div className="space-y-3">
                {data.cobros.length === 0 && <p className="text-xs text-outline">Sin cobros en los próximos 30 días.</p>}
                {data.cobros.slice(0, 5).map((v) => (
                  <UpcomingItem
                    key={v.id}
                    date={fecha(v.fecha_vencimiento)}
                    vencido={v.estado === "vencido"}
                    category={v.ingresos?.tipos_ingreso?.nombre ?? ""}
                    client={v.ingresos?.clientes?.razon_social ?? ""}
                    amount={money(v.saldo, v.moneda as Moneda)}
                    method={v.cuentas?.nombre ? `${v.medio_previsto ?? "Transferencia"} ${v.cuentas.nombre}` : v.medio_previsto ?? "—"}
                  />
                ))}
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-error uppercase tracking-widest">Salidas Obligatorias</span>
                  <h3 className="text-sm font-bold text-primary">Próximos Pagos & Deudas</h3>
                </div>
              </div>
              <div className="space-y-3">
                {data.pagos.length === 0 && <p className="text-xs text-outline">Sin pagos en los próximos 30 días.</p>}
                {data.pagos.slice(0, 5).map((q) => (
                  <UpcomingItem
                    key={q.id}
                    date={fecha(q.fecha_vencimiento)}
                    vencido={q.estado === "vencida"}
                    category={q.deudas?.categorias_egreso?.nombre ?? ""}
                    client={q.deudas?.proveedores?.razon_social ?? ""}
                    amount={money(-(q.moneda === "USD" ? (q.saldo ?? 0) * data.tc : q.saldo ?? 0))}
                    usdValue={q.moneda === "USD" ? money(q.saldo, "USD") : undefined}
                    method={`${q.deudas?.concepto ?? ""} • cuota ${q.numero}`}
                    isExpense
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Grafico({ filas }: { filas: { periodo_inicio: string; ingresos: number; egresos: number; saldo_final: number; proyectado: boolean }[] }) {
  const W = 600;
  const H = 200;
  const pad = 10;
  const n = Math.max(filas.length, 1);
  const paso = (W - pad * 2) / n;
  const maxBarra = Math.max(1, ...filas.map((f) => Math.max(f.ingresos, f.egresos)));
  const saldos = filas.map((f) => f.saldo_final);
  const minS = Math.min(...saldos, 0);
  const maxS = Math.max(...saldos, 1);
  const yBarra = (v: number) => (v / maxBarra) * (H * 0.55);
  const ySaldo = (v: number) => H - pad - ((v - minS) / (maxS - minS || 1)) * (H - pad * 3);
  const xc = (i: number) => pad + paso * i + paso / 2;
  const ancho = Math.min(16, paso / 3);
  const linea = filas.map((f, i) => `${i ? "L" : "M"} ${xc(i)} ${ySaldo(f.saldo_final)}`).join(" ");
  const primerProy = filas.findIndex((f) => f.proyectado);

  return (
    <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0051d5" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0051d5" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[50, 100, 150].map((y) => (
        <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="currentColor" className="text-outline-variant/30" strokeWidth="1" strokeDasharray="4" />
      ))}
      {primerProy > 0 && <rect x={pad + paso * primerProy} y={0} width={W - pad - paso * primerProy} height={H} className="fill-secondary-fixed/20" />}
      {filas.map((f, i) => (
        <g key={f.periodo_inicio} opacity={f.proyectado ? 0.6 : 1}>
          <rect x={xc(i) - ancho - 1} y={H - pad - yBarra(f.ingresos)} width={ancho} height={yBarra(f.ingresos)} className="fill-on-tertiary-container" rx="2" />
          <rect x={xc(i) + 1} y={H - pad - yBarra(f.egresos)} width={ancho} height={yBarra(f.egresos)} className="fill-error" rx="2" />
        </g>
      ))}
      {filas.length > 0 && (
        <>
          <path d={`${linea} L ${xc(filas.length - 1)} ${H - pad} L ${xc(0)} ${H - pad} Z`} fill="url(#chartGradient)" />
          <path d={linea} fill="transparent" stroke="#0051d5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {filas.map((f, i) => (
        <circle key={f.periodo_inicio} cx={xc(i)} cy={ySaldo(f.saldo_final)} r="4" fill="#0051d5" stroke="white" strokeWidth="2">
          <title>
            {fecha(f.periodo_inicio)}: saldo {money(f.saldo_final)}
          </title>
        </circle>
      ))}
    </svg>
  );
}

type FilaSaldo = { tipo: string; nombre: string; detalle: string; importe: number };

const colsSaldo: ColumnaDetalle<FilaSaldo>[] = [
  { titulo: "Tipo", valor: (f) => <span className="text-[10px] font-bold uppercase text-outline">{f.tipo}</span> },
  { titulo: "Nombre", valor: (f) => <strong className="text-primary">{f.nombre}</strong> },
  { titulo: "Detalle", valor: (f) => f.detalle },
  { titulo: "Importe ARS", valor: (f) => money(f.importe), alinear: "right" },
];

function KpiCard({
  title,
  value,
  tag,
  tagColor = "bg-secondary-fixed/50 text-secondary",
  subtitle,
  stats,
  statsColor = "text-secondary",
  onClick,
}: {
  title: string;
  value: string;
  tag?: string;
  tagColor?: string;
  subtitle: string;
  stats: string;
  statsColor?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={onClick ? "Ver detalle" : undefined}
      className={cn(
        "bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-secondary/30 transition-all",
        onClick && tarjetaClickeable,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</span>
        {tag && <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", tagColor)}>{tag}</span>}
      </div>
      <div className="text-xl font-bold font-numeric text-primary tracking-tight">{value}</div>
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/10 text-[10px] gap-2">
        <span className="text-on-surface-variant font-medium">{subtitle}</span>
        <span className={cn("font-bold font-numeric whitespace-nowrap", statsColor)}>{stats}</span>
      </div>
    </div>
  );
}

function AccountRow({ name, type, balance, icon }: { name: string; type: string; balance: string; icon: "bank" | "usd" | "cash" | "cheque" }) {
  const isUSD = icon === "usd";
  const Icono = { bank: Landmark, usd: DollarSign, cash: Wallet, cheque: Receipt }[icon];
  return (
    <div className="p-3 bg-surface-container-low/50 border border-outline-variant/10 rounded-lg flex items-center justify-between group hover:bg-surface-container-low transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center border border-outline-variant/20 transition-transform group-hover:scale-105",
            isUSD ? "bg-tertiary-container/20 text-on-tertiary-container" : "bg-surface-container-lowest text-secondary",
          )}
        >
          <Icono className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-on-surface truncate">{name}</span>
            {isUSD && <span className="px-1 rounded bg-tertiary-container/20 text-[8px] font-bold text-on-tertiary-container">USD</span>}
          </div>
          <span className="text-[9px] text-outline font-semibold uppercase tracking-wider">{type}</span>
        </div>
      </div>
      <span className="text-xs font-bold text-primary font-numeric">{balance}</span>
    </div>
  );
}

function UpcomingItem({
  date,
  category,
  client,
  amount,
  method,
  isExpense = false,
  vencido = false,
  usdValue,
}: {
  date: string;
  category: string;
  client: string;
  amount: string;
  method: string;
  isExpense?: boolean;
  vencido?: boolean;
  usdValue?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-surface-container-low/40 border border-outline-variant/10 hover:border-outline-variant/30 transition-all flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={cn("text-[9px] font-bold font-numeric", isExpense || vencido ? "text-error" : "text-secondary")}>
          {date}
          {vencido && " • VENCIDO"}
        </span>
        {category && <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[8px] font-bold text-primary uppercase tracking-tighter">{category}</span>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-bold text-primary truncate">{client}</span>
          {usdValue && <span className="text-[9px] text-outline font-numeric">({usdValue})</span>}
        </div>
        <span className={cn("text-xs font-bold font-numeric", isExpense ? "text-error" : "text-on-tertiary-container")}>{amount}</span>
      </div>
      <span className="text-[9px] text-outline font-medium flex items-center gap-1">
        <History className="w-2.5 h-2.5" />
        {method}
      </span>
    </div>
  );
}
