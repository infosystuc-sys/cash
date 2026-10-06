import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Receipt,
  PlusCircle,
  Download,
  FileText,
  Search,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Calendar,
  CreditCard,
  Trash2,
  Plus,
  Pencil,
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, iniciales, money, porcentaje, sumarDias, sumarMeses, textoVencimiento, type Moneda } from "./lib/format";
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

type Ingreso = Row<"v_ingresos">;
type Vencimiento = Row<"v_ingreso_vencimientos">;
type Cuenta = { id: number; nombre: string; moneda: Moneda };

type Periodo = "mes" | "mes_anterior" | "90" | "todo";
type Estado = "todos" | "pendientes" | "cobrados" | "vencidos";

const ESTADO_LABEL: Record<string, string> = {
  cobrado: "Cobrado",
  cobrado_parcial: "Cobrado Parcial",
  vencido: "Vencido",
  pendiente: "Pendiente",
};

function rangoPeriodo(p: Periodo): [string | null, string | null] {
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + "01";
  if (p === "mes") return [inicioMes, sumarDias(sumarMeses(inicioMes, 1), -1)];
  if (p === "mes_anterior") return [sumarMeses(inicioMes, -1), sumarDias(inicioMes, -1)];
  if (p === "90") return [sumarDias(hoy, -90), hoy];
  return [null, null];
}

export default function Ingresos() {
  const [params, setParams] = useSearchParams();
  const [nuevo, setNuevo] = useState(params.get("nuevo") === "1");
  const [editando, setEditando] = useState<Ingreso | null>(null);
  const [cobrar, setCobrar] = useState<{ ingreso: Ingreso; vencimiento?: Vencimiento } | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [estado, setEstado] = useState<Estado>("todos");

  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setNuevo(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const catalogos = useData(async () => {
    const [clientes, tipos, cuentas, tc] = await Promise.all([
      supabase.from("clientes").select("id, razon_social, cuit, tipo_ingreso_id").eq("activo", true).order("razon_social"),
      supabase.from("tipos_ingreso").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("cuentas").select("id, nombre, moneda").eq("activa", true).order("id"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return { clientes: check(clientes), tipos: check(tipos), cuentas: check(cuentas) as Cuenta[], tc: tc.data?.venta ?? null };
  });

  const [desde, hasta] = rangoPeriodo(periodo);
  const { data, loading, error, reload } = useData(async () => {
    let q = supabase.from("v_ingresos").select("*").order("fecha_factura", { ascending: false }).order("id", { ascending: false });
    if (desde) q = q.gte("fecha_factura", desde);
    if (hasta) q = q.lte("fecha_factura", hasta);
    return check(await q);
  }, [desde, hasta]);

  const tc = catalogos.data?.tc ?? 0;
  const ars = (i: { moneda: string | null }, v: number | null) => (i.moneda === "USD" ? (v ?? 0) * tc : v ?? 0);

  const base = useMemo(
    () =>
      (data ?? []).filter((i) => {
        const q = busqueda.toLowerCase().trim();
        if (q && !`${i.cliente} ${i.descripcion} ${i.comprobante ?? ""}`.toLowerCase().includes(q)) return false;
        if (clienteId && String(i.cliente_id) !== clienteId) return false;
        if (tipoId && String(i.tipo_ingreso_id) !== tipoId) return false;
        return true;
      }),
    [data, busqueda, clienteId, tipoId],
  );

  const filas = base.filter((i) => {
    if (estado === "pendientes") return i.estado === "pendiente" || i.estado === "cobrado_parcial";
    if (estado === "cobrados") return i.estado === "cobrado";
    if (estado === "vencidos") return i.estado === "vencido";
    return true;
  });

  const kpi = useMemo(() => {
    const total = base.reduce((s, i) => s + ars(i, i.importe_total), 0);
    const cobrado = base.reduce((s, i) => s + ars(i, i.cobrado), 0);
    const vencidos = base.filter((i) => i.estado === "vencido");
    const vencido = vencidos.reduce((s, i) => s + ars(i, i.saldo), 0);
    const enTermino = base.filter((i) => i.estado === "pendiente" || i.estado === "cobrado_parcial");
    return {
      total,
      cobrado,
      vencido,
      enTermino: enTermino.reduce((s, i) => s + ars(i, i.saldo), 0),
      cantEnTermino: enTermino.length,
      cantVencidos: vencidos.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, tc]);

  async function eliminar(i: Ingreso) {
    if ((i.cobrado ?? 0) > 0) return alert("No se puede eliminar un ingreso con cobros registrados.");
    if (!confirm(`¿Eliminar el ingreso "${i.descripcion}"?`)) return;
    const { error } = await supabase.from("ingresos").delete().eq("id", i.id!);
    if (error) alert(error.message);
    reload();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Gestión de Tesorería</span>
            <span className="text-outline text-xs">/</span>
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Cuentas a Cobrar</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Ingresos y Facturación</h1>
          <p className="text-sm text-on-surface-variant max-w-2xl mt-0.5">
            Registro de honorarios y comisiones facturadas a clientes con control de vencimientos y cobranzas en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() =>
              exportCsv(
                `ingresos-${hoyISO()}`,
                filas.map((i) => ({
                  Cliente: i.cliente,
                  CUIT: i.cliente_cuit,
                  Tipo: i.tipo_ingreso,
                  Descripcion: i.descripcion,
                  Comprobante: i.comprobante,
                  Fecha: fecha(i.fecha_factura),
                  Moneda: i.moneda,
                  Importe: i.importe_total,
                  Cobrado: i.cobrado,
                  Saldo: i.saldo,
                  "Prox. Vencimiento": fecha(i.proximo_vencimiento),
                  Estado: ESTADO_LABEL[i.estado ?? ""],
                })),
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4 text-outline" />
            Exportar Excel
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <FileText className="w-4 h-4 text-outline" />
            Listado PDF
          </button>
          <button
            onClick={() => setNuevo(true)}
            className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            Nuevo Ingreso
          </button>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Total Facturado Período" value={money(kpi.total)} icon={<Receipt />} tag={`${base.length} comprobantes`} subtitle="en el período" />
        <KpiCard
          title="Cobrado Efectivo"
          value={money(kpi.cobrado)}
          icon={<CheckCircle />}
          color="text-on-tertiary-container"
          tag={`${porcentaje(kpi.cobrado, kpi.total)}% cobrado`}
          tagColor="bg-tertiary-container/10 text-on-tertiary-container"
          subtitle="aplicado a facturas"
        />
        <KpiCard title="Por Cobrar en Término" value={money(kpi.enTermino)} icon={<Calendar />} tag={`${kpi.cantEnTermino} facturas`} subtitle="no vencidas" />
        <KpiCard
          title="Vencido Impago"
          value={money(kpi.vencido)}
          icon={<AlertCircle />}
          color="text-error"
          tag={`${kpi.cantVencidos} facturas vencidas`}
          tagColor="bg-error-container/10 text-error"
          subtitle="requiere reclamo"
        />
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
                placeholder="Buscar cliente, detalle..."
              />
            </div>
            <FilterSelect value={clienteId} onChange={setClienteId}>
              <option value="">Todos los clientes ({catalogos.data?.clientes.length ?? 0})</option>
              {catalogos.data?.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={tipoId} onChange={setTipoId}>
              <option value="">Todos los tipos de ingreso</option>
              {catalogos.data?.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={periodo} onChange={(v) => setPeriodo(v as Periodo)}>
              <option value="mes">Este mes</option>
              <option value="mes_anterior">Mes anterior</option>
              <option value="90">Últimos 90 días</option>
              <option value="todo">Todo el historial</option>
            </FilterSelect>
          </div>

          <Segmented
            value={estado}
            onChange={setEstado}
            options={[
              { value: "todos", label: "Todos" },
              { value: "pendientes", label: "Pendientes" },
              { value: "cobrados", label: "Cobrados" },
              { value: "vencidos", label: `Vencidos (${kpi.cantVencidos})`, danger: true },
            ]}
          />
        </div>
      </div>

      <ErrorBanner message={error || catalogos.error} />

      {/* Data Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden mb-12">
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-4 py-4">Tipo Ingreso</th>
                  <th className="px-4 py-4 min-w-[280px]">Descripción</th>
                  <th className="px-4 py-4 text-center">Fecha Factura</th>
                  <th className="px-4 py-4 text-center">Moneda</th>
                  <th className="px-4 py-4 text-right">Importe Total</th>
                  <th className="px-4 py-4 text-center">Próx. Vencimiento</th>
                  <th className="px-4 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-xs">
                {filas.length === 0 && <EmptyRow colSpan={9} label="No hay ingresos para los filtros elegidos" />}
                {filas.map((i) => (
                  <React.Fragment key={i.id}>
                    <InvoiceRow
                      ingreso={i}
                      expandido={expandido === i.id}
                      onToggle={() => setExpandido(expandido === i.id ? null : i.id!)}
                      onCobrar={() => setCobrar({ ingreso: i })}
                      onEliminar={() => eliminar(i)}
                      onEditar={() => setEditando(i)}
                    />
                    {expandido === i.id && (
                      <VencimientosDetalle ingreso={i} onCobrar={(v) => setCobrar({ ingreso: i, vencimiento: v })} />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 bg-surface-container-low/30 flex items-center justify-between border-t border-outline-variant/10">
          <span className="text-[10px] text-on-surface-variant font-medium">
            Mostrando <span className="font-bold text-on-surface">{filas.length}</span> de{" "}
            <span className="font-bold text-on-surface">{data?.length ?? 0} facturas</span> del período
          </span>
        </div>
      </div>

      {nuevo && catalogos.data && (
        <IngresoModal
          catalogos={catalogos.data}
          onClose={() => setNuevo(false)}
          onSaved={() => {
            setNuevo(false);
            reload();
          }}
        />
      )}
      {editando && catalogos.data && (
        <EditarIngresoModal
          ingreso={editando}
          catalogos={catalogos.data}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            setExpandido(null);
            reload();
          }}
        />
      )}
      {cobrar && catalogos.data && (
        <CobroModal
          ingreso={cobrar.ingreso}
          vencimientoInicial={cobrar.vencimiento}
          cuentas={catalogos.data.cuentas}
          tc={catalogos.data.tc}
          onClose={() => setCobrar(null)}
          onSaved={() => {
            setCobrar(null);
            setExpandido(null);
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
  color = "text-primary",
  tag,
  tagColor = "bg-surface-container-high text-on-surface",
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactElement<{ className?: string }>;
  color?: string;
  tag: string;
  tagColor?: string;
  subtitle: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-secondary/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</span>
        <div className={cn("p-2 rounded-lg bg-surface-container-high transition-colors group-hover:bg-secondary group-hover:text-on-secondary", color)}>
          {React.cloneElement(icon, { className: "w-4 h-4" })}
        </div>
      </div>
      <div>
        <div className={cn("text-xl font-bold font-numeric tracking-tight mb-2", color)}>{value}</div>
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase", tagColor)}>{tag}</span>
          <span className="text-[10px] text-on-surface-variant font-medium">{subtitle}</span>
        </div>
      </div>
      <div className={cn("absolute bottom-0 left-0 right-0 h-1 transition-all group-hover:h-1.5", color.replace("text-", "bg-"))} />
    </div>
  );
}

function FilterSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 pr-8 rounded-lg bg-surface-container-low text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors appearance-none cursor-pointer outline-none border-0"
      >
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-outline absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

function InvoiceRow({
  ingreso: i,
  expandido,
  onToggle,
  onCobrar,
  onEliminar,
  onEditar,
}: {
  ingreso: Ingreso;
  expandido: boolean;
  onToggle: () => void;
  onCobrar: () => void;
  onEliminar: () => void;
  onEditar: () => void;
}) {
  const isError = i.estado === "vencido";
  const moneda = i.moneda as Moneda;
  const progreso = porcentaje(i.cobrado ?? 0, i.importe_total ?? 0);
  return (
    <tr onClick={onToggle} className={cn("hover:bg-surface-container-low/60 transition-colors group cursor-pointer", isError && "bg-error-container/5")}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm transition-transform group-hover:scale-105",
              isError ? "bg-error-container text-error" : "bg-surface-container-high text-secondary",
            )}
          >
            {iniciales(i.cliente)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-primary truncate">{i.cliente}</span>
            {i.cliente_cuit && <span className="text-[9px] font-bold text-outline uppercase tracking-tighter">CUIT {i.cliente_cuit}</span>}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-bold text-[9px] uppercase">{i.tipo_ingreso}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="font-bold text-primary truncate max-w-sm">{i.descripcion}</span>
          {i.comprobante && <span className="text-[9px] font-bold text-outline uppercase">{i.comprobante}</span>}
        </div>
      </td>
      <td className="px-4 py-4 text-center font-numeric text-on-surface-variant font-medium">{fecha(i.fecha_factura)}</td>
      <td className="px-4 py-4 text-center">
        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface text-[9px] font-bold">{moneda}</span>
      </td>
      <td className={cn("px-4 py-4 text-right font-numeric font-bold text-sm", isError ? "text-error" : "text-primary")}>
        {money(i.importe_total, moneda)}
      </td>
      <td className="px-4 py-4 text-center">
        {i.proximo_vencimiento ? (
          <div className="flex flex-col items-center">
            <span className={cn("font-numeric font-bold", isError ? "text-error" : "text-on-surface")}>{fecha(i.proximo_vencimiento)}</span>
            <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase", isError ? "bg-error-container text-error" : "bg-surface-container-high text-secondary")}>
              {textoVencimiento(i.proximo_vencimiento)}
              {(i.cuotas ?? 0) > 1 && ` (Cuota ${i.proxima_cuota}/${i.cuotas})`}
            </span>
          </div>
        ) : (
          <span className="text-outline">—</span>
        )}
      </td>
      <td className="px-4 py-4 text-center">
        <div className="inline-flex flex-col items-center gap-1.5">
          <span
            className={cn(
              "px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border",
              isError
                ? "bg-error-container/20 text-error border-error/10"
                : i.estado === "cobrado"
                  ? "bg-tertiary-container/10 text-on-tertiary-container border-on-tertiary-container/10"
                  : "bg-secondary-fixed text-on-secondary-fixed border-secondary/10",
            )}
          >
            {ESTADO_LABEL[i.estado ?? ""]}
          </span>
          {progreso > 0 && progreso < 100 && (
            <div className="w-20 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: `${progreso}%` }} />
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {(i.saldo ?? 0) > 0 && (
            <button onClick={onCobrar} title="Registrar cobro" className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-secondary/5 transition-colors">
              <CreditCard className="w-4 h-4" />
            </button>
          )}
          <button onClick={onEditar} title="Editar" className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-secondary/5 transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onToggle} title="Ver vencimientos" className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container-high transition-colors">
            <ChevronDown className={cn("w-4 h-4 transition-transform", expandido && "rotate-180")} />
          </button>
          {(i.cobrado ?? 0) === 0 && (
            <button onClick={onEliminar} title="Eliminar" className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function VencimientosDetalle({ ingreso, onCobrar }: { ingreso: Ingreso; onCobrar: (v: Vencimiento) => void }) {
  const moneda = ingreso.moneda as Moneda;
  const { data, loading } = useData(async () => {
    const venc = check(await supabase.from("v_ingreso_vencimientos").select("*").eq("ingreso_id", ingreso.id!).order("numero"));
    const cobros = check(
      await supabase
        .from("cobros")
        .select("id, fecha, importe, medio, anulado, cuentas(nombre), cheques(numero, banco_emisor, estado)")
        .in("ingreso_vencimiento_id", venc.map((v) => v.id!))
        .order("fecha"),
    );
    return { venc, cobros };
  }, [ingreso.id, ingreso.cobrado]);

  return (
    <tr className="bg-surface-container-low/40">
      <td colSpan={9} className="px-6 py-4">
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Plan de vencimientos</span>
              {data?.venc.map((v) => (
                <div key={v.id} className="flex items-center gap-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/20">
                  <span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-outline">#{v.numero}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                    <span className="font-numeric font-bold">{fecha(v.fecha_vencimiento)}</span>
                    <span className="font-numeric font-bold text-right">{money(v.importe, moneda)}</span>
                    <span className="text-[10px] text-on-surface-variant text-right">
                      Saldo <strong className="font-numeric">{money(v.saldo, moneda)}</strong>
                    </span>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                      v.estado === "cobrado"
                        ? "bg-tertiary-container/10 text-on-tertiary-container"
                        : v.estado === "vencido"
                          ? "bg-error-container/30 text-error"
                          : "bg-secondary-fixed text-on-secondary-fixed",
                    )}
                  >
                    {v.estado}
                  </span>
                  {(v.saldo ?? 0) > 0 && (
                    <button onClick={() => onCobrar(v)} className="px-3 py-1 rounded-lg bg-secondary text-on-secondary text-[10px] font-bold">
                      Cobrar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Cobros registrados</span>
              {data?.cobros.length === 0 && <p className="text-xs text-outline">Sin cobros.</p>}
              {data?.cobros.map((c) => (
                <div key={c.id} className={cn("flex items-center justify-between bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/20", c.anulado && "opacity-50 line-through")}>
                  <span className="font-numeric font-bold">{fecha(c.fecha)}</span>
                  <span className="text-[11px] text-on-surface-variant">
                    {c.medio === "cheque" && c.cheques
                      ? `Cheque #${c.cheques.numero} ${c.cheques.banco_emisor} (${c.cheques.estado.replace("_", " ")})`
                      : `${c.medio} → ${c.cuentas?.nombre ?? ""}`}
                  </span>
                  <span className="font-numeric font-bold text-on-tertiary-container">{money(c.importe, moneda)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Alta / edición de ingreso
// ---------------------------------------------------------------------------

/** id y cobrado solo aplican a vencimientos existentes (edición). */
type VencForm = { id?: number; cobrado: number; fecha: string; importe: number; medio: string; cuentaId: string };

type Catalogos = {
  clientes: { id: number; razon_social: string; cuit: string | null; tipo_ingreso_id: number | null }[];
  tipos: { id: number; nombre: string }[];
  cuentas: Cuenta[];
};

/** Carga los vencimientos del ingreso y abre el formulario en modo edición. */
function EditarIngresoModal({ ingreso, catalogos, onClose, onSaved }: { ingreso: Ingreso; catalogos: Catalogos; onClose: () => void; onSaved: () => void }) {
  const { data, error } = useData(
    async () => check(await supabase.from("v_ingreso_vencimientos").select("*").eq("ingreso_id", ingreso.id!).order("numero")),
    [ingreso.id],
  );
  if (error) {
    return (
      <Modal title="Editar Ingreso" onClose={onClose}>
        <ErrorBanner message={error} />
      </Modal>
    );
  }
  if (!data) return null;
  return <IngresoModal catalogos={catalogos} existente={{ ingreso, vencimientos: data }} onClose={onClose} onSaved={onSaved} />;
}

function IngresoModal({
  catalogos,
  existente,
  onClose,
  onSaved,
}: {
  catalogos: Catalogos;
  existente?: { ingreso: Ingreso; vencimientos: Vencimiento[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const hoy = hoyISO();
  const ing = existente?.ingreso;
  const [clienteId, setClienteId] = useState(String(ing?.cliente_id ?? catalogos.clientes[0]?.id ?? ""));
  const [tipoId, setTipoId] = useState(String(ing?.tipo_ingreso_id ?? catalogos.clientes[0]?.tipo_ingreso_id ?? catalogos.tipos[0]?.id ?? ""));
  const [fechaFactura, setFechaFactura] = useState(ing?.fecha_factura ?? hoy);
  const [moneda, setMoneda] = useState<Moneda>((ing?.moneda as Moneda) ?? "ARS");
  const [descripcion, setDescripcion] = useState(ing?.descripcion ?? "");
  const [comprobante, setComprobante] = useState(ing?.comprobante ?? "");
  const [total, setTotal] = useState(ing?.importe_total ?? NaN);
  const [vencs, setVencs] = useState<VencForm[]>(
    existente
      ? existente.vencimientos.map((v) => ({
          id: v.id!,
          cobrado: v.cobrado ?? 0,
          fecha: v.fecha_vencimiento!,
          importe: v.importe!,
          medio: v.medio_previsto ?? "Transferencia",
          cuentaId: v.cuenta_prevista_id ? String(v.cuenta_prevista_id) : "",
        }))
      : [{ cobrado: 0, fecha: sumarDias(hoy, 15), importe: NaN, medio: "Transferencia", cuentaId: "" }],
  );
  const { saving, error, setError, run } = useSubmit();
  const tieneCobros = (ing?.cobrado ?? 0) > 0;

  // El cliente actual puede estar inactivo: se agrega a las opciones para no perderlo
  const clientes =
    ing && !catalogos.clientes.some((c) => c.id === ing.cliente_id)
      ? [...catalogos.clientes, { id: ing.cliente_id!, razon_social: `${ing.cliente} (inactivo)`, cuit: ing.cliente_cuit, tipo_ingreso_id: null }]
      : catalogos.clientes;

  const asignado = vencs.reduce((s, v) => s + (Number.isFinite(v.importe) ? v.importe : 0), 0);
  const diferencia = Math.round(((Number.isFinite(total) ? total : 0) - asignado) * 100) / 100;

  // Con un solo vencimiento, el importe sigue al total
  useEffect(() => {
    if (vencs.length === 1) setVencs((vs) => [{ ...vs[0], importe: total }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  function repartir(n: number) {
    if (!Number.isFinite(total) || total <= 0) return;
    const cuota = Math.floor((total / n) * 100) / 100;
    setVencs((vs) =>
      Array.from({ length: n }, (_, k) => ({
        id: vs[k]?.id,
        cobrado: vs[k]?.cobrado ?? 0,
        fecha: vs[k]?.fecha ?? sumarMeses(vs[0]?.fecha ?? hoy, k),
        medio: vs[k]?.medio ?? "Transferencia",
        cuentaId: vs[k]?.cuentaId ?? "",
        importe: k === n - 1 ? Math.round((total - cuota * (n - 1)) * 100) / 100 : cuota,
      })),
    );
  }

  const setVenc = (k: number, patch: Partial<VencForm>) => setVencs((vs) => vs.map((v, j) => (j === k ? { ...v, ...patch } : v)));

  const guardar = () =>
    run(async () => {
      if (!clienteId || !tipoId) return setError("Elegí cliente y tipo de ingreso");
      if (!descripcion.trim()) return setError("La descripción es obligatoria");
      if (!(total > 0)) return setError("Ingresá el importe total");
      if (vencs.some((v) => !v.fecha || !(v.importe > 0))) return setError("Completá fecha e importe de cada vencimiento");
      if (diferencia !== 0) return setError("La suma de vencimientos debe ser igual al total");
      const bajo = vencs.findIndex((v) => v.importe < v.cobrado);
      if (bajo >= 0) return setError(`El vencimiento #${bajo + 1} no puede ser menor a lo ya cobrado (${money(vencs[bajo].cobrado, moneda)})`);
      const args = {
        p_cliente_id: Number(clienteId),
        p_tipo_ingreso_id: Number(tipoId),
        p_fecha_factura: fechaFactura,
        p_descripcion: descripcion.trim(),
        p_moneda: moneda,
        p_importe_total: total,
        p_comprobante: comprobante.trim() || undefined,
        p_vencimientos: vencs.map((v) => ({
          id: v.id ?? null,
          fecha_vencimiento: v.fecha,
          importe: v.importe,
          medio_previsto: v.medio || null,
          cuenta_prevista_id: v.cuentaId ? Number(v.cuentaId) : null,
        })),
      };
      if (ing) check(await supabase.rpc("actualizar_ingreso", { p_id: ing.id!, ...args }));
      else check(await supabase.rpc("crear_ingreso", args));
      onSaved();
    });

  const prefijo = moneda === "USD" ? "U$S" : "$";

  return (
    <Modal
      title={ing ? "Editar Ingreso" : "Nuevo Ingreso Facturado"}
      subtitle={ing ? `${ing.cliente} • ${ing.descripcion}` : "Emisión de factura y programación de vencimientos asociados"}
      icon={<Receipt className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-3xl"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            {ing ? "Guardar Cambios" : "Guardar Ingreso y Vencimientos"}
          </SubmitButton>
        </>
      }
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b-2 border-secondary pb-1">1. Datos del Comprobante</span>
          <span className="text-[10px] text-outline italic">* Campos obligatorios</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <FormGroup label="Cliente *">
            <select
              className={selectCls}
              value={clienteId}
              disabled={tieneCobros}
              title={tieneCobros ? "No se puede cambiar: el ingreso tiene cobros" : undefined}
              onChange={(e) => {
                setClienteId(e.target.value);
                const c = catalogos.clientes.find((x) => String(x.id) === e.target.value);
                if (c?.tipo_ingreso_id) setTipoId(String(c.tipo_ingreso_id));
              }}
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                  {c.cuit && ` (CUIT ${c.cuit})`}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Tipo de Ingreso *">
            <select className={selectCls} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
              {catalogos.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Fecha de Factura *">
            <input type="date" className={inputCls} value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
          </FormGroup>
          <FormGroup label="Moneda de Facturación *">
            <div className="flex items-center gap-6 h-10">
              {(["ARS", "USD"] as Moneda[]).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="currency" checked={moneda === m} disabled={tieneCobros} onChange={() => setMoneda(m)} className="text-secondary focus:ring-0 w-4 h-4" />
                  <span className="text-xs font-bold text-on-surface">{m === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"}</span>
                </label>
              ))}
            </div>
          </FormGroup>
          <FormGroup label="Descripción / Concepto *">
            <input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Abono soporte mensual servidores..." />
          </FormGroup>
          <FormGroup label="Comprobante">
            <input className={inputCls} value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Factura A-0004-00001254" />
          </FormGroup>
          <div className="sm:col-span-2 bg-surface-container-low/50 p-6 rounded-xl border border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-primary">Importe Total Facturado</span>
              <span className="text-[10px] text-on-surface-variant">Monto bruto final sin discriminación interna de retenciones</span>
            </div>
            <MoneyInput
              value={total}
              onChange={setTotal}
              prefix={prefijo}
              className="w-full sm:w-64"
              inputClassName="h-12 text-xl text-primary bg-surface-container-lowest border border-outline-variant/30 shadow-inner"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b-2 border-secondary pb-1">2. Planificación de Vencimientos</span>
          </div>
          <span className="text-[11px] font-medium text-on-surface-variant">
            Suma requerida: <strong className="text-primary font-numeric font-bold">{money(total || 0, moneda)}</strong>
          </span>
        </div>

        <div className="space-y-2">
          {vencs.map((v, k) => (
            <div key={k} className="flex flex-col sm:flex-row items-center gap-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/20 shadow-sm">
              <span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-outline">#{k + 1}</span>
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input type="date" className={cn(inputCls, "h-9 text-[11px] font-bold")} value={v.fecha} onChange={(e) => setVenc(k, { fecha: e.target.value })} />
                <div>
                  <MoneyInput value={v.importe} onChange={(n) => setVenc(k, { importe: n })} prefix={prefijo} inputClassName="h-9 text-[11px]" />
                  {v.cobrado > 0 && <span className="text-[9px] font-bold text-on-tertiary-container">Cobrado {money(v.cobrado, moneda)}</span>}
                </div>
                <select
                  className={cn(selectCls, "h-9 text-[11px] font-bold")}
                  value={v.cuentaId ? `c${v.cuentaId}` : v.medio}
                  onChange={(e) =>
                    e.target.value.startsWith("c")
                      ? setVenc(k, { cuentaId: e.target.value.slice(1), medio: "Transferencia" })
                      : setVenc(k, { cuentaId: "", medio: e.target.value })
                  }
                >
                  {catalogos.cuentas.map((c) => (
                    <option key={c.id} value={`c${c.id}`}>
                      Transferencia {c.nombre}
                    </option>
                  ))}
                  <option value="Transferencia">Transferencia (sin cuenta)</option>
                  <option value="eCheq">Cheque / eCheq</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="px-2.5 py-1 rounded bg-secondary/10 text-secondary font-bold text-[10px] font-numeric">
                  {porcentaje(Number.isFinite(v.importe) ? v.importe : 0, total || 0)}%
                </span>
                <button
                  type="button"
                  disabled={vencs.length === 1 || v.cobrado > 0}
                  title={v.cobrado > 0 ? "Tiene cobros: no se puede eliminar" : undefined}
                  onClick={() => setVencs((vs) => vs.filter((_, j) => j !== k))}
                  className="p-1.5 text-outline hover:text-error transition-colors rounded-lg hover:bg-error/5 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={vencs.length >= 12}
              onClick={() =>
                setVencs((vs) => [...vs, { cobrado: 0, fecha: sumarMeses(vs[vs.length - 1]?.fecha ?? hoy, 1), importe: Math.max(diferencia, 0) || NaN, medio: "Transferencia", cuentaId: "" }])
              }
              className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-secondary hover:bg-secondary/5 rounded-lg transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Agregar Vencimiento
            </button>
            <button type="button" onClick={() => repartir(vencs.length)} className="px-3 py-2 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high rounded-lg">
              Repartir en partes iguales
            </button>
          </div>
          <span className="text-[10px] text-outline font-medium">Máximo 12 cuotas</span>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-outline uppercase">Total Asignado</span>
              <span className="font-numeric text-sm font-bold text-primary">{money(asignado, moneda)}</span>
            </div>
            <div className="h-8 w-px bg-outline-variant/20" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-outline uppercase">Diferencia</span>
              <span className={cn("font-numeric text-sm font-bold", diferencia === 0 ? "text-on-tertiary-container" : "text-error")}>{money(diferencia, moneda)}</span>
            </div>
          </div>
          {diferencia === 0 && total > 0 ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-tertiary-container/20 text-on-tertiary-container text-[10px] font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              Cuadre Exacto: 100% asignado
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-error-container/30 text-error text-[10px] font-bold">
              <AlertCircle className="w-3.5 h-3.5" />
              Falta cuadrar {money(diferencia, moneda)}
            </div>
          )}
        </div>
      </div>
      <ErrorBanner message={error} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Registrar cobro
// ---------------------------------------------------------------------------

function CobroModal({
  ingreso,
  vencimientoInicial,
  cuentas,
  tc,
  onClose,
  onSaved,
}: {
  ingreso: Ingreso;
  vencimientoInicial?: Vencimiento;
  cuentas: Cuenta[];
  tc: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const moneda = ingreso.moneda as Moneda;
  const { data: vencs } = useData(async () =>
    check(await supabase.from("v_ingreso_vencimientos").select("*").eq("ingreso_id", ingreso.id!).gt("saldo", 0).order("numero")),
  );

  const [vencId, setVencId] = useState<string>(vencimientoInicial ? String(vencimientoInicial.id) : "");
  const venc = vencs?.find((v) => String(v.id) === vencId) ?? vencs?.[0];
  const [importe, setImporte] = useState(vencimientoInicial?.saldo ?? NaN);
  const [fechaC, setFechaC] = useState(hoyISO());
  const [medio, setMedio] = useState<"transferencia" | "efectivo" | "deposito" | "cheque">("transferencia");
  const [cuentaId, setCuentaId] = useState(String(cuentas.find((c) => c.moneda === moneda)?.id ?? cuentas[0]?.id ?? ""));
  const [tcCobro, setTcCobro] = useState(tc ?? NaN);
  const [ch, setCh] = useState({ banco_emisor: "", numero: "", tipo: "echeq", fecha_pago: sumarDias(hoyISO(), 30), librador: ingreso.cliente ?? "", librador_cuit: ingreso.cliente_cuit ?? "" });
  const { saving, error, setError, run } = useSubmit();

  useEffect(() => {
    if (!vencId && vencs?.[0]) {
      setVencId(String(vencs[0].id));
      setImporte(vencs[0].saldo ?? NaN);
    }
  }, [vencs, vencId]);

  const cuenta = cuentas.find((c) => String(c.id) === cuentaId);
  const necesitaTc = medio === "cheque" ? moneda === "USD" : cuenta && cuenta.moneda !== moneda;

  const guardar = () =>
    run(async () => {
      if (!venc) return setError("No hay vencimientos pendientes");
      if (!(importe > 0)) return setError("Ingresá el importe cobrado");
      if (importe > (venc.saldo ?? 0)) return setError(`El importe supera el saldo del vencimiento (${money(venc.saldo, moneda)})`);
      if (necesitaTc && !(tcCobro > 0)) return setError("Ingresá el tipo de cambio");
      if (medio === "cheque" && (!ch.banco_emisor.trim() || !ch.numero.trim() || !ch.fecha_pago)) return setError("Completá banco, número y fecha de pago del cheque");
      if (medio !== "cheque" && !cuenta) return setError("Elegí la cuenta destino");
      check(
        await supabase.rpc("registrar_cobro", {
          p_vencimiento_id: venc.id!,
          p_fecha: fechaC,
          p_importe: importe,
          p_medio: medio,
          p_cuenta_id: medio === "cheque" ? undefined : cuenta!.id,
          p_tc: necesitaTc || moneda === "USD" ? tcCobro : undefined,
          p_cheque: medio === "cheque" ? ch : undefined,
        }),
      );
      onSaved();
    });

  return (
    <Modal
      title="Registrar Cobro"
      subtitle={`${ingreso.cliente} • ${ingreso.descripcion}`}
      icon={<CreditCard className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Confirmar Cobro
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Vencimiento *" className="sm:col-span-2">
          <select
            className={selectCls}
            value={venc ? String(venc.id) : ""}
            onChange={(e) => {
              setVencId(e.target.value);
              setImporte(vencs?.find((v) => String(v.id) === e.target.value)?.saldo ?? NaN);
            }}
          >
            {vencs?.map((v) => (
              <option key={v.id} value={v.id!}>
                Cuota #{v.numero} • vence {fecha(v.fecha_vencimiento)} • saldo {money(v.saldo, moneda)}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Fecha de cobro *">
          <input type="date" className={inputCls} value={fechaC} onChange={(e) => setFechaC(e.target.value)} />
        </FormGroup>
        <FormGroup label={`Importe cobrado * (${moneda})`}>
          <MoneyInput value={importe} onChange={setImporte} prefix={moneda === "USD" ? "U$S" : "$"} />
        </FormGroup>
        <FormGroup label="Medio de cobro *">
          <select className={selectCls} value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
            <option value="transferencia">Transferencia</option>
            <option value="deposito">Depósito</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque / eCheq (entra a cartera)</option>
          </select>
        </FormGroup>
        {medio !== "cheque" && (
          <FormGroup label="Cuenta destino *">
            <select className={selectCls} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda})
                </option>
              ))}
            </select>
          </FormGroup>
        )}
        {(necesitaTc || moneda === "USD") && (
          <FormGroup label="Tipo de cambio (ARS por USD) *">
            <MoneyInput value={tcCobro} onChange={setTcCobro} />
          </FormGroup>
        )}
      </div>

      {medio === "cheque" && (
        <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <span className="sm:col-span-2 text-[10px] font-bold text-secondary uppercase tracking-widest">Datos del cheque</span>
          <FormGroup label="Banco emisor *">
            <input className={inputCls} value={ch.banco_emisor} onChange={(e) => setCh({ ...ch, banco_emisor: e.target.value })} />
          </FormGroup>
          <FormGroup label="Número *">
            <input className={inputCls} value={ch.numero} onChange={(e) => setCh({ ...ch, numero: e.target.value })} />
          </FormGroup>
          <FormGroup label="Tipo">
            <select className={selectCls} value={ch.tipo} onChange={(e) => setCh({ ...ch, tipo: e.target.value })}>
              <option value="echeq">eCheq</option>
              <option value="fisico">Cheque físico</option>
            </select>
          </FormGroup>
          <FormGroup label="Fecha de pago *">
            <input type="date" className={inputCls} value={ch.fecha_pago} onChange={(e) => setCh({ ...ch, fecha_pago: e.target.value })} />
          </FormGroup>
          <FormGroup label="Librador">
            <input className={inputCls} value={ch.librador} onChange={(e) => setCh({ ...ch, librador: e.target.value })} />
          </FormGroup>
          <FormGroup label="CUIT librador">
            <input className={inputCls} value={ch.librador_cuit} onChange={(e) => setCh({ ...ch, librador_cuit: e.target.value })} />
          </FormGroup>
          {moneda === "USD" && Number.isFinite(importe) && tcCobro > 0 && (
            <p className="sm:col-span-2 text-[11px] text-on-surface-variant">
              Importe del cheque: <strong className="font-numeric">{money(importe * tcCobro)}</strong>
            </p>
          )}
        </div>
      )}
      <ErrorBanner message={error} />
    </Modal>
  );
}
