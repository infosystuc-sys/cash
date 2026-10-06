import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlusCircle, Download, Search, History, CheckCircle, Settings, TrendingDown, Trash2 } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, money, porcentaje, sumarDias, sumarMeses, type Moneda } from "./lib/format";
import { ProveedorModal } from "./Proveedores";
import { codigoDeuda } from "./Deudas";
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

type Egreso = Row<"v_egresos">;
type Periodo = "mes" | "mes_anterior" | "trimestre" | "anio";

const MEDIO_LABEL: Record<string, string> = {
  transferencia: "Transf.",
  debito_automatico: "Débito Aut.",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  cheque_endosado: "Cheque endosado",
};

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Mes en curso",
  mes_anterior: "Mes anterior",
  trimestre: "Últimos 3 meses",
  anio: "Año en curso",
};

function rango(p: Periodo): [string, string] {
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + "01";
  if (p === "mes") return [inicioMes, sumarDias(sumarMeses(inicioMes, 1), -1)];
  if (p === "mes_anterior") return [sumarMeses(inicioMes, -1), sumarDias(inicioMes, -1)];
  if (p === "trimestre") return [sumarMeses(inicioMes, -2), hoy];
  return [hoy.slice(0, 4) + "-01-01", hoy.slice(0, 4) + "-12-31"];
}

export const codigoEgreso = (id: number | null | undefined) => `EGR-${String(id ?? 0).padStart(5, "0")}`;

export default function Egresos() {
  const [params, setParams] = useSearchParams();
  const [nuevo, setNuevo] = useState(params.get("nuevo") === "1");

  useEffect(() => {
    if (params.get("nuevo") === "1") {
      setNuevo(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const [desde, hasta] = rango(periodo);
  const { data, loading, error, reload } = useData(async () => {
    const [egresos, categorias] = await Promise.all([
      supabase.from("v_egresos").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("id", { ascending: false }),
      supabase.from("categorias_egreso").select("id, nombre, color").order("nombre"),
    ]);
    return { egresos: check(egresos), categorias: check(categorias) };
  }, [desde, hasta]);

  const egresos = data?.egresos ?? [];
  const total = egresos.reduce((s, e) => s + (e.importe_ars ?? 0), 0);

  const distribucion = useMemo(() => {
    const m = new Map<string, { label: string; color: string; total: number }>();
    for (const e of egresos) {
      const k = e.categoria ?? "—";
      const cur = m.get(k) ?? { label: k, color: e.categoria_color ?? "#75777D", total: 0 };
      cur.total += e.importe_ars ?? 0;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [egresos]);

  const filas = egresos.filter((e) => {
    const q = busqueda.toLowerCase().trim();
    if (categoriaId && String(e.categoria_egreso_id) !== categoriaId) return false;
    if (q && !`${e.concepto} ${e.proveedor ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  async function eliminar(e: Egreso) {
    if (e.medio === "cheque_endosado") return alert("Este egreso corresponde a un endoso de cheque y no se puede eliminar desde acá.");
    if (!confirm(`¿Eliminar el egreso "${e.concepto}"?${e.deuda_cuota_id ? " La cuota de deuda volverá a quedar pendiente." : ""}`)) return;
    const { error } = await supabase.from("egresos").delete().eq("id", e.id!);
    if (error) alert(error.message);
    reload();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tesorería & Control de Pagos</span>
            <span className="text-outline text-xs">•</span>
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Ejecución Presupuestaria</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Gestión de Egresos y Pagos Operativos</h1>
          <p className="text-sm text-on-surface-variant">Control centralizado de salidas, liquidación de pasivos y endosos.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() =>
              exportCsv(
                `egresos-${desde}-${hasta}`,
                filas.map((e) => ({
                  Fecha: fecha(e.fecha),
                  Id: codigoEgreso(e.id),
                  Concepto: e.concepto,
                  Proveedor: e.proveedor,
                  Categoria: e.categoria,
                  Moneda: e.moneda,
                  Importe: e.importe,
                  TC: e.tc,
                  "Importe ARS": e.importe_ars,
                  Medio: MEDIO_LABEL[e.medio ?? ""],
                  Cuenta: e.cuenta,
                  Deuda: e.deuda_id ? codigoDeuda(e.deuda_id) : "",
                })),
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4 text-outline" />
            Exportar Excel
          </button>
          <Link
            to="/egresos/categorias"
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-low transition-colors"
          >
            <Settings className="w-4 h-4 text-outline" />
            Administrar Categorías
          </Link>
          <button
            onClick={() => setNuevo(true)}
            className="inline-flex items-center gap-2 px-6 py-2 bg-error text-on-error text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            Nuevo Egreso
          </button>
        </div>
      </div>

      {/* Distribution Summary */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-surface-container-low text-secondary">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-primary">Distribución de Egresos por Categoría</h2>
              <span className="text-[10px] font-bold text-outline uppercase bg-surface-container-low px-1.5 py-0.5 rounded">{PERIODO_LABEL[periodo]}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-outline uppercase block">Total Ejecutado (ARS)</span>
            <span className="text-xl font-bold font-numeric text-primary">{money(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {distribucion.length === 0 && <p className="text-xs text-outline">Sin egresos en el período.</p>}
          {distribucion.map((c) => (
            <CategoryMiniCard key={c.label} label={c.label} amount={money(c.total)} percent={porcentaje(c.total, total)} color={c.color} />
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
              placeholder="Buscar por proveedor o concepto..."
            />
          </div>
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="h-10 px-4 rounded-lg bg-surface-container-low border-0 text-xs font-bold text-on-surface outline-none cursor-pointer"
          >
            <option value="">Todas las Categorías</option>
            {data?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <Segmented
            value={periodo}
            onChange={setPeriodo}
            options={(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => ({ value: p, label: PERIODO_LABEL[p] }))}
          />
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-outline uppercase">Registros: </span>
          <span className="text-sm font-bold font-numeric text-primary">{filas.length} operaciones</span>
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden mb-12">
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-4 py-4">Concepto / Detalle</th>
                  <th className="px-4 py-4">Categoría</th>
                  <th className="px-4 py-4 text-right">Importe</th>
                  <th className="px-4 py-4 text-center">Medio de Pago</th>
                  <th className="px-4 py-4">Deuda</th>
                  <th className="px-4 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-xs">
                {filas.length === 0 && <EmptyRow colSpan={7} label="Sin egresos" />}
                {filas.map((e) => (
                  <tr key={e.id} className={cn("hover:bg-surface-container-low/50 transition-colors group", e.deuda_id && "border-l-4 border-secondary")}>
                    <td className="px-6 py-4 font-numeric font-medium text-on-surface whitespace-nowrap">{fecha(e.fecha)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-primary">{e.concepto}</span>
                        <span className="text-[9px] font-bold text-outline uppercase">
                          {codigoEgreso(e.id)}
                          {e.proveedor && ` • Proveedor: ${e.proveedor}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full bg-surface-container-high text-secondary font-bold text-[9px] uppercase inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.categoria_color ?? undefined }} />
                        {e.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold font-numeric text-sm text-error">{money(e.importe_ars)}</div>
                      {e.moneda === "USD" && (
                        <div className="text-[9px] text-outline font-numeric">
                          {money(e.importe, "USD")} (TC {money(e.tc)})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="px-2 py-1 rounded-full bg-surface-container-high text-on-surface font-bold text-[9px] uppercase">
                        {MEDIO_LABEL[e.medio ?? ""]} {e.medio === "cheque_endosado" ? `#${e.cheque_numero}` : e.cuenta}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {e.deuda_id && (
                        <div className="flex items-center gap-2 text-on-tertiary-container bg-tertiary-container/10 px-2 py-1 rounded border border-on-tertiary-container/10">
                          <CheckCircle className="w-3 h-3" />
                          <span className="text-[10px] font-bold truncate max-w-[140px]" title={e.deuda_concepto ?? ""}>
                            {codigoDeuda(e.deuda_id)} • cuota {e.cuota_numero}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {e.medio !== "cheque_endosado" && (
                        <button onClick={() => eliminar(e)} title="Eliminar" className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevo && (
        <NuevoEgresoModal
          onClose={() => setNuevo(false)}
          onSaved={() => {
            setNuevo(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CategoryMiniCard({ label, amount, percent, color }: { label: string; amount: string; percent: number; color: string }) {
  return (
    <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 space-y-3">
      <div className="flex justify-between items-start gap-2">
        <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider truncate" title={label}>
          {label}
        </span>
        <span className="text-[10px] font-bold font-numeric text-secondary">{percent}%</span>
      </div>
      <div className="text-xs font-bold font-numeric text-primary">{amount}</div>
      <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

function NuevoEgresoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: cat, reload } = useData(async () => {
    const [categorias, proveedores, cuentas, cuotas, tc] = await Promise.all([
      supabase.from("categorias_egreso").select("id, nombre").eq("activa", true).order("nombre"),
      supabase.from("proveedores").select("id, razon_social").eq("activo", true).order("razon_social"),
      supabase.from("v_cuentas_saldo").select("id, nombre, moneda, numero, saldo").eq("activa", true).order("id"),
      supabase
        .from("v_deuda_cuotas")
        .select("id, numero, fecha_vencimiento, saldo, moneda, proveedor_id, deuda_id, deudas(concepto, categoria_egreso_id, proveedores(razon_social))")
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return {
      categorias: check(categorias),
      proveedores: check(proveedores),
      cuentas: check(cuentas),
      cuotas: check(cuotas),
      tc: tc.data?.venta ?? null,
    };
  });

  const [fechaE, setFechaE] = useState(hoyISO());
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [importe, setImporte] = useState(NaN);
  const [tc, setTc] = useState(NaN);
  const [medio, setMedio] = useState<"transferencia" | "debito_automatico" | "efectivo" | "tarjeta">("transferencia");
  const [cuentaId, setCuentaId] = useState("");
  const [vincular, setVincular] = useState(false);
  const [cuotaId, setCuotaId] = useState("");
  const [nuevoProv, setNuevoProv] = useState(false);
  const { saving, error, setError, run } = useSubmit();

  useEffect(() => {
    if (cat?.tc && !Number.isFinite(tc)) setTc(cat.tc);
    if (cat && !cuentaId) setCuentaId(String(cat.cuentas[0]?.id ?? ""));
  }, [cat, tc, cuentaId]);

  const cuenta = cat?.cuentas.find((c) => String(c.id) === cuentaId);
  const cuota = cat?.cuotas.find((q) => String(q.id) === cuotaId);
  const necesitaTc = moneda === "USD" || (cuenta && cuenta.moneda !== moneda);
  const equivalenteArs = moneda === "USD" ? (importe || 0) * (tc || 0) : importe || 0;
  const debito = !cuenta ? 0 : cuenta.moneda === moneda ? importe || 0 : cuenta.moneda === "ARS" ? (importe || 0) * (tc || 0) : (importe || 0) / (tc || 1);

  function elegirCuota(id: string) {
    setCuotaId(id);
    const q = cat?.cuotas.find((x) => String(x.id) === id);
    if (!q) return;
    setMoneda(q.moneda as Moneda);
    setImporte(q.saldo ?? NaN);
    setProveedorId(String(q.proveedor_id ?? ""));
    if (q.deudas?.categoria_egreso_id) setCategoriaId(String(q.deudas.categoria_egreso_id));
    if (!concepto) setConcepto(`${q.deudas?.concepto ?? "Pago deuda"} - Cuota ${q.numero}`);
  }

  const guardar = () =>
    run(async () => {
      if (!categoriaId) return setError("Elegí la categoría");
      if (!concepto.trim()) return setError("El concepto es obligatorio");
      if (!(importe > 0)) return setError("Ingresá el importe");
      if (necesitaTc && !(tc > 0)) return setError("Ingresá el tipo de cambio");
      if (!cuenta) return setError("Elegí la cuenta de origen");
      if (vincular && !cuota) return setError("Elegí la deuda a cancelar");
      if (cuota && importe > (cuota.saldo ?? 0)) return setError(`Supera el saldo de la cuota (${money(cuota.saldo, cuota.moneda as Moneda)})`);
      check(
        await supabase.from("egresos").insert({
          fecha: fechaE,
          categoria_egreso_id: Number(categoriaId),
          proveedor_id: proveedorId ? Number(proveedorId) : null,
          concepto: concepto.trim(),
          moneda,
          importe,
          tc: necesitaTc ? tc : null,
          medio,
          cuenta_id: cuenta.id!,
          deuda_cuota_id: vincular && cuota ? cuota.id! : null,
        }),
      );
      onSaved();
    });

  return (
    <Modal
      title="Registrar Nuevo Egreso Operativo"
      subtitle="Salida de fondos"
      icon={<TrendingDown className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-3xl"
      footer={
        <>
          <div className="mr-auto text-xs">
            <span className="text-outline font-bold uppercase text-[10px]">Total a debitar: </span>
            <span className="font-numeric font-bold text-error">{money(debito, (cuenta?.moneda ?? "ARS") as Moneda)}</span>
          </div>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Confirmar y Registrar Egreso
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Fecha de Egreso *">
          <input type="date" className={inputCls} value={fechaE} onChange={(e) => setFechaE(e.target.value)} />
        </FormGroup>
        <FormGroup label="Categoría de Egreso *">
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {cat?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Concepto / Detalle Operativo *">
          <input className={inputCls} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Pago mensual infraestructura cloud AWS" />
        </FormGroup>
        <FormGroup label="Proveedor">
          <select className={selectCls} value={proveedorId} onChange={(e) => (e.target.value === "nuevo" ? setNuevoProv(true) : setProveedorId(e.target.value))}>
            <option value="">Sin proveedor</option>
            {cat?.proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razon_social}
              </option>
            ))}
            <option value="nuevo">+ Nuevo proveedor…</option>
          </select>
        </FormGroup>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 space-y-4">
        <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest">Selección de Moneda y Tipo de Cambio</h4>
        <div className="flex gap-2 max-w-xs">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={!!cuota}
              onClick={() => setMoneda(m)}
              className={cn(
                "flex-1 h-9 rounded-lg text-xs font-bold border transition-all disabled:opacity-60",
                moneda === m ? "bg-secondary text-on-secondary border-secondary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/10",
              )}
            >
              {m === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormGroup label={`Importe ${moneda} *`}>
            <MoneyInput value={importe} onChange={setImporte} prefix={moneda === "USD" ? "U$S" : "$"} />
          </FormGroup>
          {necesitaTc && (
            <FormGroup label="TC cargado a mano *">
              <MoneyInput value={tc} onChange={setTc} />
            </FormGroup>
          )}
          {moneda === "USD" && (
            <FormGroup label="Equivalente en ARS">
              <div className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/10 flex items-center justify-end text-xs font-bold font-numeric">
                {money(equivalenteArs)}
              </div>
            </FormGroup>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Medio de Pago *">
          <select className={selectCls} value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
            <option value="transferencia">Transferencia</option>
            <option value="debito_automatico">Débito automático</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
        </FormGroup>
        <FormGroup label="Cuenta de Origen *">
          <select className={selectCls} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {cat?.cuentas.map((c) => (
              <option key={c.id} value={c.id!}>
                {c.nombre} {c.numero && `(#${c.numero})`} — {money(c.saldo, c.moneda as Moneda)}
              </option>
            ))}
          </select>
        </FormGroup>
      </div>

      <div className="p-4 rounded-xl border border-outline-variant/10 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={vincular}
            onChange={(e) => {
              setVincular(e.target.checked);
              if (!e.target.checked) setCuotaId("");
            }}
            className="w-4 h-4 rounded text-secondary focus:ring-0"
          />
          <span className="text-xs font-bold text-primary">Vincular a Deuda u Obligación Existente</span>
        </label>
        {vincular && (
          <>
            <FormGroup label="Seleccionar Pasivo Pendiente">
              <select className={selectCls} value={cuotaId} onChange={(e) => elegirCuota(e.target.value)}>
                <option value="">Seleccionar…</option>
                {cat?.cuotas.map((q) => (
                  <option key={q.id} value={q.id!}>
                    {q.deudas?.proveedores?.razon_social} — {q.deudas?.concepto} — cuota {q.numero} vence {fecha(q.fecha_vencimiento)} (
                    {money(q.saldo, q.moneda as Moneda)})
                  </option>
                ))}
              </select>
            </FormGroup>
            <p className="text-[11px] text-on-surface-variant">
              Al confirmar, el pago se imputa a la cuota y la deuda se actualiza automáticamente en el módulo de <strong>Deudas</strong>.
            </p>
          </>
        )}
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
