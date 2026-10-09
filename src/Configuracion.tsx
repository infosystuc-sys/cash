import React, { useEffect, useMemo, useState } from "react";
import { Settings, Landmark, BarChart3, CheckCircle, Pencil, Trash2, AlertTriangle, PlusCircle, X } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { fecha, hoyISO, money, type Moneda } from "./lib/format";
import { EmptyRow, ErrorBanner, FormGroup, Loading, MoneyInput, Segmented, inputCls, selectCls, useSubmit } from "./components/ui";

type Seccion = "saldos" | "ventas";

export default function Configuracion() {
  const [seccion, setSeccion] = useState<Seccion>("saldos");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Sistema</span>
            <span className="text-outline text-xs">•</span>
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Puesta en marcha</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display flex items-center gap-2">
            <Settings className="w-6 h-6 text-secondary" /> Configuración
          </h1>
          <p className="text-sm text-on-surface-variant">Saldos iniciales de las cuentas y ventas de los meses previos al uso del sistema.</p>
        </div>
        <Segmented
          value={seccion}
          onChange={setSeccion}
          options={[
            { value: "saldos", label: "Saldos iniciales" },
            { value: "ventas", label: "Ventas históricas" },
          ]}
        />
      </div>

      {seccion === "saldos" ? <SaldosIniciales /> : <VentasHistoricas />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saldos iniciales a una fecha de corte común
// ---------------------------------------------------------------------------

function SaldosIniciales() {
  const { data, loading, error, reload } = useData(async () => {
    const [cuentas, movs] = await Promise.all([
      supabase.from("cuentas").select("id, nombre, moneda, tipo, activa, saldo_inicial, fecha_saldo_inicial").order("id"),
      supabase.from("v_movimientos").select("cuenta_id, fecha"),
    ]);
    return { cuentas: check(cuentas), movs: check(movs) };
  });

  const [corte, setCorte] = useState("");
  const [saldos, setSaldos] = useState<Record<number, number>>({});
  const [guardado, setGuardado] = useState(false);
  const { saving, error: errorGuardar, setError, run } = useSubmit();

  // Al cargar: fecha de corte = la común de todas las cuentas (o la más antigua si difieren)
  useEffect(() => {
    if (!data) return;
    const fechas = data.cuentas.map((c) => c.fecha_saldo_inicial).sort();
    setCorte(fechas[0] ?? hoyISO());
    setSaldos(Object.fromEntries(data.cuentas.map((c) => [c.id, c.saldo_inicial])));
  }, [data]);

  const fechasDistintas = new Set(data?.cuentas.map((c) => c.fecha_saldo_inicial)).size > 1;

  // Movimientos que quedan antes del corte y dejan de computarse en el saldo
  const ignorados = useMemo(() => {
    const m = new Map<number, number>();
    (data?.movs ?? []).forEach((x) => {
      if (x.cuenta_id != null && x.fecha && x.fecha < corte) m.set(x.cuenta_id, (m.get(x.cuenta_id) ?? 0) + 1);
    });
    return m;
  }, [data, corte]);
  const totalIgnorados = [...ignorados.values()].reduce((s, n) => s + n, 0);

  const guardar = () =>
    run(async () => {
      setGuardado(false);
      if (!corte) return setError("Indicá la fecha de corte");
      const lista = data!.cuentas.map((c) => ({ cuenta_id: c.id, saldo: saldos[c.id] }));
      if (lista.some((x) => !Number.isFinite(x.saldo))) return setError("Revisá los saldos: hay importes inválidos");
      if (totalIgnorados > 0 && !confirm(`${totalIgnorados} movimiento(s) anteriores al ${fecha(corte)} dejarán de computarse en los saldos. ¿Continuar?`)) return;
      check(await supabase.rpc("configurar_saldos_iniciales", { p_fecha: corte, p_saldos: lista }));
      setGuardado(true);
      reload();
    });

  if (loading && !data) return <Loading />;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Landmark className="w-5 h-5 text-secondary" /> Saldos iniciales
          </h2>
          <p className="text-xs text-on-surface-variant max-w-2xl">
            Elegí la fecha desde la que el sistema lleva las cuentas y cargá el saldo real de cada una a esa fecha. Los saldos se calculan como saldo inicial + movimientos
            desde el corte.
          </p>
        </div>
        <FormGroup label="Fecha de corte *">
          <input type="date" className={cn(inputCls, "w-44")} value={corte} onChange={(e) => setCorte(e.target.value)} />
        </FormGroup>
      </div>

      <ErrorBanner message={error || errorGuardar} />
      {fechasDistintas && (
        <p className="text-[11px] font-bold text-secondary">Hoy las cuentas tienen fechas de saldo inicial distintas: al guardar, todas pasan a la fecha de corte.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3 text-center">Moneda</th>
              <th className="px-4 py-3">Saldo inicial actual</th>
              <th className="px-4 py-3 text-right">Saldo al {corte ? fecha(corte) : "corte"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10 text-xs">
            {data?.cuentas.length === 0 && <EmptyRow colSpan={4} label="No hay cuentas: crealas desde Cuentas" />}
            {data?.cuentas.map((c) => {
              const moneda = c.moneda as Moneda;
              const n = ignorados.get(c.id) ?? 0;
              return (
                <tr key={c.id} className={cn(!c.activa && "opacity-60")}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-primary">{c.nombre}</span>
                      {!c.activa && <span className="text-[10px] text-outline">Inactiva</span>}
                      {n > 0 && (
                        <span className="text-[10px] font-bold text-error flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {n} movimiento(s) anteriores al corte dejan de contar
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-on-surface-variant">{moneda}</td>
                  <td className="px-4 py-3 text-on-surface-variant font-numeric">
                    {money(c.saldo_inicial, moneda)} al {fecha(c.fecha_saldo_inicial)}
                  </td>
                  <td className="px-4 py-3">
                    <MoneyInput
                      value={saldos[c.id] ?? NaN}
                      onChange={(v) => setSaldos((s) => ({ ...s, [c.id]: v }))}
                      prefix={moneda === "USD" ? "U$S" : "$"}
                      className="w-52 ml-auto"
                      inputClassName="h-9"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-4">
        {guardado && (
          <span className="text-xs font-bold text-on-tertiary-container flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Saldos guardados
          </span>
        )}
        <button
          onClick={guardar}
          disabled={saving || !data?.cuentas.length}
          className="px-8 py-2.5 rounded-lg text-xs font-bold bg-secondary text-on-secondary shadow-lg hover:bg-secondary-container transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          Guardar saldos iniciales
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ventas históricas (solo alimentan el reporte de ventas)
// ---------------------------------------------------------------------------

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const nombreMes = (iso: string | null | undefined) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");

type FormVenta = { id?: number; mes: string; tipoId: string; moneda: Moneda; importe: number; notas: string };

function VentasHistoricas() {
  const { data, loading, error, reload } = useData(async () => {
    const [ventas, tipos, sistema] = await Promise.all([
      supabase.from("ventas_historicas").select("*, tipos_ingreso(nombre)").order("mes", { ascending: false }),
      supabase.from("tipos_ingreso").select("id, nombre, activo").order("nombre"),
      supabase.from("v_ventas_mensuales").select("mes").eq("origen", "sistema"),
    ]);
    return { ventas: check(ventas), tipos: check(tipos), mesesSistema: new Set(check(sistema).map((s) => s.mes)) };
  });

  const vacio = (): FormVenta => ({ mes: hoyISO().slice(0, 7), tipoId: "", moneda: "ARS", importe: NaN, notas: "" });
  const [f, setF] = useState<FormVenta>(vacio);
  const { saving, error: errorGuardar, setError, run } = useSubmit();
  const set = <K extends keyof FormVenta>(k: K, v: FormVenta[K]) => setF((x) => ({ ...x, [k]: v }));

  const mesISO = f.mes ? `${f.mes}-01` : "";
  const solapaSistema = !!mesISO && data?.mesesSistema.has(mesISO);

  const guardar = () =>
    run(async () => {
      if (!f.mes) return setError("Elegí el mes");
      if (mesISO > hoyISO()) return setError("El mes no puede ser futuro");
      if (!f.tipoId) return setError("Elegí el tipo de ingreso");
      if (!(f.importe > 0)) return setError("Ingresá el importe");
      const fila = { mes: mesISO, tipo_ingreso_id: Number(f.tipoId), moneda: f.moneda, importe: f.importe, notas: f.notas.trim() || null };
      const { error } = f.id ? await supabase.from("ventas_historicas").update(fila).eq("id", f.id) : await supabase.from("ventas_historicas").insert(fila);
      if (error) throw new Error(error.code === "23505" ? "Ya hay una venta histórica para ese mes, tipo y moneda: editala desde la lista." : error.message);
      setF(vacio());
      reload();
    });

  async function eliminar(id: number, texto: string) {
    if (!confirm(`¿Eliminar la venta histórica de ${texto}?`)) return;
    const { error } = await supabase.from("ventas_historicas").delete().eq("id", id);
    if (error) alert(error.message);
    if (f.id === id) setF(vacio());
    reload();
  }

  const totales = useMemo(() => {
    const t = { ARS: 0, USD: 0 };
    (data?.ventas ?? []).forEach((v) => (t[v.moneda as Moneda] += v.importe));
    return t;
  }, [data]);

  if (loading && !data) return <Loading />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-4 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm p-6 space-y-5 self-start">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            {f.id ? <Pencil className="w-5 h-5 text-secondary" /> : <PlusCircle className="w-5 h-5 text-secondary" />}
            {f.id ? "Editar venta histórica" : "Cargar venta histórica"}
          </h2>
          {f.id && (
            <button onClick={() => setF(vacio())} title="Cancelar edición" className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-low">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-on-surface-variant">
          Total vendido de un mes anterior al uso del sistema, por tipo de ingreso. Solo alimenta el reporte de ventas: no genera cobros, saldos ni movimientos de cash flow.
        </p>
        <FormGroup label="Mes *">
          <input type="month" className={inputCls} value={f.mes} max={hoyISO().slice(0, 7)} onChange={(e) => set("mes", e.target.value)} />
        </FormGroup>
        <FormGroup label="Tipo de ingreso *">
          <select className={selectCls} value={f.tipoId} onChange={(e) => set("tipoId", e.target.value)}>
            <option value="">Seleccionar…</option>
            {data?.tipos
              .filter((t) => t.activo || String(t.id) === f.tipoId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
          </select>
        </FormGroup>
        <FormGroup label="Moneda">
          <Segmented
            value={f.moneda}
            onChange={(m) => set("moneda", m)}
            options={[
              { value: "ARS" as Moneda, label: "ARS ($)" },
              { value: "USD" as Moneda, label: "USD" },
            ]}
          />
        </FormGroup>
        <FormGroup label={`Importe vendido * (${f.moneda})`}>
          <MoneyInput value={f.importe} onChange={(n) => set("importe", n)} prefix={f.moneda === "USD" ? "U$S" : "$"} />
        </FormGroup>
        <FormGroup label="Notas">
          <input className={inputCls} value={f.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Origen del dato, observaciones" />
        </FormGroup>
        {solapaSistema && (
          <p className="text-[11px] font-bold text-secondary flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {nombreMes(mesISO)} ya tiene facturas cargadas en Ingresos: en el reporte se suman las dos. Cargá acá solo lo que no esté facturado en el sistema.
          </p>
        )}
        <ErrorBanner message={errorGuardar} />
        <button
          onClick={guardar}
          disabled={saving}
          className="w-full py-2.5 rounded-lg text-xs font-bold bg-secondary text-on-secondary shadow-lg hover:bg-secondary-container transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {f.id ? "Guardar cambios" : "Agregar"}
        </button>
      </div>

      <div className="xl:col-span-8 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden self-start">
        <div className="p-6 border-b border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-secondary" /> Ventas históricas cargadas
            </h3>
            <p className="text-xs text-on-surface-variant">{data?.ventas.length ?? 0} registros</p>
          </div>
          <div className="flex gap-4 text-xs font-bold font-numeric text-primary">
            <span>{money(totales.ARS)}</span>
            {totales.USD > 0 && <span>{money(totales.USD, "USD")}</span>}
          </div>
        </div>
        <ErrorBanner message={error} />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest">
                <th className="px-6 py-3">Mes</th>
                <th className="px-4 py-3">Tipo de ingreso</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3">Notas</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-xs">
              {data?.ventas.length === 0 && <EmptyRow colSpan={5} label="Todavía no cargaste ventas históricas" />}
              {data?.ventas.map((v) => {
                const texto = `${nombreMes(v.mes)} • ${v.tipos_ingreso?.nombre ?? ""}`;
                return (
                  <tr key={v.id} className={cn("hover:bg-surface-container-low/50", f.id === v.id && "bg-secondary-fixed/20")}>
                    <td className="px-6 py-3 font-bold text-primary whitespace-nowrap">{nombreMes(v.mes)}</td>
                    <td className="px-4 py-3">{v.tipos_ingreso?.nombre}</td>
                    <td className="px-4 py-3 text-right font-numeric font-bold">{money(v.importe, v.moneda as Moneda)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{v.notas ?? "—"}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() =>
                          setF({ id: v.id, mes: v.mes.slice(0, 7), tipoId: String(v.tipo_ingreso_id), moneda: v.moneda as Moneda, importe: v.importe, notas: v.notas ?? "" })
                        }
                        title="Editar"
                        className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-secondary/5 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => eliminar(v.id, texto)} title="Eliminar" className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
