import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PlusCircle,
  Download,
  Search,
  CheckCircle,
  Building2,
  History,
  TrendingUp,
  CreditCard,
  ArrowLeft,
  Receipt,
  Clock,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, money, number, porcentaje, sumarDias, sumarMeses, textoVencimiento, type Moneda } from "./lib/format";
import { ProveedorModal } from "./Proveedores";
import {
  CancelButton,
  EmptyRow,
  ErrorBanner,
  FormGroup,
  Loading,
  Modal,
  MoneyInput,
  Segmented,
  SubmitButton,
  inputCls,
  selectCls,
  useSubmit,
} from "./components/ui";

type Deuda = Row<"v_deudas">;
type Cuota = Row<"v_deuda_cuotas">;
type Filtro = "todos" | "pendiente" | "parcial" | "vencida" | "cancelada";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  vencida: "Vencida",
  cancelada: "Cancelada",
  pagada: "Pagada",
};

export const codigoDeuda = (id: number | null | undefined) => `DEU-${String(id ?? 0).padStart(4, "0")}`;

export default function Deudas() {
  const [nueva, setNueva] = useState(false);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const { data, loading, error, reload } = useData(async () => {
    const hoy = hoyISO();
    const [deudas, proximas, pagadasMes, tc] = await Promise.all([
      supabase.from("v_deudas").select("*").order("proximo_vencimiento", { ascending: true, nullsFirst: false }),
      supabase.from("v_deuda_cuotas").select("saldo, moneda").gt("saldo", 0).lte("fecha_vencimiento", sumarDias(hoy, 7)),
      supabase.from("v_egresos").select("importe_ars").not("deuda_cuota_id", "is", null).gte("fecha", hoy.slice(0, 8) + "01"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return { deudas: check(deudas), proximas: check(proximas), pagadasMes: check(pagadasMes), tc: tc.data?.venta ?? 0 };
  });

  const tc = data?.tc ?? 0;
  const ars = (moneda: string | null, v: number | null) => (moneda === "USD" ? (v ?? 0) * tc : v ?? 0);

  const kpi = useMemo(() => {
    const deudas = data?.deudas ?? [];
    const activas = deudas.filter((d) => d.estado !== "cancelada");
    return {
      pendiente: activas.reduce((s, d) => s + ars(d.moneda, d.saldo), 0),
      activas: activas.length,
      proximas: (data?.proximas ?? []).reduce((s, q) => s + ars(q.moneda, q.saldo), 0),
      cantProximas: data?.proximas.length ?? 0,
      pagadoMes: (data?.pagadasMes ?? []).reduce((s, e) => s + (e.importe_ars ?? 0), 0),
      cantPagadasMes: data?.pagadasMes.length ?? 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return (data?.deudas ?? []).filter((d) => {
      if (filtro !== "todos" && d.estado !== filtro) return false;
      if (q && !`${d.proveedor} ${d.proveedor_cuit ?? ""} ${d.concepto} ${d.categoria ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, busqueda, filtro]);

  if (seleccionada) {
    return <DebtDetail deudaId={seleccionada} onBack={() => (setSeleccionada(null), reload())} />;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Módulo de Pasivos</span>
            <span className="text-outline text-xs">•</span>
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tesorería</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Gestión de Deudas y Obligaciones</h1>
          <p className="text-sm text-on-surface-variant">Monitoreo de pasivos comerciales, financieros y suscripciones tecnológicas.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() =>
              exportCsv(
                `deudas-${hoyISO()}`,
                filas.map((d) => ({
                  Codigo: codigoDeuda(d.id),
                  Acreedor: d.proveedor,
                  CUIT: d.proveedor_cuit,
                  Concepto: d.concepto,
                  Categoria: d.categoria,
                  Moneda: d.moneda,
                  Total: d.importe_total,
                  Pagado: d.pagado,
                  Saldo: d.saldo,
                  "Prox. Vencimiento": fecha(d.proximo_vencimiento),
                  Estado: ESTADO_LABEL[d.estado ?? ""],
                })),
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4 text-outline" />
            Exportar Plan
          </button>
          <button
            onClick={() => setNueva(true)}
            className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            Nueva Deuda
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard title="Total Pasivos Pendientes" value={money(kpi.pendiente)} icon={<Receipt />} subtitle={`${kpi.activas} compromisos activos`} extra="En ARS al TC actual" color="text-secondary" />
        <KpiCard
          title="Vencimientos en ≤ 7 Días"
          value={money(kpi.proximas)}
          icon={<Clock />}
          subtitle={`${kpi.cantProximas} cuotas próximas o vencidas`}
          extra="Urgente"
          color="text-error"
          isAlert={kpi.cantProximas > 0}
        />
        <KpiCard
          title="Cuotas Pagadas este Mes"
          value={money(kpi.pagadoMes)}
          icon={<CheckCircle />}
          subtitle={`${kpi.cantPagadasMes} pagos imputados`}
          extra="Mes en curso"
          color="text-on-tertiary-container"
        />
      </div>

      {/* Search & Filter */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
            placeholder="Buscar por acreedor, CUIT o concepto de pasivo..."
          />
        </div>
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "todos", label: "Todos" },
            { value: "pendiente", label: "Pendientes" },
            { value: "parcial", label: "Parcialmente pagadas" },
            { value: "vencida", label: "Vencidas", danger: true },
            { value: "cancelada", label: "Canceladas" },
          ]}
        />
      </div>

      <ErrorBanner message={error} />

      {/* Data Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden mb-12">
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-6 py-4">Acreedor</th>
                  <th className="px-4 py-4">Concepto / Categoría</th>
                  <th className="px-4 py-4 text-right">Importe Total</th>
                  <th className="px-4 py-4 text-center">Moneda</th>
                  <th className="px-4 py-4 text-right">Saldo Pendiente</th>
                  <th className="px-4 py-4 text-center">Próx. Vencimiento</th>
                  <th className="px-4 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-xs">
                {filas.length === 0 && <EmptyRow colSpan={8} label="No hay deudas" />}
                {filas.map((d) => {
                  const isError = d.estado === "vencida" || (d.proximo_vencimiento != null && d.proximo_vencimiento <= sumarDias(hoyISO(), 3));
                  const moneda = d.moneda as Moneda;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSeleccionada(d.id!)}
                      className="hover:bg-surface-container-low/60 transition-colors group cursor-pointer border-l-4 border-transparent hover:border-secondary"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{d.proveedor}</span>
                          {d.proveedor_cuit && <span className="text-[9px] font-bold text-outline uppercase">CUIT: {d.proveedor_cuit}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-on-surface">{d.concepto}</span>
                          <span className="text-[10px] text-outline">{d.categoria ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-numeric font-bold text-on-surface">{money(d.importe_total, moneda)}</td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-bold",
                            moneda === "ARS" ? "bg-surface-container-high text-on-surface-variant" : "bg-secondary-fixed text-on-secondary-fixed",
                          )}
                        >
                          {moneda}
                          {moneda === "USD" && d.tc_referencia && ` • ${money(d.tc_referencia)}`}
                        </span>
                      </td>
                      <td className={cn("px-4 py-4 text-right font-numeric font-bold", isError ? "text-error" : "text-primary")}>{money(d.saldo, moneda)}</td>
                      <td className={cn("px-4 py-4 text-center font-numeric font-medium", isError ? "text-error" : "text-on-surface")}>
                        {fecha(d.proximo_vencimiento)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase",
                            d.estado === "vencida"
                              ? "bg-error-container/20 text-error"
                              : d.estado === "cancelada"
                                ? "bg-tertiary-container/10 text-on-tertiary-container"
                                : "bg-surface-container-high text-secondary",
                          )}
                        >
                          {ESTADO_LABEL[d.estado ?? ""]}
                          {(d.cuotas_total ?? 0) > 1 && ` (${d.cuotas_pagadas}/${d.cuotas_total})`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-secondary inline-block group-hover:translate-x-1 transition-transform">
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nueva && (
        <DeudaModal
          tc={data?.tc ?? null}
          onClose={() => setNueva(false)}
          onSaved={() => {
            setNueva(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  subtitle,
  extra,
  color,
  isAlert = false,
}: {
  title: string;
  value: string;
  icon: React.ReactElement<{ className?: string }>;
  subtitle: string;
  extra: string;
  color: string;
  isAlert?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-secondary/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</span>
        <div className={cn("p-2 rounded-lg transition-colors group-hover:bg-secondary group-hover:text-on-secondary bg-surface-container-high", color)}>
          {React.cloneElement(icon, { className: "w-4 h-4" })}
        </div>
      </div>
      <div>
        <div className={cn("text-2xl font-bold font-numeric tracking-tight mb-2", color)}>{value}</div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-on-surface-variant font-medium">{subtitle}</span>
          <span className="text-[9px] font-bold text-outline uppercase tracking-wider">{extra}</span>
        </div>
      </div>
      {isAlert && <div className="absolute bottom-0 left-0 right-0 h-1 bg-error animate-pulse" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

function DebtDetail({ deudaId, onBack }: { deudaId: number; onBack: () => void }) {
  const [filtro, setFiltro] = useState<"todas" | "pendientes">("todas");
  const [pagar, setPagar] = useState<Cuota | null>(null);
  const [editar, setEditar] = useState(false);

  const { data, loading, error, reload } = useData(async () => {
    const [deuda, cuotas, pagos] = await Promise.all([
      supabase.from("v_deudas").select("*").eq("id", deudaId).single(),
      supabase.from("v_deuda_cuotas").select("*").eq("deuda_id", deudaId).order("numero"),
      supabase.from("v_egresos").select("*").eq("deuda_id", deudaId).order("fecha", { ascending: false }),
    ]);
    return { deuda: check(deuda), cuotas: check(cuotas), pagos: check(pagos) };
  }, [deudaId]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner message={error} />;

  const { deuda: d, cuotas, pagos } = data;
  const moneda = d.moneda as Moneda;
  const pendientes = cuotas.filter((q) => (q.saldo ?? 0) > 0);
  const proxima = pendientes[0];
  const progreso = porcentaje(d.pagado ?? 0, d.importe_total ?? 0);
  const filas = filtro === "todas" ? cuotas : pendientes;

  async function eliminar() {
    if ((d.pagado ?? 0) > 0) return alert("No se puede eliminar una deuda con pagos registrados.");
    if (!confirm(`¿Eliminar la deuda ${codigoDeuda(d.id)}?`)) return;
    const { error } = await supabase.from("deudas").delete().eq("id", d.id!);
    if (error) return alert(error.message);
    onBack();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest">
          <button onClick={onBack} className="hover:text-secondary transition-colors">
            Deudas
          </button>
          <ChevronDown className="w-3 h-3 -rotate-90 text-outline" />
          <span className="text-primary">Detalle de Obligación #{codigoDeuda(d.id)}</span>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-surface-container font-numeric text-xs font-bold text-primary">#{codigoDeuda(d.id)}</span>
              <h1 className="text-2xl font-bold text-primary tracking-tight font-display">
                {d.concepto}
                {(d.cuotas_total ?? 0) > 1 && ` (${d.cuotas_total} Cuotas)`}
              </h1>
            </div>
            <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant font-medium">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-outline" /> <strong>Acreedor:</strong> {d.proveedor}
              </span>
              {d.proveedor_cuit && (
                <>
                  <span className="text-outline-variant">•</span>
                  <span className="flex items-center gap-1.5">
                    <History className="w-4 h-4 text-outline" /> <strong>CUIT:</strong> {d.proveedor_cuit}
                  </span>
                </>
              )}
              <span className="text-outline-variant">•</span>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold uppercase flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
                {ESTADO_LABEL[d.estado ?? ""]} ({d.cuotas_pagadas}/{d.cuotas_total})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            <button
              onClick={() => setEditar(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-all"
            >
              <Pencil className="w-4 h-4 text-secondary" />
              Editar
            </button>
            {(d.pagado ?? 0) === 0 && (
              <button
                onClick={eliminar}
                className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-error text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-error-container/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            )}
            {proxima && (
              <button
                onClick={() => setPagar(proxima)}
                className="flex items-center gap-2 px-5 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all"
              >
                <CreditCard className="w-4 h-4" />
                Registrar Pago
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <DetailStatCard
          title="Importe Total Original"
          value={money(d.importe_total, moneda)}
          icon={<Building2 />}
          footer={(d.cuotas_total ?? 0) > 1 ? `${d.cuotas_total} cuotas` : "Pago único"}
        />
        <DetailStatCard
          title="Total Abonado"
          value={money(d.pagado, moneda)}
          icon={<CheckCircle />}
          color="text-on-tertiary-container"
          progress={progreso}
          footer={`${d.cuotas_pagadas} cuotas pagadas (${number(progreso)}%)`}
        />
        <DetailStatCard title="Saldo Pendiente" value={money(d.saldo, moneda)} icon={<Clock />} color="text-primary" footer={`${pendientes.length} cuotas restantes`} />
        <DetailStatCard
          title="Próxima Cuota a Vencer"
          value={proxima ? money(proxima.saldo, moneda) : "—"}
          icon={<History />}
          color="text-secondary"
          footer={proxima ? `Cuota #${proxima.numero} • ${fecha(proxima.fecha_vencimiento)}` : "Sin cuotas pendientes"}
          tag={proxima ? textoVencimiento(proxima.fecha_vencimiento) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary">Cronograma de Cuotas</h2>
                <p className="text-xs text-on-surface-variant">Desglose secuencial de vencimientos e imputaciones</p>
              </div>
              <Segmented
                value={filtro}
                onChange={setFiltro}
                options={[
                  { value: "todas", label: `Todas (${cuotas.length})` },
                  { value: "pendientes", label: `Pendientes (${pendientes.length})` },
                ]}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="pb-4 px-2">Cuota</th>
                    <th className="pb-4 px-2">Vencimiento</th>
                    <th className="pb-4 px-2 text-right">Importe</th>
                    <th className="pb-4 px-2">Fecha Pago</th>
                    <th className="pb-4 px-2">Cuenta</th>
                    <th className="pb-4 px-2 text-center">Estado</th>
                    <th className="pb-4 px-2 text-right"></th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-outline-variant/10">
                  {filas.map((q) => {
                    const isNext = q.id === proxima?.id;
                    return (
                      <tr key={q.id} className={cn("hover:bg-surface-container-low/50 transition-colors group", isNext && "bg-secondary-fixed/5")}>
                        <td className="py-4 px-2">
                          <span
                            className={cn(
                              "px-1.5 h-6 rounded inline-flex items-center justify-center font-bold text-[10px]",
                              isNext ? "bg-secondary text-on-secondary" : "bg-surface-container text-outline",
                            )}
                          >
                            {q.numero}/{cuotas.length}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex flex-col">
                            <span className={cn("font-numeric font-bold", isNext ? "text-secondary" : q.estado === "vencida" ? "text-error" : "text-on-surface")}>
                              {fecha(q.fecha_vencimiento)}
                            </span>
                            {(q.saldo ?? 0) > 0 && <span className="text-[9px] text-secondary font-medium">{textoVencimiento(q.fecha_vencimiento)}</span>}
                          </div>
                        </td>
                        <td className="py-4 px-2 text-right font-bold font-numeric text-on-surface">
                          {money(q.importe, moneda)}
                          {q.estado === "parcial" && <div className="text-[9px] text-on-surface-variant">saldo {money(q.saldo, moneda)}</div>}
                        </td>
                        <td className="py-4 px-2 font-numeric text-outline">{fecha(q.fecha_pago)}</td>
                        <td className="py-4 px-2">
                          <span className="font-medium text-on-surface-variant truncate max-w-[120px] inline-block">{q.cuenta ?? "—"}</span>
                        </td>
                        <td className="py-4 px-2 text-center">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                              q.estado === "pagada"
                                ? "bg-tertiary-container/10 text-on-tertiary-container"
                                : q.estado === "vencida"
                                  ? "bg-error-container/30 text-error"
                                  : "bg-secondary-fixed text-on-secondary-fixed",
                            )}
                          >
                            {ESTADO_LABEL[q.estado ?? ""]}
                          </span>
                        </td>
                        <td className="py-4 px-2 text-right">
                          {(q.saldo ?? 0) > 0 && (
                            <button
                              onClick={() => setPagar(q)}
                              className="px-3 py-1 bg-secondary text-on-secondary rounded-lg text-[10px] font-bold hover:bg-secondary-container transition-all"
                            >
                              Pagar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(d.notas || d.referencia) && (
            <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary-fixed/50 flex items-center justify-center text-secondary shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <p className="text-xs text-on-surface-variant">{d.notas}</p>
              {d.referencia && <div className="ml-auto px-3 py-1 rounded bg-surface-container text-[10px] font-bold text-on-surface-variant uppercase">{d.referencia}</div>}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-secondary" />
              Pagos Registrados
            </h3>
            {pagos.length === 0 && <p className="text-xs text-outline">Todavía no hay pagos.</p>}
            <div className="space-y-4">
              {pagos.map((p) => (
                <div key={p.id} className="pl-4 border-l-2 border-on-tertiary-container/40 space-y-0.5">
                  <div className="text-[9px] font-bold text-on-tertiary-container uppercase tracking-wider">{fecha(p.fecha)}</div>
                  <div className="text-xs font-bold text-primary">
                    Cuota {p.cuota_numero}/{cuotas.length} imputada
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    {p.medio === "cheque_endosado" ? `Cheque #${p.cheque_numero} endosado` : `Vía ${p.cuenta}`} por {money(p.importe, p.moneda as Moneda)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-secondary" />
              Datos del pasivo
            </h3>
            <dl className="text-xs space-y-2">
              <Dato label="Categoría" value={d.categoria ?? "—"} />
              <Dato label="Moneda" value={moneda} />
              {moneda === "USD" && <Dato label="TC referencia" value={d.tc_referencia ? money(d.tc_referencia) : "—"} />}
              <Dato label="Fecha de factura" value={fecha(d.fecha_alta)} />
              <Dato label="Forma de pago" value={d.forma_pago === "cuotas" ? "En cuotas" : "Pago único"} />
            </dl>
          </div>
        </div>
      </div>

      {editar && (
        <DeudaModal
          tc={d.tc_referencia}
          existente={{ deuda: d, cuotas }}
          onClose={() => setEditar(false)}
          onSaved={() => {
            setEditar(false);
            reload();
          }}
        />
      )}
      {pagar && (
        <PagoCuotaModal
          deuda={d}
          cuota={pagar}
          totalCuotas={cuotas.length}
          onClose={() => setPagar(null)}
          onSaved={() => {
            setPagar(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-outline font-bold uppercase text-[10px]">{label}</dt>
      <dd className="font-bold text-primary">{value}</dd>
    </div>
  );
}

function DetailStatCard({
  title,
  value,
  icon,
  color = "text-primary",
  progress,
  footer,
  tag,
}: {
  title: string;
  value: string;
  icon: React.ReactElement<{ className?: string }>;
  color?: string;
  progress?: number;
  footer: string;
  tag?: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 shadow-sm flex flex-col justify-between group hover:border-secondary/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</span>
        <div className="p-2 rounded-lg bg-surface-container-low text-outline group-hover:text-secondary transition-colors">
          {React.cloneElement(icon, { className: "w-4 h-4" })}
        </div>
      </div>
      <div className={cn("text-xl font-bold font-numeric tracking-tight", color)}>{value}</div>
      <div className="mt-4 pt-3 border-t border-outline-variant/10">
        {progress !== undefined && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-on-tertiary-container bg-tertiary-container/10 px-1.5 py-0.5 rounded">{number(progress)}%</span>
            <div className="flex-1 ml-3 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-on-tertiary-container rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-on-surface-variant">{footer}</span>
          {tag && <span className="px-1.5 py-0.5 rounded bg-surface-container text-[9px] font-bold text-secondary">{tag}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pago de cuota (crea un egreso imputado)
// ---------------------------------------------------------------------------

export function PagoCuotaModal({
  deuda,
  cuota,
  totalCuotas,
  onClose,
  onSaved,
}: {
  deuda: Deuda;
  cuota: Cuota;
  totalCuotas: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const moneda = deuda.moneda as Moneda;
  const { data: cat } = useData(async () => {
    const [cuentas, categorias, tc] = await Promise.all([
      supabase.from("cuentas").select("id, nombre, moneda").eq("activa", true).order("id"),
      supabase.from("categorias_egreso").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return { cuentas: check(cuentas), categorias: check(categorias), tc: tc.data?.venta ?? null };
  });

  const [fechaP, setFechaP] = useState(hoyISO());
  const [importe, setImporte] = useState(cuota.saldo ?? NaN);
  const [cuentaId, setCuentaId] = useState("");
  const [medio, setMedio] = useState<"transferencia" | "debito_automatico" | "efectivo" | "tarjeta">("transferencia");
  const [categoriaId, setCategoriaId] = useState(deuda.categoria_egreso_id ? String(deuda.categoria_egreso_id) : "");
  const [tc, setTc] = useState(NaN);
  const { saving, error, setError, run } = useSubmit();

  useEffect(() => {
    if (cat && !cuentaId) setCuentaId(String(cat.cuentas.find((c) => c.moneda === moneda)?.id ?? cat.cuentas[0]?.id ?? ""));
    if (cat?.tc && !Number.isFinite(tc)) setTc(cat.tc);
  }, [cat, cuentaId, moneda, tc]);

  const cuenta = cat?.cuentas.find((c) => String(c.id) === cuentaId);
  const necesitaTc = moneda === "USD" || (cuenta && cuenta.moneda !== moneda);

  const guardar = () =>
    run(async () => {
      if (!(importe > 0)) return setError("Ingresá el importe");
      if (importe > (cuota.saldo ?? 0)) return setError(`Supera el saldo de la cuota (${money(cuota.saldo, moneda)})`);
      if (!cuenta) return setError("Elegí la cuenta de origen");
      if (!categoriaId) return setError("Elegí la categoría");
      if (necesitaTc && !(tc > 0)) return setError("Indicá el tipo de cambio");
      check(
        await supabase.from("egresos").insert({
          fecha: fechaP,
          categoria_egreso_id: Number(categoriaId),
          proveedor_id: deuda.proveedor_id,
          concepto: `${deuda.concepto} - Cuota ${cuota.numero}/${totalCuotas}`,
          moneda,
          importe,
          tc: necesitaTc ? tc : null,
          medio,
          cuenta_id: cuenta.id,
          deuda_cuota_id: cuota.id,
        }),
      );
      onSaved();
    });

  return (
    <Modal
      title="Registrar Pago de Cuota"
      subtitle={`${deuda.proveedor} • Cuota ${cuota.numero}/${totalCuotas} • vence ${fecha(cuota.fecha_vencimiento)}`}
      icon={<CreditCard className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Confirmar Pago
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Fecha de pago *">
          <input type="date" className={inputCls} value={fechaP} onChange={(e) => setFechaP(e.target.value)} />
        </FormGroup>
        <FormGroup label={`Importe * (${moneda})`}>
          <MoneyInput value={importe} onChange={setImporte} prefix={moneda === "USD" ? "U$S" : "$"} />
        </FormGroup>
        <FormGroup label="Medio de pago *">
          <select className={selectCls} value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
            <option value="transferencia">Transferencia</option>
            <option value="debito_automatico">Débito automático</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
        </FormGroup>
        <FormGroup label="Cuenta de origen *">
          <select className={selectCls} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {cat?.cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Categoría *">
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {cat?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </FormGroup>
        {necesitaTc && (
          <FormGroup label="Tipo de cambio *">
            <MoneyInput value={tc} onChange={setTc} />
          </FormGroup>
        )}
      </div>
      {necesitaTc && cuenta && Number.isFinite(importe) && tc > 0 && (
        <p className="text-[11px] text-on-surface-variant">
          Débito en {cuenta.nombre}:{" "}
          <strong className="font-numeric">
            {cuenta.moneda === moneda ? money(importe, moneda) : cuenta.moneda === "ARS" ? money(importe * tc) : money(importe / tc, "USD")}
          </strong>
        </p>
      )}
      <ErrorBanner message={error} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Alta / edición de deuda
// ---------------------------------------------------------------------------

/** id y pagado solo aplican a cuotas existentes (edición). */
type CuotaForm = { id?: number; pagado: number; fecha: string; importe: number };

function DeudaModal({
  tc,
  existente,
  onClose,
  onSaved,
}: {
  tc: number | null;
  existente?: { deuda: Deuda; cuotas: Cuota[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const deu = existente?.deuda;
  // En edición se incluyen el acreedor y la categoría actuales aunque estén inactivos
  const incluir = (campo: string, id: number | null | undefined) => (id ? `${campo},id.eq.${id}` : campo);
  const { data: cat, reload } = useData(async () => {
    const [proveedores, categorias] = await Promise.all([
      supabase.from("proveedores").select("id, razon_social, cuit").or(incluir("activo.eq.true", deu?.proveedor_id)).order("razon_social"),
      supabase.from("categorias_egreso").select("id, nombre").or(incluir("activa.eq.true", deu?.categoria_egreso_id)).order("nombre"),
    ]);
    return { proveedores: check(proveedores), categorias: check(categorias) };
  });

  const hoy = hoyISO();
  const cuotasIniciales: CuotaForm[] = (existente?.cuotas ?? []).map((q) => ({
    id: q.id!,
    pagado: q.pagado ?? 0,
    fecha: q.fecha_vencimiento!,
    importe: q.importe!,
  }));
  const [proveedorId, setProveedorId] = useState(deu?.proveedor_id ? String(deu.proveedor_id) : "");
  const [concepto, setConcepto] = useState(deu?.concepto ?? "");
  const [categoriaId, setCategoriaId] = useState(deu?.categoria_egreso_id ? String(deu.categoria_egreso_id) : "");
  const [moneda, setMoneda] = useState<Moneda>((deu?.moneda as Moneda) ?? "ARS");
  const [tcRef, setTcRef] = useState(deu?.tc_referencia ?? tc ?? NaN);
  const [total, setTotal] = useState(deu?.importe_total ?? NaN);
  const [enCuotas, setEnCuotas] = useState(cuotasIniciales.length > 1);
  const [cantidad, setCantidad] = useState(cuotasIniciales.length > 1 ? cuotasIniciales.length : 6);
  const [primerVto, setPrimerVto] = useState(cuotasIniciales[0]?.fecha ?? sumarDias(hoy, 30));
  const [cuotas, setCuotas] = useState<CuotaForm[]>(cuotasIniciales);
  const [referencia, setReferencia] = useState(deu?.referencia ?? "");
  const [fechaFactura, setFechaFactura] = useState(deu?.fecha_alta ?? hoy);
  const [notas, setNotas] = useState(deu?.notas ?? "");
  const [nuevoProv, setNuevoProv] = useState(false);
  const { saving, error, setError, run } = useSubmit();
  const tienePagos = (deu?.pagado ?? 0) > 0;

  // Regenera el plan; en edición conserva (por posición) las cuotas existentes para no perder sus pagos
  function recalcular() {
    if (!(total > 0)) return;
    const n = enCuotas ? cantidad : 1;
    const base = Math.floor((total / n) * 100) / 100;
    setCuotas((prev) =>
      Array.from({ length: n }, (_, k) => ({
        id: prev[k]?.id,
        pagado: prev[k]?.pagado ?? 0,
        fecha: sumarMeses(primerVto, k),
        importe: k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base,
      })),
    );
  }

  // No recalcular al abrir: en edición se muestra el plan guardado tal cual
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    recalcular();
  }, [total, enCuotas, cantidad, primerVto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuotas con pagos que quedarían afuera al reducir la cantidad
  const quitadasConPago = cuotasIniciales.filter((q) => q.pagado > 0 && !cuotas.some((c) => c.id === q.id));

  const asignado = cuotas.reduce((s, q) => s + (Number.isFinite(q.importe) ? q.importe : 0), 0);
  const diferencia = Math.round(((total || 0) - asignado) * 100) / 100;

  const guardar = () =>
    run(async () => {
      if (!proveedorId) return setError("Elegí el acreedor");
      if (!fechaFactura) return setError("Indicá la fecha de factura");
      if (!concepto.trim()) return setError("El concepto es obligatorio");
      if (!(total > 0)) return setError("Ingresá el importe total");
      if (moneda === "USD" && !(tcRef > 0)) return setError("Indicá el TC de referencia");
      if (cuotas.some((q) => !q.fecha || !(q.importe > 0))) return setError("Revisá las cuotas");
      if (diferencia !== 0) return setError("La suma de cuotas debe igualar el total");
      if (quitadasConPago.length) return setError("No se pueden quitar cuotas que ya tienen pagos registrados");
      const bajo = cuotas.findIndex((q) => q.importe < q.pagado);
      if (bajo >= 0) return setError(`La cuota #${bajo + 1} no puede ser menor a lo ya pagado (${money(cuotas[bajo].pagado, moneda)})`);
      const args = {
        p_proveedor_id: Number(proveedorId),
        p_concepto: concepto.trim(),
        p_moneda: moneda,
        p_importe_total: total,
        p_categoria_egreso_id: categoriaId ? Number(categoriaId) : undefined,
        p_tc_referencia: moneda === "USD" ? tcRef : undefined,
        p_referencia: referencia.trim() || undefined,
        p_notas: notas.trim() || undefined,
        p_fecha_alta: fechaFactura,
      };
      if (deu) {
        check(
          await supabase.rpc("actualizar_deuda", {
            p_id: deu.id!,
            ...args,
            p_cuotas: cuotas.map((q) => ({ id: q.id ?? null, fecha_vencimiento: q.fecha, importe: q.importe })),
          }),
        );
      } else {
        check(await supabase.rpc("crear_deuda", { ...args, p_cuotas: cuotas.map((q) => ({ fecha_vencimiento: q.fecha, importe: q.importe })) }));
      }
      onSaved();
    });

  const prefijo = moneda === "USD" ? "U$S" : "$";

  return (
    <Modal
      title={deu ? `Editar Deuda #${codigoDeuda(deu.id)}` : "Registrar Nueva Deuda u Obligación"}
      subtitle={deu ? `${deu.proveedor} • ${deu.concepto}` : "Configuración del pasivo, tipo de cambio e imputación de cuotas"}
      icon={<CreditCard className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-3xl"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            {deu ? "Guardar Cambios" : "Guardar Deuda y Plan de Cuotas"}
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Acreedor / Proveedor *">
          <select
            className={selectCls}
            value={proveedorId}
            disabled={tienePagos}
            title={tienePagos ? "No se puede cambiar: la deuda tiene pagos" : undefined}
            onChange={(e) => (e.target.value === "nuevo" ? setNuevoProv(true) : setProveedorId(e.target.value))}
          >
            <option value="">Seleccionar…</option>
            {cat?.proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razon_social}
                {p.cuit && ` - CUIT ${p.cuit}`}
              </option>
            ))}
            <option value="nuevo">+ Nuevo proveedor…</option>
          </select>
        </FormGroup>
        <FormGroup label="Categoría de egreso">
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {cat?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Concepto / Descripción *" className="sm:col-span-2">
          <input className={inputCls} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Renovación equipamiento desarrolladores - Laptops" />
        </FormGroup>
        <FormGroup label="Moneda">
          <div className="flex gap-2">
            {(["ARS", "USD"] as Moneda[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={tienePagos}
                onClick={() => setMoneda(m)}
                className={cn(
                  "flex-1 h-10 rounded-lg text-xs font-bold border transition-all disabled:opacity-60",
                  moneda === m ? "bg-secondary text-on-secondary border-secondary" : "bg-surface-container-low text-on-surface-variant border-outline-variant/10",
                )}
              >
                {m === "ARS" ? "ARS ($)" : "USD"}
              </button>
            ))}
          </div>
        </FormGroup>
        {moneda === "USD" ? (
          <FormGroup label="TC Referencia MEP *">
            <MoneyInput value={tcRef} onChange={setTcRef} />
          </FormGroup>
        ) : (
          <div />
        )}
        <FormGroup label={`Importe Total * (${moneda})`}>
          <MoneyInput value={total} onChange={setTotal} prefix={prefijo} />
        </FormGroup>
        <FormGroup label="Referencia / Contrato">
          <input className={inputCls} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Contrato #DL-AR-8831" />
        </FormGroup>
        <FormGroup label="Fecha de factura *">
          <input type="date" className={inputCls} value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
        </FormGroup>
      </div>

      <div className="space-y-3">
        <label className="text-[11px] font-bold text-primary uppercase tracking-wider">Forma de Pago del Pasivo</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PaymentModeOption active={!enCuotas} onClick={() => setEnCuotas(false)} title="Un solo pago" sub="Vencimiento único en fecha" />
          <PaymentModeOption active={enCuotas} onClick={() => setEnCuotas(true)} title="En cuotas planificadas" sub="Generación automática mensual" />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <FormGroup label={enCuotas ? "Primer vencimiento" : "Vencimiento"}>
            <input type="date" className={inputCls} value={primerVto} onChange={(e) => setPrimerVto(e.target.value)} />
          </FormGroup>
          {enCuotas && (
            <FormGroup label="Cantidad de cuotas mensuales">
              <input type="number" min={2} max={120} className={cn(inputCls, "w-28")} value={cantidad} onChange={(e) => setCantidad(Math.max(2, Math.min(120, Number(e.target.value) || 2)))} />
            </FormGroup>
          )}
          <button type="button" onClick={recalcular} className="h-10 px-4 rounded-lg text-[11px] font-bold text-secondary hover:bg-secondary/5">
            Recalcular
          </button>
        </div>

        {cuotas.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                <th className="py-2">Cuota #</th>
                <th className="py-2">Vencimiento</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {cuotas.map((q, k) => (
                <tr key={k}>
                  <td className="py-2 font-bold text-on-surface-variant">
                    Cuota {k + 1} de {cuotas.length}
                  </td>
                  <td className="py-2">
                    <input
                      type="date"
                      className={cn(inputCls, "h-8 w-40")}
                      value={q.fecha}
                      onChange={(e) => setCuotas((cs) => cs.map((c, j) => (j === k ? { ...c, fecha: e.target.value } : c)))}
                    />
                  </td>
                  <td className="py-2">
                    <MoneyInput
                      value={q.importe}
                      onChange={(n) => setCuotas((cs) => cs.map((c, j) => (j === k ? { ...c, importe: n } : c)))}
                      prefix={prefijo}
                      className="w-48 ml-auto"
                      inputClassName="h-8"
                    />
                    {q.pagado > 0 && (
                      <div className="text-right text-[9px] font-bold text-on-tertiary-container">Pagado {money(q.pagado, moneda)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {quitadasConPago.length > 0 && (
          <p className="text-[11px] font-bold text-error">
            Hay {quitadasConPago.length} cuota(s) con pagos que quedarían afuera del plan: aumentá la cantidad de cuotas.
          </p>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span>
            Total asignado: <strong className="font-numeric">{money(asignado, moneda)}</strong>
          </span>
          <span className={cn("font-bold", diferencia === 0 ? "text-on-tertiary-container" : "text-error")}>
            {diferencia === 0 ? "Cuadre exacto: 100%" : `Diferencia ${money(diferencia, moneda)}`}
          </span>
        </div>
      </div>

      <FormGroup label="Notas">
        <input className={inputCls} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Tasa, condiciones, observaciones" />
      </FormGroup>
      <ErrorBanner message={error} />
      {nuevoProv && (
        <ProveedorModal
          proveedor={null}
          onClose={() => setNuevoProv(false)}
          onSaved={(id) => {
            setNuevoProv(false);
            reload();
            setProveedorId(String(id));
          }}
        />
      )}
    </Modal>
  );
}

function PaymentModeOption({ active, title, sub, onClick }: { active: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 group",
        active ? "bg-surface-container-high/40 border-secondary shadow-sm" : "bg-surface-container-low border-outline-variant/10 hover:border-outline-variant/30",
      )}
    >
      <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", active ? "border-secondary" : "border-outline")}>
        {active && <div className="w-2 h-2 rounded-full bg-secondary" />}
      </div>
      <div className="flex-1 flex flex-col">
        <span className={cn("text-xs font-bold", active ? "text-primary" : "text-on-surface-variant")}>{title}</span>
        <span className="text-[10px] text-outline font-medium">{sub}</span>
      </div>
    </div>
  );
}
