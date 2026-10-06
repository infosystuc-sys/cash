import React, { useMemo, useState } from "react";
import {
  Receipt,
  PlusCircle,
  Download,
  Printer,
  Search,
  History,
  AlertTriangle,
  CheckCircle,
  Building2,
  ArrowLeftRight,
  Landmark,
  Ban,
  Info,
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, iniciales, money, sumarDias, textoVencimiento } from "./lib/format";
import { ProveedorModal } from "./Proveedores";
import {
  CancelButton,
  EmptyRow,
  ErrorBanner,
  FormGroup,
  Loading,
  Modal,
  MoneyInput,
  SubmitButton,
  inputCls,
  selectCls,
  useSubmit,
} from "./components/ui";

type Cheque = Row<"v_cheques">;
type Tab = "todos" | "en_cartera" | "endosado" | "depositado" | "rechazado";

const ESTADO_LABEL: Record<string, string> = {
  en_cartera: "En cartera",
  endosado: "Endosado",
  depositado: "Depositado",
  rechazado: "Rechazado",
};

export default function Cheques() {
  const [tab, setTab] = useState<Tab>("en_cartera");
  const [proximos, setProximos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [accion, setAccion] = useState<{ tipo: "endosar" | "depositar" | "rechazar"; cheque: Cheque } | null>(null);
  const [cargar, setCargar] = useState(false);

  const { data, loading, error, reload } = useData(async () =>
    check(await supabase.from("v_cheques").select("*").order("fecha_pago", { ascending: true })),
  );

  const cheques = data ?? [];
  const cartera = cheques.filter((c) => c.estado === "en_cartera");
  const proximos7 = cartera.filter((c) => (c.dias_para_pago ?? 99) <= 7);
  const endosados = cheques.filter((c) => c.estado === "endosado");
  const suma = (l: Cheque[]) => l.reduce((s, c) => s + (c.importe ?? 0), 0);

  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return cheques.filter((c) => {
      if (tab !== "todos" && c.estado !== tab) return false;
      if (proximos && !(c.estado === "en_cartera" && (c.dias_para_pago ?? 99) <= 7)) return false;
      if (q && !`${c.cliente ?? ""} ${c.librador ?? ""} ${c.banco_emisor} ${c.numero}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cheques, tab, proximos, busqueda]);

  const count = (e: Tab) => (e === "todos" ? cheques.length : cheques.filter((c) => c.estado === e).length);

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tesorería y Medios de Pago</span>
            <span className="text-outline text-xs">/</span>
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Cartera de Cheques</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Gestión de Cheques</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() =>
              exportCsv(
                `cheques-${hoyISO()}`,
                filas.map((c) => ({
                  Cliente: c.cliente,
                  Librador: c.librador,
                  Banco: c.banco_emisor,
                  Numero: c.numero,
                  Tipo: c.tipo,
                  Importe: c.importe,
                  "Fecha pago": fecha(c.fecha_pago),
                  Estado: ESTADO_LABEL[c.estado ?? ""],
                  "Endosado a": c.proveedor_endoso,
                  "Depositado en": c.cuenta_deposito,
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
            <Printer className="w-4 h-4 text-outline" />
            Reporte PDF
          </button>
          <button
            onClick={() => setCargar(true)}
            className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            Cargar Cheque
          </button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Total en Cartera"
          value={money(suma(cartera))}
          icon={<Receipt />}
          subtitle={`${cartera.length} cheques en custodia`}
          extra="ARS"
          color="text-secondary"
          bgColor="bg-secondary-fixed/30"
        />
        <KpiCard
          title="A Cobrar en ≤ 7 Días"
          value={money(suma(proximos7))}
          icon={<History />}
          subtitle={`${proximos7.length} cheques con vencimiento inminente`}
          extra="Próx. 7 días"
          color="text-error"
          bgColor="bg-error-container/20"
          isAlert={proximos7.length > 0}
        />
        <KpiCard
          title="Total Endosados (Histórico)"
          value={money(suma(endosados))}
          icon={<ArrowLeftRight />}
          subtitle={`${endosados.length} cheques endosados`}
          extra={`${endosados.length} Operaciones`}
          color="text-on-tertiary-container"
          bgColor="bg-surface-container-high/40"
        />
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex p-1 rounded-xl bg-surface-container-low gap-1 flex-wrap">
          <TabButton active={tab === "todos"} onClick={() => setTab("todos")} label="Todos" count={count("todos")} />
          <TabButton
            active={tab === "en_cartera"}
            onClick={() => setTab("en_cartera")}
            label="En cartera"
            count={count("en_cartera")}
            countColor="bg-secondary-fixed text-on-secondary-fixed"
          />
          <TabButton active={tab === "endosado"} onClick={() => setTab("endosado")} label="Endosados" count={count("endosado")} />
          <TabButton active={tab === "depositado"} onClick={() => setTab("depositado")} label="Depositados" count={count("depositado")} />
          <TabButton active={tab === "rechazado"} onClick={() => setTab("rechazado")} label="Rechazados" count={count("rechazado")} />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors group">
            <input type="checkbox" checked={proximos} onChange={(e) => setProximos(e.target.checked)} className="w-4 h-4 rounded text-secondary focus:ring-0 cursor-pointer" />
            <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-error" />
              Próximos a vencer (≤ 7 días)
            </span>
          </label>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
              placeholder="Cliente, Banco o N° Cheque..."
            />
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Main Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-6 py-4">Cliente / Librador</th>
                  <th className="px-4 py-4">Banco Emisor</th>
                  <th className="px-4 py-4">N° Cheque / Tipo</th>
                  <th className="px-4 py-4 text-right">Importe</th>
                  <th className="px-4 py-4 text-center">Fecha de Pago</th>
                  <th className="px-4 py-4">Vencimiento / Destino</th>
                  <th className="px-4 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-xs">
                {filas.length === 0 && <EmptyRow colSpan={8} label="No hay cheques" />}
                {filas.map((c) => (
                  <CheckRow
                    key={c.id}
                    cheque={c}
                    onEndosar={() => setAccion({ tipo: "endosar", cheque: c })}
                    onDepositar={() => setAccion({ tipo: "depositar", cheque: c })}
                    onRechazar={() => setAccion({ tipo: "rechazar", cheque: c })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 bg-surface-container-low/30 flex items-center justify-between border-t border-outline-variant/10">
          <span className="text-[10px] text-on-surface-variant font-medium">
            Mostrando <span className="font-bold text-on-surface">{filas.length}</span> de{" "}
            <span className="font-bold text-on-surface">{cheques.length}</span> cheques totales
          </span>
        </div>
      </div>

      {accion?.tipo === "endosar" && <EndosoModal cheque={accion.cheque} onClose={() => setAccion(null)} onSaved={() => (setAccion(null), reload())} />}
      {accion?.tipo === "depositar" && <DepositoModal cheque={accion.cheque} onClose={() => setAccion(null)} onSaved={() => (setAccion(null), reload())} />}
      {accion?.tipo === "rechazar" && <RechazoModal cheque={accion.cheque} onClose={() => setAccion(null)} onSaved={() => (setAccion(null), reload())} />}
      {cargar && <CargarChequeModal onClose={() => setCargar(false)} onSaved={() => (setCargar(false), reload())} />}
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
  bgColor,
  isAlert = false,
}: {
  title: string;
  value: string;
  icon: React.ReactElement<{ className?: string }>;
  subtitle: string;
  extra: string;
  color: string;
  bgColor: string;
  isAlert?: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm flex flex-col justify-between group hover:border-secondary/30 transition-all">
      <div className={cn("absolute right-0 top-0 w-32 h-32 rounded-bl-[80px] pointer-events-none transition-transform group-hover:scale-110", bgColor)} />
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-outline uppercase tracking-widest font-display">{title}</span>
            {isAlert && (
              <span className="px-2 py-0.5 rounded-full bg-error-container/20 text-error text-[9px] font-bold uppercase tracking-wider animate-pulse border border-error/10">
                Atención
              </span>
            )}
          </div>
          <div className={cn("p-2 rounded-lg transition-colors group-hover:bg-secondary group-hover:text-on-secondary", color)}>
            {React.cloneElement(icon, { className: "w-5 h-5" })}
          </div>
        </div>
        <div className={cn("mt-4 text-2xl font-bold font-numeric tracking-tight transition-transform group-hover:translate-x-1", color)}>{value}</div>
      </div>
      <div className="relative z-10 mt-6 pt-3 flex items-center justify-between border-t border-outline-variant/10">
        <span className="text-[10px] text-on-surface-variant font-medium">{subtitle}</span>
        <span className={cn("text-[9px] font-bold uppercase tracking-widest", color)}>{extra}</span>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  countColor = "bg-surface-container-high text-on-surface-variant",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  countColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
        active ? "bg-surface-container-lowest text-primary shadow-sm border border-outline-variant/10" : "text-on-surface-variant hover:text-on-surface",
      )}
    >
      {label}
      <span className={cn("px-1.5 rounded-full text-[9px] font-numeric", countColor)}>{count}</span>
    </button>
  );
}

function CheckRow({
  cheque: c,
  onEndosar,
  onDepositar,
  onRechazar,
}: {
  cheque: Cheque;
  onEndosar: () => void;
  onDepositar: () => void;
  onRechazar: () => void;
}) {
  const enCartera = c.estado === "en_cartera";
  const isUrgent = enCartera && (c.dias_para_pago ?? 99) <= 7;
  const nombre = c.cliente ?? c.librador ?? "—";
  return (
    <tr className={cn("hover:bg-surface-container-low/50 transition-colors group", c.estado === "rechazado" && "bg-error-container/5")}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-primary text-[10px] shadow-sm transition-transform group-hover:scale-110">
            {iniciales(nombre)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-primary truncate">{nombre}</span>
            {(c.librador_cuit || c.cliente_cuit) && (
              <span className="text-[9px] font-bold text-outline uppercase tracking-tighter">CUIT {c.librador_cuit ?? c.cliente_cuit}</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary-container/10 text-primary flex items-center justify-center border border-outline-variant/10">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-on-surface text-xs">{c.banco_emisor}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="font-numeric font-bold text-primary">#{c.numero}</span>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-secondary uppercase">
            <div className="w-1 h-1 rounded-full bg-secondary" /> {c.tipo === "echeq" ? "eCheq" : "Cheque Físico"}
          </span>
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="font-numeric font-bold text-sm text-primary tracking-tight">{money(c.importe)}</span>
      </td>
      <td className="px-4 py-4 text-center font-numeric font-bold text-on-surface">{fecha(c.fecha_pago)}</td>
      <td className="px-4 py-4">
        {enCartera ? (
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-sm",
              isUrgent ? "bg-error-container/20 text-error border border-error/10" : "bg-surface-container-high text-on-surface-variant border border-outline-variant/10",
            )}
          >
            {isUrgent && <AlertTriangle className="w-3 h-3" />}
            {textoVencimiento(c.fecha_pago, "Se cobra")}
          </div>
        ) : (
          <span className="text-[11px] text-on-surface-variant font-medium">
            {c.estado === "endosado" && `→ ${c.proveedor_endoso} (${fecha(c.fecha_endoso)})`}
            {c.estado === "depositado" && `→ ${c.cuenta_deposito} (${fecha(c.fecha_deposito)})`}
            {c.estado === "rechazado" && `${fecha(c.fecha_rechazo)} ${c.motivo_rechazo ?? ""}`}
          </span>
        )}
      </td>
      <td className="px-4 py-4 text-center">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase border border-outline-variant/10",
            c.estado === "rechazado" ? "bg-error-container/30 text-error" : "bg-surface-container-high text-primary",
          )}
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              c.estado === "en_cartera" ? "bg-on-tertiary-container" : c.estado === "rechazado" ? "bg-error" : "bg-outline",
            )}
          />{" "}
          {ESTADO_LABEL[c.estado ?? ""]}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {enCartera && (
            <>
              <button
                onClick={onEndosar}
                className="flex items-center gap-1.5 px-4 py-1 bg-secondary text-on-secondary rounded-lg text-[11px] font-bold hover:bg-secondary-container transition-all shadow-sm active:scale-[0.98]"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Endosar
              </button>
              <button onClick={onDepositar} title="Depositar" className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-surface-container-high transition-colors">
                <Landmark className="w-4 h-4" />
              </button>
            </>
          )}
          {(enCartera || c.estado === "depositado") && (
            <button onClick={onRechazar} title="Marcar rechazado" className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors">
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ChequeResumen({ cheque }: { cheque: Cheque }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-[9px] font-bold text-outline uppercase tracking-widest">Instrumento Seleccionado</span>
        <span className="font-bold text-primary">
          Cheque #{cheque.numero} • {cheque.banco_emisor}
        </span>
        <span className="text-[10px] text-on-surface-variant">
          {cheque.cliente ?? cheque.librador} • Pago {fecha(cheque.fecha_pago)} ({textoVencimiento(cheque.fecha_pago, "se cobra")})
        </span>
      </div>
      <span className="font-numeric font-bold text-xl text-primary">{money(cheque.importe)}</span>
    </div>
  );
}

function EndosoModal({ cheque, onClose, onSaved }: { cheque: Cheque; onClose: () => void; onSaved: () => void }) {
  const { data: cat, reload } = useData(async () => {
    const [proveedores, categorias, tc] = await Promise.all([
      supabase.from("proveedores").select("id, razon_social, cuit").eq("activo", true).order("razon_social"),
      supabase.from("categorias_egreso").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return { proveedores: check(proveedores), categorias: check(categorias), tc: tc.data?.venta ?? null };
  });

  const [proveedorId, setProveedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fechaE, setFechaE] = useState(hoyISO());
  const [tipo, setTipo] = useState<"nominativo" | "garantia">("nominativo");
  const [motivo, setMotivo] = useState("");
  const [cuotaId, setCuotaId] = useState("");
  const [tc, setTc] = useState(NaN);
  const [nuevoProv, setNuevoProv] = useState(false);
  const { saving, error, setError, run } = useSubmit();

  const { data: cuotas } = useData(async () => {
    if (!proveedorId) return [];
    return check(
      await supabase
        .from("v_deuda_cuotas")
        .select("id, numero, fecha_vencimiento, saldo, moneda, deuda_id, deudas(concepto, categoria_egreso_id)")
        .eq("proveedor_id", Number(proveedorId))
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
    );
  }, [proveedorId]);

  const cuota = cuotas?.find((q) => String(q.id) === cuotaId);
  const esUSD = cuota?.moneda === "USD";
  const tcEfectivo = Number.isFinite(tc) ? tc : cat?.tc ?? NaN;

  const guardar = () =>
    run(async () => {
      if (!proveedorId) return setError("Elegí el proveedor que recibe el endoso");
      const categoria = categoriaId || (cuota?.deudas?.categoria_egreso_id ? String(cuota.deudas.categoria_egreso_id) : "");
      if (!categoria) return setError("Elegí la categoría de egreso");
      if (esUSD && !(tcEfectivo > 0)) return setError("Indicá el tipo de cambio");
      check(
        await supabase.rpc("endosar_cheque", {
          p_cheque_id: cheque.id!,
          p_fecha: fechaE,
          p_proveedor_id: Number(proveedorId),
          p_categoria_egreso_id: Number(categoria),
          p_tipo_endoso: tipo,
          p_motivo: motivo.trim() || undefined,
          p_deuda_cuota_id: cuota ? cuota.id! : undefined,
          p_tc: esUSD ? tcEfectivo : undefined,
        }),
      );
      onSaved();
    });

  return (
    <Modal
      title="Endosar Cheque a Proveedor"
      subtitle="Operación de Tesorería • Cancelación de Egresos"
      icon={<ArrowLeftRight className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Confirmar Endoso
          </SubmitButton>
        </>
      }
    >
      <ChequeResumen cheque={cheque} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Fecha de Endoso *">
          <input type="date" className={inputCls} value={fechaE} onChange={(e) => setFechaE(e.target.value)} />
        </FormGroup>
        <FormGroup label="Tipo de Transmisión">
          <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="nominativo">Endoso Nominativo Completo</option>
            <option value="garantia">Endoso en Garantía</option>
          </select>
        </FormGroup>
        <FormGroup label="Destinatario / Proveedor que recibe el endoso *" className="sm:col-span-2">
          <select
            className={selectCls}
            value={proveedorId}
            onChange={(e) => {
              if (e.target.value === "nuevo") return setNuevoProv(true);
              setProveedorId(e.target.value);
              setCuotaId("");
            }}
          >
            <option value="">Seleccionar…</option>
            {cat?.proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razon_social}
                {p.cuit && ` (${p.cuit})`}
              </option>
            ))}
            <option value="nuevo">+ Nuevo proveedor…</option>
          </select>
        </FormGroup>
        <FormGroup label="Imputar a deuda pendiente (opcional)" className="sm:col-span-2">
          <select className={selectCls} value={cuotaId} onChange={(e) => setCuotaId(e.target.value)} disabled={!proveedorId}>
            <option value="">Sin vincular a deuda</option>
            {cuotas?.map((q) => (
              <option key={q.id} value={q.id!}>
                {q.deudas?.concepto} • Cuota {q.numero} • vence {fecha(q.fecha_vencimiento)} • saldo {money(q.saldo, q.moneda as "ARS" | "USD")}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label={`Categoría de egreso${cuota ? "" : " *"}`}>
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">{cuota ? "La de la deuda" : "Seleccionar…"}</option>
            {cat?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </FormGroup>
        {esUSD && (
          <FormGroup label="TC para imputar a deuda USD *">
            <MoneyInput value={tcEfectivo} onChange={setTc} />
          </FormGroup>
        )}
        <FormGroup label="Motivo / Imputación de Pago (Opcional)" className="sm:col-span-2">
          <input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Cancelación de factura A-0004-9812" />
        </FormGroup>
      </div>
      <div className="flex gap-3 p-4 rounded-xl bg-secondary-fixed/20 border border-secondary/10 text-[11px] text-on-surface-variant">
        <Info className="w-4 h-4 text-secondary shrink-0" />
        <p>
          Al confirmar, el cheque pasa de <strong>En cartera</strong> a <strong>Endosado</strong> y se registra como egreso pagado con cheque
          {cuota && " imputado a la cuota seleccionada"}.
        </p>
      </div>
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

function DepositoModal({ cheque, onClose, onSaved }: { cheque: Cheque; onClose: () => void; onSaved: () => void }) {
  const { data: cuentas } = useData(async () =>
    check(await supabase.from("cuentas").select("id, nombre").eq("activa", true).eq("moneda", "ARS").neq("tipo", "efectivo").order("id")),
  );
  const [cuentaId, setCuentaId] = useState("");
  const [fechaD, setFechaD] = useState(cheque.fecha_pago && cheque.fecha_pago > hoyISO() ? hoyISO() : cheque.fecha_pago ?? hoyISO());
  const { saving, error, setError, run } = useSubmit();
  const cuenta = cuentaId || String(cuentas?.[0]?.id ?? "");

  const guardar = () =>
    run(async () => {
      if (!cuenta) return setError("Elegí la cuenta");
      check(await supabase.rpc("depositar_cheque", { p_cheque_id: cheque.id!, p_cuenta_id: Number(cuenta), p_fecha: fechaD }));
      onSaved();
    });

  return (
    <Modal
      title="Depositar Cheque"
      subtitle="El importe se acredita en la cuenta elegida"
      icon={<Landmark className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            Confirmar Depósito
          </SubmitButton>
        </>
      }
    >
      <ChequeResumen cheque={cheque} />
      <FormGroup label="Cuenta de depósito (ARS) *">
        <select className={selectCls} value={cuenta} onChange={(e) => setCuentaId(e.target.value)}>
          {cuentas?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </FormGroup>
      <FormGroup label="Fecha de acreditación *">
        <input type="date" className={inputCls} value={fechaD} onChange={(e) => setFechaD(e.target.value)} />
      </FormGroup>
      <ErrorBanner message={error} />
    </Modal>
  );
}

function RechazoModal({ cheque, onClose, onSaved }: { cheque: Cheque; onClose: () => void; onSaved: () => void }) {
  const [fechaR, setFechaR] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const { saving, error, run } = useSubmit();

  const guardar = () =>
    run(async () => {
      check(await supabase.rpc("rechazar_cheque", { p_cheque_id: cheque.id!, p_fecha: fechaR, p_motivo: motivo.trim() || undefined }));
      onSaved();
    });

  return (
    <Modal
      title="Cheque Rechazado"
      subtitle="Anula el cobro asociado y la factura vuelve a quedar pendiente"
      icon={<Ban className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            Marcar como Rechazado
          </SubmitButton>
        </>
      }
    >
      <ChequeResumen cheque={cheque} />
      {cheque.estado === "depositado" && (
        <p className="text-[11px] text-error font-bold">Ya estaba depositado en {cheque.cuenta_deposito}: se registrará el débito por rechazo en esa cuenta.</p>
      )}
      <FormGroup label="Fecha de rechazo *">
        <input type="date" className={inputCls} value={fechaR} onChange={(e) => setFechaR(e.target.value)} />
      </FormGroup>
      <FormGroup label="Motivo">
        <input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sin fondos suficientes" />
      </FormGroup>
      <ErrorBanner message={error} />
    </Modal>
  );
}

/** Carga un cheque recibido: aplicado a una factura pendiente (registra el cobro) o suelto. */
function CargarChequeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: cat } = useData(async () => {
    const [clientes, venc] = await Promise.all([
      supabase.from("clientes").select("id, razon_social, cuit").eq("activo", true).order("razon_social"),
      supabase
        .from("v_ingreso_vencimientos")
        .select("id, numero, fecha_vencimiento, saldo, moneda, cliente_id, ingresos(descripcion, comprobante)")
        .gt("saldo", 0)
        .eq("moneda", "ARS")
        .order("fecha_vencimiento"),
    ]);
    return { clientes: check(clientes), venc: check(venc) };
  });

  const [clienteId, setClienteId] = useState("");
  const [vencId, setVencId] = useState("");
  const [importe, setImporte] = useState(NaN);
  const [f, setF] = useState({ banco_emisor: "", numero: "", tipo: "echeq" as "echeq" | "fisico", fecha_pago: sumarDias(hoyISO(), 30), librador: "", librador_cuit: "" });
  const { saving, error, setError, run } = useSubmit();

  const cliente = cat?.clientes.find((c) => String(c.id) === clienteId);
  const vencs = cat?.venc.filter((v) => String(v.cliente_id) === clienteId) ?? [];
  const venc = vencs.find((v) => String(v.id) === vencId);

  const guardar = () =>
    run(async () => {
      if (!clienteId) return setError("Elegí el cliente");
      if (!f.banco_emisor.trim() || !f.numero.trim() || !f.fecha_pago) return setError("Completá banco, número y fecha de pago");
      if (!(importe > 0)) return setError("Ingresá el importe");
      const cheque = {
        ...f,
        librador: f.librador.trim() || cliente?.razon_social || null,
        librador_cuit: f.librador_cuit.trim() || cliente?.cuit || null,
      };
      if (venc) {
        if (importe > (venc.saldo ?? 0)) return setError(`El importe supera el saldo de la factura (${money(venc.saldo)})`);
        check(
          await supabase.rpc("registrar_cobro", {
            p_vencimiento_id: venc.id!,
            p_fecha: hoyISO(),
            p_importe: importe,
            p_medio: "cheque",
            p_cheque: cheque,
          }),
        );
      } else {
        check(await supabase.from("cheques").insert({ ...cheque, cliente_id: Number(clienteId), importe }));
      }
      onSaved();
    });

  return (
    <Modal
      title="Cargar Cheque Recibido"
      subtitle="Ingresa a la cartera de cheques"
      icon={<Receipt className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Guardar Cheque
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Cliente *">
          <select
            className={selectCls}
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setVencId("");
            }}
          >
            <option value="">Seleccionar…</option>
            {cat?.clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razon_social}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Aplicar a factura pendiente">
          <select
            className={selectCls}
            value={vencId}
            onChange={(e) => {
              setVencId(e.target.value);
              const v = vencs.find((x) => String(x.id) === e.target.value);
              if (v) setImporte(v.saldo ?? NaN);
            }}
            disabled={!clienteId}
          >
            <option value="">Sin factura (cheque suelto)</option>
            {vencs.map((v) => (
              <option key={v.id} value={v.id!}>
                {v.ingresos?.comprobante ?? v.ingresos?.descripcion} • cuota {v.numero} • saldo {money(v.saldo)}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Banco emisor *">
          <input className={inputCls} value={f.banco_emisor} onChange={(e) => setF({ ...f, banco_emisor: e.target.value })} />
        </FormGroup>
        <FormGroup label="Número *">
          <input className={inputCls} value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
        </FormGroup>
        <FormGroup label="Tipo">
          <select className={selectCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as "echeq" | "fisico" })}>
            <option value="echeq">eCheq</option>
            <option value="fisico">Cheque físico</option>
          </select>
        </FormGroup>
        <FormGroup label="Fecha de pago *">
          <input type="date" className={inputCls} value={f.fecha_pago} onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} />
        </FormGroup>
        <FormGroup label="Importe *">
          <MoneyInput value={importe} onChange={setImporte} />
        </FormGroup>
        <FormGroup label="Librador (si no es el cliente)">
          <input className={inputCls} value={f.librador} onChange={(e) => setF({ ...f, librador: e.target.value })} placeholder={cliente?.razon_social} />
        </FormGroup>
      </div>
      <ErrorBanner message={error} />
    </Modal>
  );
}
