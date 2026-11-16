import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "../lib/utils";
import { useData } from "../lib/useData";
import { fecha, fechaCorta, money, signedMoney, sumarDias, sumarMeses } from "../lib/format";
import { ErrorBanner, Loading, Segmented } from "./ui";
import { useDetalle } from "./Detalle";

/**
 * Línea de tiempo horizontal de flujo de fondos: una columna por día, semana o mes, de izquierda
 * (más viejo) a derecha (más nuevo). Cada columna muestra barras de entradas/salidas, neto, saldo y
 * los movimientos que la componen.
 * - modo "real": movimientos registrados en cuentas; el saldo se reconstruye hacia atrás desde el saldo de hoy.
 * - modo "proyectado": cobros y pagos pendientes; el saldo se acumula hacia adelante desde las disponibilidades.
 *   Lo vencido sin cobrar/pagar va en una columna "Vencido" al principio.
 */

export type Granularidad = "day" | "week" | "month";

export type ItemLinea = {
  clave: string;
  /** Fecha en la que se ubica en la línea de tiempo */
  fecha: string;
  /** Vencimiento original (proyectado): si es anterior a hoy, el ítem está vencido */
  fechaReal?: string;
  ars: number;
  tipo: string;
  concepto: string;
  detalle: string | null;
  categoria?: string | null;
  categoriaColor?: string | null;
  /** Para cambiar el vencimiento (proyectado) */
  origen?: string;
  refId?: number;
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MAX_ITEMS = 4;
const VENCIDO = "vencido";

const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

function semanaISO(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86_400_000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
}

const diaSemana = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

export function inicioBucket(f: string, g: Granularidad) {
  if (g === "day") return f;
  if (g === "month") return f.slice(0, 8) + "01";
  return sumarDias(f, -((diaSemana(f) + 6) % 7));
}

function finBucket(ini: string, g: Granularidad) {
  if (g === "day") return ini;
  if (g === "week") return sumarDias(ini, 6);
  return sumarDias(sumarMeses(ini, 1), -1);
}

const siguiente = (ini: string, g: Granularidad) => (g === "day" ? sumarDias(ini, 1) : g === "week" ? sumarDias(ini, 7) : sumarMeses(ini, 1));

function etiqueta(ini: string, g: Granularidad) {
  if (g === "day") return { titulo: `${DIAS[diaSemana(ini)]} ${fechaCorta(ini)}`, sub: "" };
  if (g === "week") return { titulo: `Semana ${semanaISO(ini)}`, sub: `${fechaCorta(ini)} al ${fechaCorta(finBucket(ini, g))}` };
  return { titulo: `${MESES[Number(ini.slice(5, 7)) - 1]} ${ini.slice(0, 4)}`, sub: "" };
}

/** Rango que cubre la línea de tiempo según la granularidad (30 días, 12 semanas o 12 meses). */
export function rangoLinea(modo: "real" | "proyectado", g: Granularidad, hoy: string): [string, string] {
  if (modo === "real") {
    if (g === "day") return [sumarDias(hoy, -29), hoy];
    if (g === "week") return [sumarDias(inicioBucket(hoy, "week"), -77), hoy];
    return [sumarMeses(inicioBucket(hoy, "month"), -11), hoy];
  }
  if (g === "day") return [hoy, sumarDias(hoy, 29)];
  if (g === "week") return [hoy, sumarDias(inicioBucket(hoy, "week"), 83)];
  return [hoy, sumarDias(sumarMeses(inicioBucket(hoy, "month"), 12), -1)];
}

type Columna = {
  clave: string;
  ini: string;
  fin: string;
  titulo: string;
  sub: string;
  items: ItemLinea[];
  ing: number;
  egr: number;
  neto: number;
  saldo: number;
  esHoy: boolean;
  vencido: boolean;
};

export function LineaDeTiempo({
  modo,
  titulo,
  subtitulo,
  hoy,
  saldoHoy,
  cargar,
  onCambiarFecha,
  puedeCambiarFecha,
}: {
  modo: "real" | "proyectado";
  titulo: string;
  subtitulo: string;
  hoy: string;
  /** Real: saldo de las cuentas hoy (ancla al final). Proyectado: disponibilidades hoy (ancla al inicio). */
  saldoHoy: number;
  cargar: (desde: string, hasta: string) => Promise<ItemLinea[]>;
  onCambiarFecha?: (item: ItemLinea, nueva: string) => Promise<void>;
  puedeCambiarFecha?: (item: ItemLinea) => boolean;
}) {
  const proyectado = modo === "proyectado";
  const [gran, setGran] = useState<Granularidad>(proyectado ? "week" : "day");
  const [ver, setVer] = useState<"todo" | "ingresos" | "egresos">("todo");
  const [desde, hasta] = rangoLinea(modo, gran, hoy);
  const detalle = useDetalle();
  const scroller = useRef<HTMLDivElement>(null);

  const { data: items, loading, error, reload } = useData(() => cargar(desde, hasta), [desde, hasta]);

  const columnas = useMemo<Columna[]>(() => {
    if (!items) return [];
    const cols: Columna[] = [];
    const vencidos = proyectado ? items.filter((i) => (i.fechaReal ?? i.fecha) < hoy) : [];
    const vigentes = proyectado ? items.filter((i) => (i.fechaReal ?? i.fecha) >= hoy) : items;
    const nueva = (clave: string, ini: string, fin: string, t: { titulo: string; sub: string }, lista: ItemLinea[], esVencido = false): Columna => {
      const ing = lista.reduce((s, i) => s + Math.max(i.ars, 0), 0);
      const egr = lista.reduce((s, i) => s + Math.max(-i.ars, 0), 0);
      return { clave, ini, fin, ...t, items: lista, ing, egr, neto: ing - egr, saldo: 0, esHoy: !esVencido && ini <= hoy && hoy <= fin, vencido: esVencido };
    };
    if (vencidos.length) {
      cols.push(nueva(VENCIDO, "", "", { titulo: "Vencido", sub: "Sin cobrar / pagar" }, vencidos, true));
    }
    for (let ini = inicioBucket(desde, gran); ini <= hasta; ini = siguiente(ini, gran)) {
      const fin = finBucket(ini, gran);
      cols.push(nueva(ini, ini, fin, etiqueta(ini, gran), vigentes.filter((i) => i.fecha >= ini && i.fecha <= fin)));
    }
    // Saldo al cierre de cada columna
    if (proyectado) {
      let s = saldoHoy;
      cols.forEach((c) => {
        s += c.neto;
        c.saldo = s;
      });
    } else {
      // Hacia atrás: saldo de hoy menos lo que entró/salió después del cierre de la columna
      let s = saldoHoy - items.filter((i) => i.fecha > hasta).reduce((a, i) => a + i.ars, 0);
      for (let k = cols.length - 1; k >= 0; k--) {
        cols[k].saldo = s;
        s -= cols[k].neto;
      }
    }
    return cols;
  }, [items, desde, hasta, gran, hoy, saldoHoy, proyectado]);

  const escala = Math.max(1, ...columnas.map((c) => Math.max(c.ing, c.egr)));
  const tot = useMemo(() => {
    const ing = columnas.reduce((s, c) => s + c.ing, 0);
    const egr = columnas.reduce((s, c) => s + c.egr, 0);
    const venc = columnas.find((c) => c.vencido);
    const minimo = columnas.reduce<Columna | null>((m, c) => (!m || c.saldo < m.saldo ? c : m), null);
    return {
      ing,
      egr,
      neto: ing - egr,
      cantidad: columnas.reduce((s, c) => s + c.items.length, 0),
      vencCobrar: venc?.ing ?? 0,
      vencPagar: venc?.egr ?? 0,
      saldoFinal: columnas[columnas.length - 1]?.saldo ?? saldoHoy,
      minimo,
    };
  }, [columnas, saldoHoy]);

  // Real: se arranca mostrando lo más reciente (derecha). Proyectado: desde hoy (izquierda).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !columnas.length) return;
    el.scrollLeft = proyectado ? 0 : el.scrollWidth;
  }, [columnas.length, proyectado, gran]);

  const mover = (dir: number) => scroller.current?.scrollBy({ left: dir * 720, behavior: "smooth" });

  function abrirColumna(c: Columna, filtro?: "ingresos" | "egresos") {
    const pasa = (i: ItemLinea) => (filtro === "ingresos" ? i.ars > 0 : filtro === "egresos" ? i.ars < 0 : true);
    const enColumna = (i: ItemLinea) =>
      c.vencido ? (i.fechaReal ?? i.fecha) < hoy : (!proyectado || (i.fechaReal ?? i.fecha) >= hoy) && i.fecha >= c.ini && i.fecha <= c.fin;
    detalle.abrir<ItemLinea>({
      titulo: `${c.titulo}${c.sub ? ` • ${c.sub}` : ""}`,
      subtitulo: proyectado
        ? c.vencido
          ? "Vencimientos pasados que todavía no se cobraron ni pagaron (USD al TC actual)"
          : "Cobros y pagos pendientes con vencimiento en el período (USD al TC actual)"
        : "Movimientos registrados en las cuentas, sin transferencias internas (USD al TC actual)",
      cargar: async () => (await cargar(desde, hasta)).filter((i) => enColumna(i) && pasa(i)).sort((a, b) => a.fecha.localeCompare(b.fecha) || b.ars - a.ars),
      columnas: [
        {
          titulo: "Fecha",
          valor: (i) => (
            <div className="flex flex-col whitespace-nowrap">
              <span>{fecha(i.fechaReal ?? i.fecha)}</span>
              {proyectado && (i.fechaReal ?? i.fecha) < hoy && <span className="text-[9px] font-bold text-error">vencido</span>}
            </div>
          ),
        },
        { titulo: "Tipo", valor: (i) => <span className="text-[10px] font-bold uppercase text-outline whitespace-nowrap">{i.tipo}</span> },
        { titulo: "Concepto", valor: (i) => <strong className="text-primary">{i.concepto}</strong> },
        {
          titulo: "Detalle",
          valor: (i) => (
            <div className="flex flex-col gap-0.5">
              <span>{i.detalle ?? "—"}</span>
              {i.categoria && <Categoria nombre={i.categoria} color={i.categoriaColor} />}
            </div>
          ),
        },
        { titulo: "Importe ARS", valor: (i) => <span className={i.ars < 0 ? "text-error" : "text-on-tertiary-container"}>{signedMoney(i.ars)}</span>, alinear: "right" },
      ],
      total: (filas) => signedMoney(filas.reduce((s, i) => s + i.ars, 0)),
      editarFecha:
        proyectado && onCambiarFecha
          ? {
              columna: "Fecha",
              puede: (i) => puedeCambiarFecha?.(i) ?? false,
              valor: (i) => i.fechaReal ?? i.fecha,
              guardar: async (i, nueva) => {
                await onCambiarFecha(i, nueva);
                reload();
              },
              ayuda: "Doble click en la fecha de un cobro, pago o cheque para cambiar su vencimiento (Enter guarda, Esc cancela).",
            }
          : undefined,
    });
  }

  const resumen = proyectado
    ? [
        { t: "Cobros a realizar", v: money(tot.ing), c: "text-on-tertiary-container", sub: tot.vencCobrar > 0 ? `${money(tot.vencCobrar)} vencido` : "Sin vencidos" },
        { t: "Pagos a realizar", v: money(tot.egr), c: "text-error", sub: tot.vencPagar > 0 ? `${money(tot.vencPagar)} vencido` : "Sin vencidos" },
        { t: "Flujo neto", v: signedMoney(tot.neto), c: tot.neto < 0 ? "text-error" : "text-on-tertiary-container", sub: `${tot.cantidad} vencimientos` },
        { t: "Disponible hoy", v: money(saldoHoy), c: "text-primary", sub: "Punto de partida" },
        { t: `Saldo al ${fechaCorta(hasta)}`, v: money(tot.saldoFinal), c: tot.saldoFinal < 0 ? "text-error" : "text-primary", sub: "Proyectado" },
        {
          t: "Saldo mínimo",
          v: tot.minimo ? money(tot.minimo.saldo) : "—",
          c: tot.minimo && tot.minimo.saldo < 0 ? "text-error" : "text-primary",
          sub: tot.minimo ? (tot.minimo.vencido ? "Con lo vencido" : tot.minimo.titulo) : "",
        },
      ]
    : [
        { t: "Ingresos", v: money(tot.ing), c: "text-on-tertiary-container", sub: `${columnas.reduce((s, c) => s + c.items.filter((i) => i.ars > 0).length, 0)} movimientos` },
        { t: "Egresos", v: money(tot.egr), c: "text-error", sub: `${columnas.reduce((s, c) => s + c.items.filter((i) => i.ars < 0).length, 0)} movimientos` },
        { t: "Resultado de caja", v: signedMoney(tot.neto), c: tot.neto < 0 ? "text-error" : "text-on-tertiary-container", sub: tot.ing > 0 ? `${Math.round((tot.neto / tot.ing) * 100)}% de los ingresos` : "" },
        { t: `Saldo al ${fechaCorta(desde)}`, v: money(columnas[0] ? columnas[0].saldo - columnas[0].neto : saldoHoy), c: "text-primary", sub: "Inicio del rango" },
        { t: "Saldo hoy", v: money(saldoHoy), c: "text-primary", sub: "Cuentas, USD al TC actual" },
      ];

  return (
    <section className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 pb-4 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
              proyectado ? "bg-secondary-fixed/60 text-secondary" : "bg-surface-container-high text-primary",
            )}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-primary">{titulo}</h2>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  proyectado ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                {proyectado ? "Proyectado" : "Real"}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {subtitulo} • {fecha(desde)} al {fecha(hasta)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={ver}
            onChange={setVer}
            options={[
              { value: "todo", label: "Todo" },
              { value: "ingresos", label: proyectado ? "Cobros" : "Ingresos" },
              { value: "egresos", label: proyectado ? "Pagos" : "Egresos" },
            ]}
          />
          <Segmented
            value={gran}
            onChange={setGran}
            options={[
              { value: "day", label: "Diario" },
              { value: "week", label: "Semanal" },
              { value: "month", label: "Mensual" },
            ]}
          />
        </div>
      </div>

      {/* Resumen del rango */}
      <div className={cn("grid grid-cols-2 md:grid-cols-3 gap-px bg-outline-variant/10 border-y border-outline-variant/10", proyectado ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
        {resumen.map((r) => (
          <div key={r.t} className="bg-surface-container-lowest px-5 py-3">
            <div className="text-[9px] font-bold text-outline uppercase tracking-widest">{r.t}</div>
            <div className={cn("text-base font-bold font-numeric tracking-tight", r.c)}>{r.v}</div>
            <div className="text-[10px] text-on-surface-variant truncate">{r.sub}</div>
          </div>
        ))}
      </div>

      <ErrorBanner message={error} />
      {loading && !items ? (
        <div className="p-6">
          <Loading />
        </div>
      ) : (
        <div className="relative group/linea">
          <button
            onClick={() => mover(-1)}
            title="Anterior"
            className="absolute left-2 top-24 z-20 w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-md flex items-center justify-center text-primary opacity-0 group-hover/linea:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => mover(1)}
            title="Siguiente"
            className="absolute right-2 top-24 z-20 w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-md flex items-center justify-center text-primary opacity-0 group-hover/linea:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div ref={scroller} className="overflow-x-auto">
            <div className="flex min-w-max p-4 gap-3">
              {columnas.map((c) => (
                <ColumnaLinea key={c.clave} c={c} escala={escala} ver={ver} proyectado={proyectado} onAbrir={(f) => abrirColumna(c, f)} />
              ))}
            </div>
          </div>
        </div>
      )}
      {detalle.modal}
    </section>
  );
}

function ColumnaLinea({
  c,
  escala,
  ver,
  proyectado,
  onAbrir,
}: {
  c: Columna;
  escala: number;
  ver: "todo" | "ingresos" | "egresos";
  proyectado: boolean;
  onAbrir: (filtro?: "ingresos" | "egresos") => void;
}) {
  const entradas = c.items.filter((i) => i.ars > 0).sort((a, b) => b.ars - a.ars);
  const salidas = c.items.filter((i) => i.ars < 0).sort((a, b) => a.ars - b.ars);
  const vacia = c.items.length === 0;
  const alto = (v: number) => `${Math.max(v > 0 ? 4 : 0, (v / escala) * 100)}%`;

  return (
    <div
      className={cn(
        "w-60 shrink-0 rounded-xl border flex flex-col overflow-hidden",
        c.vencido
          ? "border-error/30 bg-error-container/10"
          : c.esHoy
            ? "border-secondary/50 bg-secondary-fixed/10 ring-1 ring-secondary/20"
            : "border-outline-variant/20 bg-surface-container-low/30",
      )}
    >
      {/* Encabezado */}
      <button onClick={() => onAbrir()} title="Ver todos los movimientos" className="px-4 pt-3 pb-2 text-left hover:bg-surface-container-low/60 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-xs font-bold truncate", c.vencido ? "text-error" : "text-primary")}>
            {c.vencido && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
            {c.titulo}
          </span>
          {c.esHoy && <span className="px-1.5 py-0.5 rounded bg-secondary text-on-secondary text-[8px] font-bold uppercase">Hoy</span>}
        </div>
        <div className="text-[10px] text-outline font-numeric h-4">{c.sub}</div>
      </button>

      {/* Barras: entradas hacia arriba, salidas hacia abajo */}
      <div className="px-4">
        <div className="h-12 flex items-end gap-1.5 justify-center">
          <div className="w-10 h-full flex items-end">
            <div className="w-full rounded-t bg-on-tertiary-container/80" style={{ height: alto(c.ing) }} title={money(c.ing)} />
          </div>
        </div>
        <div className="h-px bg-outline-variant/40" />
        <div className="h-12 flex items-start gap-1.5 justify-center">
          <div className="w-10 h-full flex items-start">
            <div className="w-full rounded-b bg-error/75" style={{ height: alto(c.egr) }} title={money(c.egr)} />
          </div>
        </div>
      </div>

      {/* Totales */}
      <div className="px-4 py-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] border-b border-outline-variant/10">
        <span className="text-on-surface-variant">{proyectado ? "Cobros" : "Entradas"}</span>
        <span className="text-right font-bold font-numeric text-on-tertiary-container">{c.ing ? `+${compacto.format(c.ing)}` : "—"}</span>
        <span className="text-on-surface-variant">{proyectado ? "Pagos" : "Salidas"}</span>
        <span className="text-right font-bold font-numeric text-error">{c.egr ? `-${compacto.format(c.egr)}` : "—"}</span>
        <span className="text-on-surface-variant">Neto</span>
        <span className={cn("text-right font-bold font-numeric", c.neto < 0 ? "text-error" : "text-primary")}>{c.neto ? signedMoney(Math.round(c.neto)).replace(",00", "") : "—"}</span>
        <span className="text-on-surface-variant">Saldo</span>
        <span className={cn("text-right font-bold font-numeric", c.saldo < 0 ? "text-error" : "text-secondary")}>{money(Math.round(c.saldo)).replace(",00", "")}</span>
      </div>

      {/* Movimientos */}
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        {vacia && <div className="text-[10px] text-outline text-center py-3">Sin movimientos</div>}
        {ver !== "egresos" && <Lista items={entradas} entrada onMas={() => onAbrir("ingresos")} />}
        {ver !== "ingresos" && <Lista items={salidas} entrada={false} onMas={() => onAbrir("egresos")} />}
      </div>
    </div>
  );
}

function Lista({ items, entrada, onMas }: { items: ItemLinea[]; entrada: boolean; onMas: () => void }) {
  if (!items.length) return null;
  const Icono = entrada ? ArrowDownLeft : ArrowUpRight;
  return (
    <>
      {items.slice(0, MAX_ITEMS).map((i) => (
        <div
          key={i.clave}
          className={cn(
            "rounded-lg bg-surface-container-lowest border border-outline-variant/15 border-l-[3px] px-2.5 py-1.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]",
            entrada ? "border-l-on-tertiary-container" : "border-l-error",
          )}
          title={`${i.tipo} • ${i.concepto}${i.detalle ? ` • ${i.detalle}` : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-primary truncate">{i.concepto}</span>
            <Icono className={cn("w-3 h-3 shrink-0", entrada ? "text-on-tertiary-container" : "text-error")} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-on-surface-variant truncate">{i.categoria ?? i.detalle ?? i.tipo}</span>
            <span className={cn("text-[11px] font-bold font-numeric whitespace-nowrap", entrada ? "text-on-tertiary-container" : "text-error")}>
              {money(Math.abs(i.ars)).replace(",00", "")}
            </span>
          </div>
        </div>
      ))}
      {items.length > MAX_ITEMS && (
        <button onClick={onMas} className="text-[10px] font-bold text-secondary hover:underline text-left px-1">
          + {items.length - MAX_ITEMS} {entrada ? "entradas" : "salidas"} más
        </button>
      )}
    </>
  );
}

function Categoria({ nombre, color }: { nombre: string; color?: string | null }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-secondary font-bold text-[9px] uppercase inline-flex items-center gap-1.5 w-fit">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color ?? undefined }} />
      {nombre}
    </span>
  );
}
