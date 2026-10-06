import React, { useMemo, useState } from "react";
import {
  Landmark,
  ArrowLeftRight,
  Download,
  ChevronDown,
  Building2,
  PlusCircle,
  ArrowRight,
  CheckCircle,
  Receipt,
  ShieldCheck,
  DollarSign,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Wallet,
  Trash2,
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, money, porcentaje, signedMoney, sumarDias, sumarMeses, type Moneda } from "./lib/format";
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

type Cuenta = Row<"v_cuentas_saldo">;

const TIPOS_CUENTA: Record<string, string> = {
  cuenta_corriente: "Cuenta Corriente",
  caja_ahorro: "Caja de Ahorro",
  efectivo: "Efectivo",
  billetera_digital: "Billetera Digital",
  custodia: "Custodia / Cofre",
};

export default function Cuentas() {
  const [transferir, setTransferir] = useState(false);
  const [editando, setEditando] = useState<Cuenta | "nueva" | null>(null);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const hoy = hoyISO();
    const [cuentas, cheques, transferencias, cuotas, egresos3m, tc] = await Promise.all([
      supabase.from("v_cuentas_saldo").select("*").eq("activa", true).order("id"),
      supabase.from("v_cheques").select("importe, dias_para_pago").eq("estado", "en_cartera"),
      supabase.from("v_transferencias").select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(10),
      supabase.from("v_deuda_cuotas").select("saldo, moneda").gt("saldo", 0).lte("fecha_vencimiento", sumarDias(hoy, 7)),
      supabase.from("v_egresos").select("importe_ars").gte("fecha", sumarMeses(hoy, -3)),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
    ]);
    return {
      cuentas: check(cuentas),
      cheques: check(cheques),
      transferencias: check(transferencias),
      cuotas: check(cuotas),
      egresos3m: check(egresos3m),
      tc: tc.data?.venta ?? null,
    };
  });

  const resumen = useMemo(() => {
    if (!data) return null;
    const tc = data.tc ?? 0;
    const bancos = data.cuentas.filter((c) => c.moneda === "ARS" && c.tipo !== "efectivo").reduce((s, c) => s + (c.saldo_ars ?? 0), 0);
    const usd = data.cuentas.filter((c) => c.moneda === "USD").reduce((s, c) => s + (c.saldo_ars ?? 0), 0);
    const efectivo = data.cuentas.filter((c) => c.moneda === "ARS" && c.tipo === "efectivo").reduce((s, c) => s + (c.saldo_ars ?? 0), 0);
    const cartera = data.cheques.reduce((s, c) => s + (c.importe ?? 0), 0);
    const total = bancos + usd + efectivo + cartera;
    const egresoMensual = data.egresos3m.reduce((s, e) => s + (e.importe_ars ?? 0), 0) / 3;
    const compromisos = data.cuotas.reduce((s, q) => s + (q.moneda === "USD" ? (q.saldo ?? 0) * tc : q.saldo ?? 0), 0);
    const chequesProximos = data.cheques.filter((c) => (c.dias_para_pago ?? 99) <= 7).length;
    return { bancos, usd, efectivo, cartera, total, egresoMensual, compromisos, chequesProximos };
  }, [data]);

  if (seleccionada && data) {
    const cuenta = data.cuentas.find((c) => c.id === seleccionada);
    if (cuenta) {
      return (
        <AccountDetail
          cuenta={cuenta}
          tc={data.tc}
          onBack={() => setSeleccionada(null)}
          onEdit={() => setEditando(cuenta)}
          modal={
            editando && (
              <CuentaModal
                cuenta={editando === "nueva" ? null : editando}
                onClose={() => setEditando(null)}
                onSaved={() => {
                  setEditando(null);
                  reload();
                }}
              />
            )
          }
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] font-bold uppercase tracking-widest">
            <span className="text-secondary bg-secondary-fixed/50 px-1.5 py-0.5 rounded">Módulo Tesorería</span>
            <span className="text-outline-variant">•</span>
            <span className="text-on-surface-variant">Saldos & Disponibilidad</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Cuentas y Tesorería</h1>
          <p className="text-sm text-on-surface-variant">Monitoreo de saldos disponibles y movimientos por entidad.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              data &&
              exportCsv(
                `saldos-${hoyISO()}`,
                data.cuentas.map((c) => ({ Cuenta: c.nombre, Tipo: TIPOS_CUENTA[c.tipo ?? ""], Moneda: c.moneda, Saldo: c.saldo, "Saldo ARS": c.saldo_ars })),
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container-low text-on-surface text-xs font-bold rounded-lg border border-outline-variant/30 shadow-sm hover:bg-surface-container-high transition-colors"
          >
            <Download className="w-4 h-4 text-outline" />
            Exportar Saldos
          </button>
          <button
            onClick={() => setTransferir(true)}
            className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Transferencia entre cuentas
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !data && <Loading />}

      {data && resumen && (
        <>
          {/* Hero Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-20 -top-20 w-80 h-80 bg-secondary-fixed/30 blur-3xl pointer-events-none transition-all group-hover:scale-110" />
              <div className="relative z-10 space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Receipt className="w-5 h-5 text-secondary" />
                      <span className="text-[10px] font-bold text-outline uppercase tracking-widest font-display">Saldo Total Consolidado en Pesos (ARS)</span>
                    </div>
                    <div className="flex items-baseline gap-4 flex-wrap">
                      <span className="text-[34px] leading-tight font-bold text-primary tracking-tight font-numeric">{money(resumen.total)}</span>
                      <span className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-bold uppercase flex items-center gap-1.5 border border-outline-variant/10">
                        <CheckCircle className="w-3.5 h-3.5 text-on-tertiary-container" />
                        {data.cuentas.length} cuentas + cartera de cheques
                      </span>
                    </div>
                  </div>
                  <div className="bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant/20 shadow-inner">
                    <span className="text-[9px] font-bold text-outline uppercase block mb-1">TC Aplicado USD</span>
                    <span className="text-sm font-bold font-numeric text-on-surface">{data.tc ? money(data.tc) : "—"}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>Distribución de liquidez: Bancos / Dólares / Cartera & Efectivo</span>
                    <span className="text-primary font-numeric">
                      {porcentaje(resumen.bancos, resumen.total)}% / {porcentaje(resumen.usd, resumen.total)}% /{" "}
                      {porcentaje(resumen.cartera + resumen.efectivo, resumen.total)}%
                    </span>
                  </div>
                  <div className="h-3 bg-surface-container-high rounded-full overflow-hidden flex shadow-inner">
                    <div className="h-full bg-secondary transition-all duration-700" style={{ width: `${porcentaje(resumen.bancos, resumen.total)}%` }} />
                    <div className="h-full bg-secondary-fixed-dim transition-all duration-700" style={{ width: `${porcentaje(resumen.usd, resumen.total)}%` }} />
                    <div
                      className="h-full bg-tertiary-container transition-all duration-700"
                      style={{ width: `${porcentaje(resumen.cartera + resumen.efectivo, resumen.total)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-6 text-[10px] font-bold">
                    <Legend color="bg-secondary" label="Bancos Operativos:" value={money(resumen.bancos)} />
                    <Legend color="bg-secondary-fixed-dim" label="Dólares:" value={money(resumen.usd)} />
                    <Legend color="bg-tertiary-container" label="Cartera & Efectivo:" value={money(resumen.cartera + resumen.efectivo)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm flex flex-col justify-between group hover:border-secondary/20 transition-all">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Salud Operativa Tesorería</span>
                </div>
                <div className="space-y-4">
                  <StatItem
                    label="Cobertura de egresos estimada"
                    value={resumen.egresoMensual ? `${(resumen.total / resumen.egresoMensual).toFixed(1)} meses` : "—"}
                    color="text-on-surface"
                  />
                  <StatItem label="Cheques próximos a vencer" value={`${resumen.chequesProximos} (en 7 días)`} color="text-secondary" />
                  <StatItem label="Compromisos próximos 7 días" value={money(resumen.compromisos)} color="text-error" />
                </div>
              </div>
              <div className="pt-6 mt-6 border-t border-outline-variant/10 flex items-center gap-3 text-xs text-on-surface-variant font-medium">
                <ShieldCheck className="w-5 h-5 text-secondary" />
                Saldos calculados desde movimientos al {fecha(hoyISO())}.
              </div>
            </div>
          </div>

          {/* Account Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary font-display">Cuentas Registradas y Fondos ({data.cuentas.length})</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {data.cuentas.map((c) => (
                <AccountCard key={c.id} cuenta={c} tc={data.tc} onClick={() => setSeleccionada(c.id!)} />
              ))}

              <div className="bg-surface-container-low border border-outline-variant/10 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 hover:border-secondary/40 hover:bg-surface-container transition-all group">
                <div className="w-12 h-12 rounded-full bg-surface-container-lowest flex items-center justify-center text-secondary shadow-sm transition-transform group-hover:scale-110">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-primary">Vincular Nueva Cuenta</h4>
                  <p className="text-xs text-on-surface-variant mt-1 max-w-[200px]">Añadir cuenta corriente, billetera digital o cofre.</p>
                </div>
                <button onClick={() => setEditando("nueva")} className="text-xs font-bold text-secondary flex items-center gap-1 hover:underline">
                  Configurar Entidad <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary font-display">Últimas transferencias internas registradas</h2>
                <p className="text-xs text-on-surface-variant">Trazabilidad de arbitrajes y reposiciones.</p>
              </div>
              <span className="text-[9px] font-bold text-outline uppercase bg-surface-container-low px-3 py-1 rounded border border-outline-variant/10">Sin impacto en P&L</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Cuenta Origen</th>
                    <th className="py-3 px-4">Cuenta Destino</th>
                    <th className="py-3 px-4">Concepto / Motivo</th>
                    <th className="py-3 px-4 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 text-xs">
                  {data.transferencias.length === 0 && <EmptyRow colSpan={5} label="Sin transferencias" />}
                  {data.transferencias.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-container-low/50 transition-colors group">
                      <td className="py-4 px-4 font-numeric text-outline font-medium">{fecha(t.fecha)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 font-bold text-primary">
                          <ArrowUpRight className="w-3.5 h-3.5 text-error" />
                          {t.cuenta_origen}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 font-bold text-primary">
                          <ArrowDownLeft className="w-3.5 h-3.5 text-on-tertiary-container" />
                          {t.cuenta_destino}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-on-surface-variant font-medium">{t.concepto ?? "—"}</td>
                      <td className="py-4 px-4 text-right font-bold font-numeric text-primary">
                        {money(t.importe_origen, t.moneda_origen as Moneda)}
                        {t.moneda_origen !== t.moneda_destino && (
                          <div className="text-[10px] text-on-surface-variant">→ {money(t.importe_destino, t.moneda_destino as Moneda)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {transferir && data && (
        <TransferenciaModal
          cuentas={data.cuentas}
          onClose={() => setTransferir(false)}
          onSaved={() => {
            setTransferir(false);
            reload();
          }}
        />
      )}
      {editando && (
        <CuentaModal
          cuenta={editando === "nueva" ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", color)} />
      <span className="text-outline uppercase">{label}</span>
      <span className="text-primary font-numeric">{value}</span>
    </div>
  );
}

function AccountDetail({
  cuenta,
  tc,
  onBack,
  onEdit,
  modal,
}: {
  cuenta: Cuenta;
  tc: number | null;
  onBack: () => void;
  onEdit: () => void;
  modal: React.ReactNode;
}) {
  const [filtro, setFiltro] = useState<"todos" | "ingresos" | "egresos">("todos");
  const moneda = cuenta.moneda as Moneda;

  const { data, loading, error } = useData(
    async () =>
      check(
        await supabase
          .from("v_movimientos")
          .select("*")
          .eq("cuenta_id", cuenta.id!)
          .gte("fecha", cuenta.fecha_saldo_inicial!)
          .order("fecha")
          .order("created_at"),
      ),
    [cuenta.id, cuenta.saldo],
  );

  // Saldo corrido (ascendente) y luego se muestra del más reciente al más viejo
  const movimientos = useMemo(() => {
    let saldo = cuenta.saldo_inicial ?? 0;
    const conSaldo = (data ?? []).map((m) => {
      saldo += m.importe ?? 0;
      return { ...m, saldo };
    });
    return conSaldo
      .reverse()
      .filter((m) => filtro === "todos" || (filtro === "ingresos" ? (m.importe ?? 0) > 0 : (m.importe ?? 0) < 0));
  }, [data, filtro, cuenta.saldo_inicial]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest">
          <button onClick={onBack} className="hover:text-secondary transition-colors">
            Cuentas
          </button>
          <ChevronDown className="w-3 h-3 -rotate-90 text-outline" />
          <span className="text-primary">{cuenta.nombre}</span>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-8 shadow-sm border border-outline-variant/20">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-secondary-fixed/30 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-secondary-container text-on-secondary flex items-center justify-center shadow-lg">
                {moneda === "USD" ? <DollarSign className="w-8 h-8" /> : <Building2 className="w-8 h-8" />}
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-bold text-primary tracking-tight font-display">{cuenta.nombre}</h1>
                <p className="text-sm text-on-surface-variant font-medium">
                  {TIPOS_CUENTA[cuenta.tipo ?? ""]} • {moneda === "USD" ? "Dólares" : "Pesos Argentinos"}
                  {cuenta.entidad && ` • ${cuenta.entidad}`}
                </p>
                <div className="flex items-center gap-4 text-[10px] font-bold text-outline pt-1">
                  {cuenta.cbu && <span>CBU: {cuenta.cbu}</span>}
                  {cuenta.cbu && cuenta.alias && <span className="text-outline-variant">|</span>}
                  {cuenta.alias && <span>ALIAS: {cuenta.alias}</span>}
                  <button onClick={onEdit} className="flex items-center gap-1 text-secondary hover:underline">
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Saldo Disponible</span>
              <span className="text-[36px] leading-tight font-bold text-primary font-numeric">{money(cuenta.saldo, moneda)}</span>
              {moneda === "USD" && tc && <span className="text-[11px] text-on-surface-variant font-bold">Eq. {money(cuenta.saldo_ars)} (TC {money(tc)})</span>}
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">
                Saldo inicial {money(cuenta.saldo_inicial, moneda)} al {fecha(cuenta.fecha_saldo_inicial)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: "todos", label: `Todos (${data?.length ?? 0})` },
              { value: "ingresos", label: "Ingresos" },
              { value: "egresos", label: "Egresos" },
            ]}
          />
        </div>

        <ErrorBanner message={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Concepto</th>
                  <th className="py-3 px-4 text-right">Ingreso (+)</th>
                  <th className="py-3 px-4 text-right">Egreso (-)</th>
                  <th className="py-3 px-4 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-outline-variant/10">
                {movimientos.length === 0 && <EmptyRow colSpan={5} label="Sin movimientos" />}
                {movimientos.map((m) => (
                  <tr key={`${m.origen}-${m.origen_id}-${m.tipo}`} className="hover:bg-surface-container-low/50 transition-colors group">
                    <td className="py-4 px-4 font-numeric text-outline font-medium">{fecha(m.fecha)}</td>
                    <td className="py-4 px-4 font-bold text-primary">{m.concepto}</td>
                    <td className="py-4 px-4 text-right font-bold font-numeric text-on-tertiary-container">
                      {(m.importe ?? 0) > 0 ? signedMoney(m.importe!, moneda) : "—"}
                    </td>
                    <td className="py-4 px-4 text-right font-bold font-numeric text-error">{(m.importe ?? 0) < 0 ? money(m.importe, moneda) : "—"}</td>
                    <td className="py-4 px-4 text-right font-bold font-numeric text-primary">{money(m.saldo, moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-bold">
      <span className="text-on-surface-variant font-medium">{label}</span>
      <span className={cn("font-numeric", color)}>{value}</span>
    </div>
  );
}

function AccountCard({ cuenta, tc, onClick }: { cuenta: Cuenta; tc: number | null; onClick: () => void }) {
  const isUSD = cuenta.moneda === "USD";
  const Icono = isUSD ? DollarSign : cuenta.tipo === "efectivo" ? Wallet : Landmark;
  return (
    <div
      onClick={onClick}
      className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-secondary/30 transition-all cursor-pointer group flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-1.5 min-w-0">
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider inline-block truncate max-w-full border",
                isUSD
                  ? "bg-tertiary-container/10 text-on-tertiary-container border-on-tertiary-container/10"
                  : "bg-surface-container-high text-secondary border-outline-variant/10",
              )}
            >
              {cuenta.etiqueta || TIPOS_CUENTA[cuenta.tipo ?? ""]}
            </span>
            <h3 className="text-lg font-bold text-primary font-display truncate">{cuenta.nombre}</h3>
            <p className="text-[10px] text-on-surface-variant font-medium">
              {TIPOS_CUENTA[cuenta.tipo ?? ""]}
              {cuenta.numero && ` #${cuenta.numero}`} • {isUSD ? "USD" : "Pesos (ARS)"}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low text-outline group-hover:bg-secondary group-hover:text-on-secondary transition-colors border border-outline-variant/10">
            <Icono className="w-5 h-5" />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Saldo Disponible</span>
          <div className="text-2xl font-bold font-numeric text-primary tracking-tight">{money(cuenta.saldo, cuenta.moneda as Moneda)}</div>
          {isUSD && (
            <div className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1.5 pt-1">
              Eq: <span className="text-primary font-bold font-numeric">{cuenta.saldo_ars != null ? money(cuenta.saldo_ars) : "—"}</span>
              {tc && <div className="px-1 rounded bg-tertiary-container/10 text-on-tertiary-container text-[8px] font-bold">TC {money(tc)}</div>}
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="text-[8px] font-bold text-outline uppercase tracking-widest">Último Movimiento</span>
          <span className="text-[10px] text-on-surface font-bold truncate pr-4">{cuenta.ultimo_mov_concepto ?? "Sin movimientos"}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
      </div>
    </div>
  );
}

function TransferenciaModal({ cuentas, onClose, onSaved }: { cuentas: Cuenta[]; onClose: () => void; onSaved: () => void }) {
  const [origenId, setOrigenId] = useState(String(cuentas[0]?.id ?? ""));
  const [destinoId, setDestinoId] = useState(String(cuentas[1]?.id ?? ""));
  const [fechaT, setFechaT] = useState(hoyISO());
  const [importe, setImporte] = useState(NaN);
  const [importeDestino, setImporteDestino] = useState(NaN);
  const [concepto, setConcepto] = useState("");
  const { saving, error, setError, run } = useSubmit();

  const origen = cuentas.find((c) => String(c.id) === origenId);
  const destino = cuentas.find((c) => String(c.id) === destinoId);
  const distintaMoneda = origen && destino && origen.moneda !== destino.moneda;
  const montoDestino = distintaMoneda ? importeDestino : importe;

  const guardar = () =>
    run(async () => {
      if (!origen || !destino) return setError("Elegí cuenta de origen y destino");
      if (origen.id === destino.id) return setError("Origen y destino deben ser distintos");
      if (!(importe > 0)) return setError("Ingresá un importe válido");
      if (distintaMoneda && !(importeDestino > 0)) return setError("Ingresá el importe acreditado en destino");
      check(
        await supabase.from("transferencias").insert({
          fecha: fechaT,
          cuenta_origen_id: origen.id!,
          cuenta_destino_id: destino.id!,
          importe_origen: importe,
          importe_destino: montoDestino,
          concepto: concepto.trim() || null,
        }),
      );
      onSaved();
    });

  const opcion = (c: Cuenta) => (
    <option key={c.id} value={c.id!}>
      {c.nombre} - {money(c.saldo, c.moneda as Moneda)}
    </option>
  );

  return (
    <Modal
      title="Transferencia entre Cuentas"
      subtitle="Traspaso de fondos sin impacto en resultado."
      icon={<ArrowLeftRight className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-xl"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <CheckCircle className="w-4 h-4" />
            Confirmar Transferencia
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-6">
        <FormGroup label="Cuenta Origen *">
          <select className={selectCls} value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
            {cuentas.map(opcion)}
          </select>
        </FormGroup>
        <FormGroup label="Cuenta Destino *">
          <select className={selectCls} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {cuentas.map(opcion)}
          </select>
        </FormGroup>
        <FormGroup label="Fecha de Transferencia *">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input type="date" value={fechaT} onChange={(e) => setFechaT(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
        </FormGroup>
        <FormGroup label={`Importe a Transferir * (${origen?.moneda ?? ""})`}>
          <MoneyInput value={importe} onChange={setImporte} prefix={origen?.moneda === "USD" ? "U$S" : "$"} />
        </FormGroup>
        {distintaMoneda && (
          <FormGroup label={`Importe acreditado en destino * (${destino?.moneda})`}>
            <MoneyInput value={importeDestino} onChange={setImporteDestino} prefix={destino?.moneda === "USD" ? "U$S" : "$"} />
          </FormGroup>
        )}
        <FormGroup label="Concepto / Motivo" className="col-span-2">
          <input className={inputCls} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Reserva para pago de sueldos" />
        </FormGroup>
      </div>

      {origen && destino && (
        <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 space-y-4">
          <span className="text-[9px] font-bold text-outline uppercase tracking-widest block border-b border-outline-variant/10 pb-2">Impacto Proyectado</span>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/10">
              <span className="text-[8px] font-bold text-error uppercase block mb-1">Origen Después:</span>
              <span className="text-xs font-bold font-numeric text-on-surface">
                {money((origen.saldo ?? 0) - (importe || 0), origen.moneda as Moneda)}
              </span>
            </div>
            <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/10">
              <span className="text-[8px] font-bold text-on-tertiary-container uppercase block mb-1">Destino Después:</span>
              <span className="text-xs font-bold font-numeric text-on-surface">
                {money((destino.saldo ?? 0) + (montoDestino || 0), destino.moneda as Moneda)}
              </span>
            </div>
          </div>
        </div>
      )}
      <ErrorBanner message={error} />
    </Modal>
  );
}

function CuentaModal({ cuenta, onClose, onSaved }: { cuenta: Cuenta | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nombre: cuenta?.nombre ?? "",
    entidad: cuenta?.entidad ?? "",
    etiqueta: cuenta?.etiqueta ?? "",
    tipo: (cuenta?.tipo ?? "cuenta_corriente") as NonNullable<Cuenta["tipo"]>,
    moneda: (cuenta?.moneda ?? "ARS") as Moneda,
    numero: cuenta?.numero ?? "",
    cbu: cuenta?.cbu ?? "",
    alias: cuenta?.alias ?? "",
    saldo_inicial: cuenta?.saldo_inicial ?? 0,
    fecha_saldo_inicial: cuenta?.fecha_saldo_inicial ?? hoyISO(),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { saving, error, setError, run } = useSubmit();

  const guardar = () =>
    run(async () => {
      if (!f.nombre.trim()) return setError("El nombre es obligatorio");
      if (!Number.isFinite(f.saldo_inicial)) return setError("Saldo inicial inválido");
      const fila = {
        ...f,
        nombre: f.nombre.trim(),
        entidad: f.entidad || null,
        etiqueta: f.etiqueta || null,
        numero: f.numero || null,
        cbu: f.cbu || null,
        alias: f.alias || null,
      };
      if (cuenta) check(await supabase.from("cuentas").update(fila).eq("id", cuenta.id!));
      else check(await supabase.from("cuentas").insert(fila));
      onSaved();
    });

  async function desactivar() {
    if (!cuenta || !confirm(`¿Desactivar la cuenta ${cuenta.nombre}? Dejará de mostrarse pero conserva su historial.`)) return;
    await run(async () => {
      check(await supabase.from("cuentas").update({ activa: false }).eq("id", cuenta.id!));
      onSaved();
    });
  }

  // Movimientos que impiden borrar: cobros (incluso anulados), egresos, transferencias y cheques depositados
  const { data: movimientos } = useData(async () => {
    if (!cuenta) return 0;
    const id = cuenta.id!;
    const contar = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };
    const n = await Promise.all([
      contar(supabase.from("cobros").select("id", { count: "exact", head: true }).eq("cuenta_id", id)),
      contar(supabase.from("egresos").select("id", { count: "exact", head: true }).eq("cuenta_id", id)),
      contar(supabase.from("transferencias").select("id", { count: "exact", head: true }).or(`cuenta_origen_id.eq.${id},cuenta_destino_id.eq.${id}`)),
      contar(supabase.from("cheques").select("id", { count: "exact", head: true }).eq("cuenta_deposito_id", id)),
    ]);
    return n.reduce((a, b) => a + b, 0);
  }, [cuenta?.id]);

  async function eliminar() {
    if (!cuenta) return;
    const aviso =
      (cuenta.saldo_inicial ?? 0) !== 0
        ? `¿Eliminar la cuenta ${cuenta.nombre}? Tiene un saldo inicial de ${money(cuenta.saldo_inicial, cuenta.moneda as Moneda)} que dejará de computarse.`
        : `¿Eliminar la cuenta ${cuenta.nombre}?`;
    if (!confirm(aviso + " Esta acción no se puede deshacer.")) return;
    await run(async () => {
      const { error } = await supabase.from("cuentas").delete().eq("id", cuenta.id!);
      // La FK impide borrar si apareció un movimiento entre la verificación y el borrado
      if (error) throw new Error(error.code === "23503" ? "No se puede eliminar: la cuenta tiene movimientos. Podés desactivarla." : error.message);
      onSaved();
    });
  }

  return (
    <Modal
      title={cuenta ? "Editar Cuenta" : "Nueva Cuenta"}
      subtitle="Cuenta bancaria, billetera, caja o cofre"
      icon={<Landmark className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          {cuenta && (
            <div className="mr-auto flex items-center gap-4">
              <button onClick={desactivar} className="text-xs font-bold text-error hover:underline">
                Desactivar cuenta
              </button>
              <button
                onClick={eliminar}
                disabled={movimientos !== 0}
                title={
                  movimientos === null
                    ? "Verificando movimientos…"
                    : movimientos > 0
                      ? `No se puede eliminar: tiene ${movimientos} movimiento(s). Podés desactivarla.`
                      : "Eliminar cuenta (sin movimientos)"
                }
                className="flex items-center gap-1 text-xs font-bold text-error hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar cuenta
              </button>
            </div>
          )}
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            Guardar Cuenta
          </SubmitButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormGroup label="Nombre *">
          <input className={inputCls} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Galicia TOM" />
        </FormGroup>
        <FormGroup label="Entidad">
          <input className={inputCls} value={f.entidad} onChange={(e) => set("entidad", e.target.value)} placeholder="Banco Galicia" />
        </FormGroup>
        <FormGroup label="Tipo *">
          <select className={selectCls} value={f.tipo} onChange={(e) => set("tipo", e.target.value as typeof f.tipo)}>
            {Object.entries(TIPOS_CUENTA).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Moneda *">
          <select className={selectCls} value={f.moneda} onChange={(e) => set("moneda", e.target.value as Moneda)} disabled={!!cuenta}>
            <option value="ARS">Pesos (ARS)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </FormGroup>
        <FormGroup label="Etiqueta">
          <input className={inputCls} value={f.etiqueta} onChange={(e) => set("etiqueta", e.target.value)} placeholder="Banco Galicia Operativa" />
        </FormGroup>
        <FormGroup label="Número de cuenta">
          <input className={inputCls} value={f.numero} onChange={(e) => set("numero", e.target.value)} />
        </FormGroup>
        <FormGroup label="CBU / CVU">
          <input className={inputCls} value={f.cbu} onChange={(e) => set("cbu", e.target.value)} />
        </FormGroup>
        <FormGroup label="Alias">
          <input className={inputCls} value={f.alias} onChange={(e) => set("alias", e.target.value)} />
        </FormGroup>
        <FormGroup label="Saldo inicial">
          <MoneyInput value={f.saldo_inicial} onChange={(n) => set("saldo_inicial", n)} prefix={f.moneda === "USD" ? "U$S" : "$"} />
        </FormGroup>
        <FormGroup label="Fecha del saldo inicial">
          <input type="date" className={inputCls} value={f.fecha_saldo_inicial} onChange={(e) => set("fecha_saldo_inicial", e.target.value)} />
        </FormGroup>
      </div>
      <p className="text-[10px] text-on-surface-variant">
        El saldo se calcula como saldo inicial + movimientos (cobros, egresos, transferencias y depósitos de cheques) desde esa fecha.
      </p>
      <ErrorBanner message={error} />
    </Modal>
  );
}
