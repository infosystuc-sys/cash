import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Calendar, BadgeCheck, AlertTriangle, Landmark, DollarSign, Receipt, Wallet, TrendingDown } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { fecha, fechaCorta, hoyISO, money, signedMoney, sumarDias, sumarMeses, type Moneda } from "./lib/format";
import { ErrorBanner, Loading, Segmented } from "./components/ui";
import { useDetalle, tarjetaClickeable, type ColumnaDetalle } from "./components/Detalle";
import { ReporteVentas } from "./components/ReporteVentas";
import { ReporteEgresos } from "./components/ReporteEgresos";
import { CashflowHorizontal } from "./components/CashflowHorizontal";
import { LineaDeTiempo, type ItemLinea } from "./components/LineaDeTiempo";

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

  const { data, loading, error, reload } = useData(async () => {
    const inicio3 = sumarMeses(hoy.slice(0, 8) + "01", -3);
    const [cuentas, cheques, cobros, pagos, tc, cuentasTodas, movs] = await Promise.all([
      supabase.from("v_cuentas_saldo").select("id, nombre, tipo, moneda, saldo, saldo_ars").eq("activa", true).order("id"),
      supabase.from("cheques").select("importe").eq("estado", "en_cartera"),
      supabase
        .from("v_ingreso_vencimientos")
        .select("id, fecha_vencimiento, saldo, moneda, estado, medio_previsto, cuentas(nombre), ingresos(descripcion, clientes(razon_social), tipos_ingreso(nombre))")
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
      supabase
        .from("v_deuda_cuotas")
        .select("id, numero, fecha_vencimiento, saldo, moneda, estado, deudas(concepto, proveedores(razon_social), categorias_egreso(nombre))")
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
      supabase.from("v_cuentas_saldo").select("id, moneda, fecha_saldo_inicial"),
      traerTodo((a, b) =>
        supabase
          .from("v_movimientos")
          .select("cuenta_id, fecha, importe")
          .gte("fecha", inicio3)
          .not("tipo", "in", "(transferencia_salida,transferencia_entrada)")
          .range(a, b),
      ),
    ]);
    const cot = tc.data?.venta ?? 0;
    const mapa = new Map(check(cuentasTodas).map((c) => [c.id, c]));
    // Movimientos reales en ARS (USD al TC actual), respetando la fecha de saldo inicial de cada cuenta
    const reales = movs.flatMap((m) => {
      const cu = mapa.get(m.cuenta_id);
      if (!cu || !m.fecha || (cu.fecha_saldo_inicial && m.fecha < cu.fecha_saldo_inicial)) return [];
      return [{ fecha: m.fecha, ars: cu.moneda === "USD" ? (m.importe ?? 0) * cot : m.importe ?? 0 }];
    });
    return {
      cuentas: check(cuentas),
      cartera: check(cheques),
      cobros: check(cobros),
      pagos: check(pagos),
      tc: cot,
      movs: reales,
      // Desde cuándo hay movimientos registrados (la cuenta con saldo inicial más antiguo)
      inicioDatos: check(cuentasTodas).map((c) => c.fecha_saldo_inicial ?? hoy).sort()[0] ?? hoy,
    };
  });

  const flujo = useData(async () => check(await supabase.rpc("fn_cashflow", { p_desde: desde, p_hasta: hasta, p_periodo: periodo })), [desde, hasta, periodo]);

  type FilaFlujo = NonNullable<typeof flujo.data>[number];
  type Mov = { fecha: string; proyectado: boolean; origen: string; concepto: string; detalle: string | null; ars: number; ref_id: number; fecha_real: string };

  // Saldo real de cada cuenta hoy (USD al TC actual): es el punto de partida de la proyección
  async function cuentasDisponibles(): Promise<FilaSaldo[]> {
    const cuentas = check(await supabase.from("v_cuentas_saldo").select("nombre, moneda, saldo, saldo_ars, activa").order("id"));
    return cuentas
      .filter((c) => c.activa || (c.saldo_ars ?? 0) !== 0)
      .map((c) => ({
        tipo: "Cuenta",
        nombre: c.nombre ?? "",
        detalle: c.moneda === "USD" ? `${money(c.saldo, "USD")} × TC ${money(data?.tc ?? 0)}` : "",
        importe: c.saldo_ars ?? 0,
      }));
  }

  const primerProyectado = flujo.data?.find((x) => x.proyectado);

  function verDisponible() {
    if (!primerProyectado) return;
    detalle.abrir<FilaSaldo>({
      titulo: `Disponibilidades al ${fecha(hoy)}`,
      subtitulo: "Saldo real de cada cuenta (incluye los cobros y pagos ya registrados hoy; USD al TC actual)",
      cargar: cuentasDisponibles,
      columnas: colsSaldo,
      total: money(primerProyectado.saldo_inicial),
    });
  }

  function verFlujo(f: FilaFlujo, que: "saldo_inicial" | "ingresos" | "egresos" | "neto" | "saldo_final") {
    const nombre = etiquetaPeriodo(periodo, f.periodo_inicio);
    const rango = f.proyectado && f.periodo_inicio < hoy ? `${fecha(hoy)} al ${fecha(f.periodo_fin)}` : `${fecha(f.periodo_inicio)} al ${fecha(f.periodo_fin)}`;
    // Los pasados encadenan desde el historial; los proyectados, desde las disponibilidades
    const anteriores = (flujo.data ?? []).filter((x) => x.periodo_inicio < f.periodo_inicio && x.proyectado === f.proyectado);

    if (que === "saldo_inicial" && f.proyectado) {
      return detalle.abrir<FilaSaldo>({
        titulo: `Saldo Inicial • ${nombre}`,
        subtitulo: "Disponibilidades al día + flujo pendiente de los períodos proyectados anteriores",
        cargar: async () => {
          const filas = await cuentasDisponibles();
          if (anteriores.length) {
            filas.push({
              tipo: "Flujo",
              nombre: `Flujo neto pendiente de períodos anteriores (${etiquetaPeriodo(periodo, anteriores[0].periodo_inicio)} a ${etiquetaPeriodo(periodo, anteriores[anteriores.length - 1].periodo_inicio)})`,
              detalle: `${anteriores.length} período(s)`,
              importe: anteriores.reduce((s, x) => s + x.neto, 0),
            });
          }
          return filas;
        },
        columnas: colsSaldo,
        total: money(f.saldo_inicial),
      });
    }

    if (que === "saldo_inicial" || que === "saldo_final") {
      const primero = flujo.data?.[0]?.periodo_inicio ?? f.periodo_inicio;
      const composicion = async (): Promise<FilaSaldo[]> => {
        const base = check(await supabase.rpc("fn_cashflow_saldo_base", { p_inicio: primero }));
        const filas: FilaSaldo[] = base.map((b) => ({ tipo: "Base", nombre: b.concepto, detalle: "", importe: b.ars }));
        if (anteriores.length) {
          filas.push({
            tipo: "Flujo",
            nombre: `Flujo neto de períodos anteriores (${etiquetaPeriodo(periodo, anteriores[0].periodo_inicio)} a ${etiquetaPeriodo(periodo, anteriores[anteriores.length - 1].periodo_inicio)})`,
            detalle: `${anteriores.length} período(s)`,
            importe: anteriores.reduce((s, x) => s + x.neto, 0),
          });
        }
        return filas;
      };
      if (que === "saldo_inicial") {
        return detalle.abrir<FilaSaldo>({
          titulo: `Saldo Inicial • ${nombre}`,
          subtitulo: `Cómo se llega al saldo con que arranca el período (${rango})`,
          cargar: composicion,
          columnas: colsSaldo,
          total: money(f.saldo_inicial),
        });
      }
      return detalle.abrir<FilaSaldo>({
        titulo: `Saldo Final • ${nombre}`,
        subtitulo: `Saldo inicial + ingresos − egresos del período (${rango})`,
        filas: [
          { tipo: "Saldo inicial", nombre: "Saldo al comenzar el período", detalle: "", importe: f.saldo_inicial },
          { tipo: "+ Ingresos", nombre: "Ingresos del período", detalle: "", importe: f.ingresos },
          { tipo: "− Egresos", nombre: "Egresos del período", detalle: "", importe: -f.egresos },
        ],
        columnas: colsSaldo,
        total: money(f.saldo_final),
      });
    }

    const titulos = { ingresos: "Ingresos", egresos: "Egresos", neto: "Flujo Neto" } as const;
    detalle.abrir<Mov>({
      titulo: `${titulos[que]} • ${nombre}`,
      subtitulo: f.proyectado
        ? `Pendiente de cobro y pago del ${rango}, incluidos los vencidos (los movimientos reales de hoy ya están en las disponibilidades; USD al TC actual)`
        : `Movimientos reales del ${rango} (USD al TC actual; sin transferencias internas)`,
      cargar: async () => {
        const movs = check(await supabase.rpc("fn_cashflow_detalle", { p_desde: f.periodo_inicio, p_hasta: f.periodo_fin })) as Mov[];
        return movs.filter((m) => (que === "ingresos" ? m.ars > 0 : que === "egresos" ? m.ars < 0 : m.ars !== 0));
      },
      editarFecha: {
        columna: "Fecha",
        puede: (m) => VENCIMIENTO_EDITABLE.has(m.origen),
        valor: (m) => m.fecha_real,
        guardar: async (m, nueva) => {
          check(await supabase.rpc("cambiar_vencimiento", { p_origen: m.origen, p_id: m.ref_id, p_fecha: nueva }));
          flujo.reload();
          reload();
        },
        ayuda: "Doble click en un cobro/pago previsto o cheque en cartera para cambiar su fecha de vencimiento (Enter guarda, Esc cancela). Si la nueva fecha cae fuera del período, el renglón deja de aparecer acá.",
      },
      columnas: [
        {
          titulo: "Fecha",
          valor: (m) => (
            <div className="flex flex-col whitespace-nowrap">
              <span>{fecha(m.fecha)}</span>
              {m.proyectado && m.fecha_real < m.fecha && <span className="text-[9px] font-bold text-error">vencía {fecha(m.fecha_real)}</span>}
            </div>
          ),
        },
        {
          titulo: "Tipo",
          valor: (m) => (
            <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap", m.proyectado ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container-high text-on-surface-variant")}>
              {ORIGEN_FLUJO[m.origen] ?? m.origen}
            </span>
          ),
        },
        { titulo: "Concepto", valor: (m) => <strong className="text-primary">{m.concepto}</strong> },
        { titulo: "Cliente / Proveedor / Cuenta", valor: (m) => m.detalle ?? "—" },
        { titulo: "Importe ARS", valor: (m) => <span className={m.ars < 0 ? "text-error" : "text-on-tertiary-container"}>{signedMoney(m.ars)}</span>, alinear: "right" },
      ],
      // Se calcula desde las filas para que siga cuadrando si se cambia un vencimiento desde el detalle
      total: (movs) => {
        const suma = movs.reduce((s, m) => s + m.ars, 0);
        return que === "egresos" ? money(suma) : signedMoney(suma);
      },
    });
  }

  // ---------- Líneas de tiempo ----------
  // Real: movimientos registrados en las cuentas (sin transferencias internas), USD al TC actual
  async function cargarReal(d: string, h: string): Promise<ItemLinea[]> {
    const [cuentas, tc, movs, egresos] = await Promise.all([
      supabase.from("v_cuentas_saldo").select("id, nombre, moneda, fecha_saldo_inicial"),
      supabase.from("v_cotizacion_actual").select("venta").maybeSingle(),
      traerTodo((a, b) =>
        supabase
          .from("v_movimientos")
          .select("*")
          .gte("fecha", d)
          .lte("fecha", h)
          .not("tipo", "in", "(transferencia_salida,transferencia_entrada)")
          .order("fecha")
          .order("created_at")
          .range(a, b),
      ),
      traerTodo((a, b) => supabase.from("v_egresos").select("id, categoria, categoria_color, proveedor").gte("fecha", d).lte("fecha", h).range(a, b)),
    ]);
    const cot = tc.data?.venta ?? 0;
    const mapaCuentas = new Map(check(cuentas).map((c) => [c.id, c]));
    const mapaEgresos = new Map(egresos.map((e) => [e.id, e]));
    const items: ItemLinea[] = [];
    movs.forEach((m, k) => {
      const cu = mapaCuentas.get(m.cuenta_id);
      if (!cu || !m.fecha || (cu.fecha_saldo_inicial && m.fecha < cu.fecha_saldo_inicial)) return;
      const ars = cu.moneda === "USD" ? Math.round((m.importe ?? 0) * cot * 100) / 100 : m.importe ?? 0;
      const e = m.origen === "egresos" ? mapaEgresos.get(m.origen_id) : undefined;
      items.push({
        clave: `${m.origen}-${m.origen_id}-${m.tipo}-${k}`,
        fecha: m.fecha,
        ars,
        tipo: ORIGEN_FLUJO[m.tipo ?? ""] ?? m.tipo ?? "",
        concepto: m.concepto ?? "",
        detalle: [e?.proveedor, cu.nombre].filter(Boolean).join(" • "),
        categoria: e?.categoria ?? null,
        categoriaColor: e?.categoria_color ?? null,
      });
    });
    return items;
  }

  // Proyectado: vencimientos pendientes de cobro y de pago (incluye lo vencido) y cheques en cartera
  async function cargarProyectado(d: string, h: string): Promise<ItemLinea[]> {
    const movs = check(await supabase.rpc("fn_cashflow_detalle", { p_desde: d, p_hasta: h })) as Mov[];
    return movs
      .filter((m) => m.proyectado)
      .map((m, k) => ({
        clave: `${m.origen}-${m.ref_id}-${k}`,
        fecha: m.fecha,
        fechaReal: m.fecha_real,
        ars: m.ars,
        tipo: ORIGEN_FLUJO[m.origen] ?? m.origen,
        concepto: m.concepto,
        detalle: m.detalle,
        origen: m.origen,
        refId: m.ref_id,
      }));
  }

  // ---------- Indicadores ----------
  const k = useMemo(() => {
    if (!data) return null;
    const ars = (m: string | null, v: number | null) => (m === "USD" ? (v ?? 0) * data.tc : v ?? 0);
    const cuentas = data.cuentas.reduce((s, c) => s + (c.saldo_ars ?? 0), 0);
    const cartera = data.cartera.reduce((s, c) => s + c.importe, 0);
    const consolidado = cuentas + cartera;

    const vencidoCobrar = data.cobros.filter((v) => (v.fecha_vencimiento ?? "") < hoy);
    const vencidoPagar = data.pagos.filter((q) => (q.fecha_vencimiento ?? "") < hoy);
    const cobros30 = data.cobros.filter((v) => (v.fecha_vencimiento ?? "") <= en30);
    const pagos30 = data.pagos.filter((q) => (q.fecha_vencimiento ?? "") <= en30);
    const suma = <T extends { moneda: string | null; saldo: number | null }>(l: T[]) => l.reduce((s, x) => s + ars(x.moneda, x.saldo), 0);
    const cobrar = suma(data.cobros);
    const pagar = suma(data.pagos);
    const cobrar30 = suma(cobros30);
    const pagar30 = suma(pagos30);

    // Movimientos reales: mes en curso, mes anterior (completo y a la misma fecha) y promedio de los 3 meses cerrados
    const inicioMes = hoy.slice(0, 8) + "01";
    const inicioAnt = sumarMeses(inicioMes, -1);
    const finAnt = sumarDias(inicioMes, -1);
    const mismaFechaAnt = [sumarDias(inicioAnt, Number(hoy.slice(8, 10)) - 1), finAnt].sort()[0];
    const inicio3 = sumarMeses(inicioMes, -3);
    const tot = (desde: string, hasta: string, signo: 1 | -1) =>
      data.movs.filter((m) => m.fecha >= desde && m.fecha <= hasta && m.ars * signo > 0).reduce((s, m) => s + Math.abs(m.ars), 0);
    const ingMes = tot(inicioMes, hoy, 1);
    const egrMes = tot(inicioMes, hoy, -1);
    const ingAnt = tot(inicioAnt, finAnt, 1);
    const egrAnt = tot(inicioAnt, finAnt, -1);
    const ingAntParcial = tot(inicioAnt, mismaFechaAnt, 1);
    const egrAntParcial = tot(inicioAnt, mismaFechaAnt, -1);
    // Egreso mensual promedio de los últimos 3 meses cerrados, contando solo el tramo con datos;
    // si todavía no hay medio mes cerrado con datos, se proyecta el ritmo del mes en curso
    const desdeProm = [inicio3, data.inicioDatos].sort()[1];
    const diasProm = Math.round((Date.parse(finAnt) - Date.parse(desdeProm)) / 86_400_000) + 1;
    const egrProm =
      diasProm >= 15 ? (tot(desdeProm, finAnt, -1) / diasProm) * 30.44 : (egrMes / Math.max(Number(hoy.slice(8, 10)), 1)) * 30.44;
    const promLabel = diasProm >= 15 ? (diasProm >= 85 ? "Prom. 3 meses" : `Prom. desde ${fechaCorta(desdeProm)}`) : "Ritmo del mes";

    return {
      cuentas,
      cartera,
      consolidado,
      cobrar,
      pagar,
      cobrar30,
      pagar30,
      cobros30,
      pagos30,
      vencidoCobrar: suma(vencidoCobrar),
      vencidoCobrarN: vencidoCobrar.length,
      vencidoPagar: suma(vencidoPagar),
      vencidoPagarN: vencidoPagar.length,
      proyectado: consolidado + cobrar30 - pagar30,
      ingMes,
      egrMes,
      netoMes: ingMes - egrMes,
      ingAnt,
      egrAnt,
      varIng: ingAntParcial > 0 ? (ingMes - ingAntParcial) / ingAntParcial : null,
      varEgr: egrAntParcial > 0 ? (egrMes - egrAntParcial) / egrAntParcial : null,
      egrProm,
      promLabel,
      cobertura: egrProm > 0 ? cuentas / egrProm : null,
      inicioMes,
    };
  }, [data, hoy, en30]);

  const variacion = (v: number | null) => (v == null ? "Sin mes anterior" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v * 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })}% vs mes ant.`);

  const listaCobros = (titulo: string, filas: NonNullable<typeof data>["cobros"], total: number) =>
    detalle.abrir({
      titulo,
      subtitulo: "Vencimientos de facturas con saldo pendiente (USD al TC actual)",
      filas,
      columnas: [
        { titulo: "Vencimiento", valor: (v) => <span className={(v.fecha_vencimiento ?? "") < hoy ? "text-error font-bold" : ""}>{fecha(v.fecha_vencimiento)}</span> },
        { titulo: "Cliente", valor: (v) => <strong className="text-primary">{v.ingresos?.clientes?.razon_social}</strong> },
        { titulo: "Descripción", valor: (v) => v.ingresos?.descripcion },
        { titulo: "Saldo", valor: (v) => money(v.moneda === "USD" ? (v.saldo ?? 0) * (data?.tc ?? 0) : v.saldo, "ARS"), alinear: "right" },
      ],
      total: money(total),
    });

  const listaPagos = (titulo: string, filas: NonNullable<typeof data>["pagos"], total: number) =>
    detalle.abrir({
      titulo,
      subtitulo: "Cuotas de deudas con saldo pendiente (USD al TC actual)",
      filas,
      columnas: [
        { titulo: "Vencimiento", valor: (q) => <span className={(q.fecha_vencimiento ?? "") < hoy ? "text-error font-bold" : ""}>{fecha(q.fecha_vencimiento)}</span> },
        { titulo: "Acreedor", valor: (q) => <strong className="text-primary">{q.deudas?.proveedores?.razon_social}</strong> },
        { titulo: "Concepto", valor: (q) => `${q.deudas?.concepto ?? ""} • cuota ${q.numero}` },
        { titulo: "Saldo", valor: (q) => money(q.moneda === "USD" ? (q.saldo ?? 0) * (data?.tc ?? 0) : q.saldo, "ARS"), alinear: "right" },
      ],
      total: money(total),
    });

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Módulo de Tesorería</span>
            <span className="text-outline text-xs">•</span>
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">{fecha(hoy)}</span>
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Tablero de Cash Flow</h1>
          <p className="text-sm text-on-surface-variant">Posición, movimientos reales y proyección de tesorería consolidados en pesos ($ ARS)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
          {/* Indicadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              title="Disponibilidades"
              value={money(k.consolidado)}
              tag={`${data.cuentas.length} cuentas`}
              subtitle={`Cuentas ${money(k.cuentas)}`}
              stats={`Cheques ${money(k.cartera)}`}
              onClick={() =>
                detalle.abrir<FilaSaldo>({
                  titulo: "Disponibilidades",
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
              title="Ingresos del mes"
              value={money(k.ingMes)}
              tag="Real"
              tagColor="bg-tertiary-container/20 text-on-tertiary-container"
              subtitle={`Mes ant. ${money(k.ingAnt)}`}
              stats={variacion(k.varIng)}
              statsColor={k.varIng != null && k.varIng < 0 ? "text-error" : "text-on-tertiary-container"}
            />
            <KpiCard
              title="Egresos del mes"
              value={money(k.egrMes)}
              tag="Real"
              tagColor="bg-error-container text-error"
              subtitle={`Mes ant. ${money(k.egrAnt)}`}
              stats={variacion(k.varEgr)}
              statsColor={k.varEgr != null && k.varEgr > 0 ? "text-error" : "text-on-tertiary-container"}
            />
            <KpiCard
              title="Resultado de caja del mes"
              value={signedMoney(k.netoMes)}
              valueColor={k.netoMes < 0 ? "text-error" : "text-on-tertiary-container"}
              tag={k.netoMes >= 0 ? "Superávit" : "Déficit"}
              tagColor={k.netoMes >= 0 ? "bg-tertiary-container/20 text-on-tertiary-container" : "bg-error-container text-error"}
              subtitle="Ingresos − egresos reales"
              stats={k.ingMes > 0 ? `${Math.round((k.netoMes / k.ingMes) * 100)}% de los ingresos` : "—"}
            />
            <KpiCard
              title="A cobrar"
              value={money(k.cobrar)}
              tag={`${data.cobros.length} vencimientos`}
              subtitle={`Próx. 30 días ${money(k.cobrar30)}`}
              stats={k.vencidoCobrarN ? `${money(k.vencidoCobrar)} vencido` : "Sin vencidos"}
              statsColor={k.vencidoCobrarN ? "text-error" : "text-on-tertiary-container"}
              onClick={() => listaCobros("A cobrar • total pendiente", data.cobros, k.cobrar)}
            />
            <KpiCard
              title="A pagar"
              value={money(k.pagar)}
              tag={`${data.pagos.length} cuotas`}
              tagColor="bg-error-container text-error"
              subtitle={`Próx. 30 días ${money(k.pagar30)}`}
              stats={k.vencidoPagarN ? `${money(k.vencidoPagar)} vencido` : "Sin vencidos"}
              statsColor={k.vencidoPagarN ? "text-error" : "text-on-tertiary-container"}
              onClick={() => listaPagos("A pagar • total pendiente", data.pagos, k.pagar)}
            />
            <KpiCard
              title="Cobertura de caja"
              value={k.cobertura == null ? "—" : `${k.cobertura.toLocaleString("es-AR", { maximumFractionDigits: 1 })} meses`}
              valueColor={k.cobertura != null && k.cobertura < 1 ? "text-error" : "text-primary"}
              tag="Runway"
              subtitle="Saldo en cuentas / egreso mensual promedio"
              stats={`${k.promLabel} ${money(k.egrProm)}`}
            />
            <div
              title="Ver detalle"
              onClick={() =>
                detalle.abrir<FilaSaldo>({
                  titulo: "Saldo Proyectado 30 días",
                  subtitulo: "Disponibilidades + cobros previstos − pagos previstos (incluye vencidos)",
                  filas: [
                    { tipo: "Saldo actual", nombre: "Cuentas + cartera de cheques", detalle: "", importe: k.consolidado },
                    { tipo: "+ Cobros", nombre: "A cobrar hasta el " + fecha(en30), detalle: `${k.cobros30.length} vencimientos`, importe: k.cobrar30 },
                    { tipo: "− Pagos", nombre: "A pagar hasta el " + fecha(en30), detalle: `${k.pagos30.length} cuotas`, importe: -k.pagar30 },
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
              <div className="text-xl font-bold font-numeric tracking-tight">{money(k.proyectado)}</div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-on-primary/10 text-[10px]">
                <span className="text-primary-fixed/80">Hoy + cobros − pagos</span>
                <span className="font-bold text-secondary-fixed">{signedMoney(k.cobrar30 - k.pagar30)} neto</span>
              </div>
            </div>
          </div>

          {/* Saldos por cuenta (horizontal) */}
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 overflow-x-auto p-3">
              <span className="px-3 text-[10px] font-bold text-outline uppercase tracking-widest whitespace-nowrap">Saldo por cuenta</span>
              {data.cuentas.map((c) => (
                <CuentaChip
                  key={c.id}
                  nombre={c.nombre ?? ""}
                  detalle={c.moneda === "USD" ? money(c.saldo, "USD") : c.tipo === "efectivo" ? "Efectivo" : "Banco"}
                  saldo={money(c.saldo_ars)}
                  icono={c.moneda === "USD" ? "usd" : c.tipo === "efectivo" ? "cash" : "bank"}
                  negativo={(c.saldo_ars ?? 0) < 0}
                  onClick={() => navigate("/cuentas")}
                />
              ))}
              <CuentaChip nombre="Cheques en cartera" detalle={`${data.cartera.length} cheques`} saldo={money(k.cartera)} icono="cheque" onClick={() => navigate("/cheques")} />
              <div className="ml-auto pl-4 pr-3 flex flex-col items-end whitespace-nowrap border-l border-outline-variant/20">
                <span className="text-[9px] font-bold text-outline uppercase tracking-widest">Total ARS</span>
                <span className="text-sm font-bold text-secondary font-numeric">{money(k.consolidado)}</span>
              </div>
            </div>
          </div>

          {/* Cronología real */}
          <LineaDeTiempo
            modo="real"
            titulo="Cronología de ingresos y egresos"
            subtitulo="Dinero que efectivamente entró y salió de las cuentas"
            hoy={hoy}
            saldoHoy={k.cuentas}
            cargar={cargarReal}
          />

          {/* Proyección */}
          <LineaDeTiempo
            modo="proyectado"
            titulo="Proyección de cobros y pagos"
            subtitulo="Facturas a cobrar, cheques en cartera y cuotas de deuda a pagar"
            hoy={hoy}
            saldoHoy={k.cuentas}
            cargar={cargarProyectado}
            puedeCambiarFecha={(i) => VENCIMIENTO_EDITABLE.has(i.origen ?? "")}
            onCambiarFecha={async (i, nueva) => {
              check(await supabase.rpc("cambiar_vencimiento", { p_origen: i.origen!, p_id: i.refId!, p_fecha: nueva }));
              flujo.reload();
              reload();
            }}
          />
        </>
      )}

      {/* Flujo de fondos por período */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-primary">Flujo de fondos por período ({RANGOS[periodo].label})</h2>
            <p className="text-xs text-on-surface-variant">
              Hasta ayer, movimientos reales. Desde hoy, disponibilidades + lo pendiente de cobro y pago. Consolidado en ARS; USD al TC actual.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <Segmented value={periodo} onChange={setPeriodo} options={(Object.keys(RANGOS) as Periodo[]).map((p) => ({ value: p, label: RANGOS[p].label }))} />
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-lg">
              <Calendar className="w-4 h-4 text-outline" />
              <span className="text-xs font-bold text-on-surface">
                {fecha(desde)} al {fecha(hasta)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6">
          <div className="h-56 relative bg-surface-container-low/30 rounded-xl border border-outline-variant/10 p-4">{flujo.data ? <Grafico filas={flujo.data} /> : <Loading />}</div>
        </div>

        <div className="overflow-x-auto mt-6 border-t border-outline-variant/10">
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
                const actual = f.proyectado && f.periodo_inicio <= hoy;
                return (
                  <React.Fragment key={f.periodo_inicio}>
                    {f === primerProyectado && (
                      <tr onClick={verDisponible} title="Ver saldo por cuenta" className="bg-secondary-fixed/30 hover:bg-secondary-fixed/50 cursor-pointer border-y-2 border-secondary/30">
                        <td className="px-6 py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-secondary flex items-center gap-1.5">
                              <Wallet className="w-4 h-4" /> Disponibilidades al {fecha(hoy)}
                            </span>
                            <span className="text-[10px] text-on-surface-variant">Saldo real de las cuentas • punto de partida de la proyección</span>
                          </div>
                        </td>
                        <td colSpan={4} />
                        <td className="px-4 py-3 text-right font-numeric font-bold text-secondary text-sm hover:underline decoration-dotted underline-offset-4">{money(f.saldo_inicial)}</td>
                        <td className="px-6 py-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-secondary text-on-secondary">Hoy</span>
                        </td>
                      </tr>
                    )}
                    <tr className={cn("hover:bg-surface-container-low/60 transition-colors", neg && "bg-error-container/5")}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={cn("font-bold text-sm", neg ? "text-error" : "text-primary")}>{etiquetaPeriodo(periodo, f.periodo_inicio)}</span>
                          {periodo !== "day" && (
                            <span className="text-[10px] text-outline font-numeric">
                              {actual ? `${fechaCorta(hoy)} (hoy)` : fechaCorta(f.periodo_inicio)} al {fechaCorta(f.periodo_fin)}
                            </span>
                          )}
                          {periodo === "day" && actual && <span className="text-[10px] text-secondary font-bold">Hoy</span>}
                        </div>
                      </td>
                      <CeldaDetalle className="text-on-surface-variant" onClick={() => verFlujo(f, "saldo_inicial")}>
                        {money(f.saldo_inicial)}
                      </CeldaDetalle>
                      <CeldaDetalle className="text-on-tertiary-container font-bold" onClick={() => verFlujo(f, "ingresos")}>
                        {signedMoney(f.ingresos)}
                      </CeldaDetalle>
                      <CeldaDetalle className="text-error font-bold" onClick={() => verFlujo(f, "egresos")}>
                        {money(-f.egresos)}
                      </CeldaDetalle>
                      <CeldaDetalle className={cn("font-bold", neg ? "text-error" : "text-on-tertiary-container")} onClick={() => verFlujo(f, "neto")}>
                        {signedMoney(f.neto)}
                      </CeldaDetalle>
                      <CeldaDetalle className="font-bold text-primary" onClick={() => verFlujo(f, "saldo_final")}>
                        {money(f.saldo_final)}
                      </CeldaDetalle>
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CashflowHorizontal
        periodo={periodo}
        onPeriodo={setPeriodo}
        opciones={(Object.keys(RANGOS) as Periodo[]).map((p) => ({ value: p, label: RANGOS[p].label }))}
        filas={flujo.data}
        etiqueta={(ini) => etiquetaPeriodo(periodo, ini)}
        origenes={ORIGEN_FLUJO}
        hoy={hoy}
      />

      {data && <ReporteVentas tc={data.tc} />}
      <ReporteEgresos />
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

/** Orígenes del detalle de cash flow cuyo vencimiento se puede cambiar (ver RPC cambiar_vencimiento). */
const VENCIMIENTO_EDITABLE = new Set(["cobro_previsto", "pago_previsto", "cheque_cartera"]);

const ORIGEN_FLUJO: Record<string, string> = {
  cobro: "Cobro",
  egreso: "Pago",
  deposito_cheque: "Depósito cheque",
  rechazo_cheque: "Rechazo cheque",
  cambio_cheque: "Cambio cheque",
  cobro_previsto: "Cobro previsto",
  cheque_cartera: "Cheque a cobrar",
  pago_previsto: "Pago previsto",
};

function CeldaDetalle({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <td
      onClick={onClick}
      title="Ver composición"
      className={cn("px-4 py-4 text-right font-numeric whitespace-nowrap cursor-pointer hover:underline decoration-dotted underline-offset-4 hover:bg-surface-container-low", className)}
    >
      {children}
    </td>
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
  valueColor = "text-primary",
  tag,
  tagColor = "bg-secondary-fixed/50 text-secondary",
  subtitle,
  stats,
  statsColor = "text-secondary",
  onClick,
}: {
  title: string;
  value: string;
  valueColor?: string;
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
      <div className="flex items-center justify-between mb-4 gap-2">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</span>
        {tag && <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap", tagColor)}>{tag}</span>}
      </div>
      <div className={cn("text-xl font-bold font-numeric tracking-tight", valueColor)}>{value}</div>
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/10 text-[10px] gap-2">
        <span className="text-on-surface-variant font-medium">{subtitle}</span>
        <span className={cn("font-bold font-numeric whitespace-nowrap", statsColor)}>{stats}</span>
      </div>
    </div>
  );
}

function CuentaChip({
  nombre,
  detalle,
  saldo,
  icono,
  negativo = false,
  onClick,
}: {
  nombre: string;
  detalle: string;
  saldo: string;
  icono: "bank" | "usd" | "cash" | "cheque";
  negativo?: boolean;
  onClick?: () => void;
}) {
  const Icono = { bank: Landmark, usd: DollarSign, cash: Wallet, cheque: Receipt }[icono];
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/10 hover:bg-surface-container-low hover:border-secondary/30 transition-colors text-left"
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center border border-outline-variant/20",
          icono === "usd" ? "bg-tertiary-container/20 text-on-tertiary-container" : "bg-surface-container-lowest text-secondary",
        )}
      >
        <Icono className="w-4 h-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-on-surface-variant whitespace-nowrap">
          {nombre} <span className="text-outline font-medium">• {detalle}</span>
        </span>
        <span className={cn("text-sm font-bold font-numeric whitespace-nowrap", negativo ? "text-error" : "text-primary")}>{saldo}</span>
      </div>
    </button>
  );
}

/** Trae todas las filas de una consulta paginando de a 1000 (límite de PostgREST). */
async function traerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const filas: T[] = [];
  for (let i = 0; ; i += 1000) {
    const res = await consulta(i, i + 999);
    if (res.error) throw new Error(res.error.message);
    filas.push(...(res.data ?? []));
    if ((res.data ?? []).length < 1000) break;
  }
  return filas;
}
