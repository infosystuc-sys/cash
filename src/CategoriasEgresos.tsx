import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PlusCircle,
  Search,
  ChevronDown,
  Trash2,
  Filter,
  TrendingUp,
  ShieldCheck,
  Info,
  Calculator,
  Cloud,
  BadgeCheck,
  Key,
  Building,
  Laptop,
  Briefcase,
  Wallet,
  Receipt,
  Truck,
  Megaphone,
  Pencil,
  EyeOff,
  Eye,
  Save,
  Tag,
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { exportCsv } from "./lib/csv";
import { fecha, hoyISO, money, porcentaje } from "./lib/format";
import { CancelButton, EmptyRow, ErrorBanner, FormGroup, Loading, Modal, SubmitButton, inputCls, useSubmit } from "./components/ui";

type Categoria = Row<"v_categorias_egreso">;

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  cloud: Cloud,
  badge: BadgeCheck,
  key: Key,
  building: Building,
  laptop: Laptop,
  briefcase: Briefcase,
  wallet: Wallet,
  receipt: Receipt,
  truck: Truck,
  megaphone: Megaphone,
};

const COLORES = ["#0051D5", "#24A375", "#1E293B", "#316BF3", "#B4C5FF", "#45474C", "#BA1A1A", "#75777D"];

export default function CategoriasEgresos() {
  const navigate = useNavigate();
  const [editando, setEditando] = useState<Categoria | "nueva" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [verInactivas, setVerInactivas] = useState(false);

  const { data, loading, error, reload } = useData(async () => check(await supabase.from("v_categorias_egreso").select("*").order("total_anio", { ascending: false })));

  const categorias = data ?? [];
  const activas = categorias.filter((c) => c.activa);
  const totalAnio = categorias.reduce((s, c) => s + (c.total_anio ?? 0), 0);
  const opsAnio = categorias.reduce((s, c) => s + (c.ops_anio ?? 0), 0);
  const mayor = categorias[0];
  const ultimo = categorias.reduce<string | null>((m, c) => (c.ultimo_egreso && (!m || c.ultimo_egreso > m) ? c.ultimo_egreso : m), null);

  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return categorias.filter(
      (c) => (verInactivas || c.activa) && (!q || `${c.nombre} ${c.subtitulo ?? ""} ${c.descripcion ?? ""}`.toLowerCase().includes(q)),
    );
  }, [categorias, busqueda, verInactivas]);

  async function toggleActiva(c: Categoria) {
    await supabase.from("categorias_egreso").update({ activa: !c.activa }).eq("id", c.id!);
    reload();
  }

  async function eliminar(c: Categoria) {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    const { error } = await supabase.from("categorias_egreso").delete().eq("id", c.id!);
    if (error) alert("No se puede eliminar: la categoría tiene egresos o deudas asociadas. Podés desactivarla.");
    reload();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest">
          <button onClick={() => navigate("/egresos")} className="hover:text-secondary transition-colors">
            Egresos
          </button>
          <ChevronDown className="w-3 h-3 -rotate-90 text-outline" />
          <span className="text-secondary">Categorías de Egresos</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Categorías de Egresos</h1>
            <p className="text-sm text-on-surface-variant mt-1">Clasificación personalizada para el análisis de costos operativos y proyección de egresos.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-surface-container-low px-4 py-2 rounded-lg flex items-center gap-2 text-on-surface-variant">
              <Filter className="w-4 h-4 text-outline" />
              <span className="text-[10px] font-bold uppercase">{activas.length} Categorías Activas</span>
            </div>
            <button
              onClick={() => setEditando("nueva")}
              className="flex items-center gap-2 bg-secondary text-on-secondary px-6 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-secondary-container transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              Nueva Categoría
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Gasto Anual Acumulado" value={money(totalAnio)} footer="Año en curso, en ARS" icon={<TrendingUp />} />
        <StatCard
          title={`Mayor Desembolso${mayor ? ` (${mayor.nombre})` : ""}`}
          value={money(mayor?.total_anio)}
          footer={`${porcentaje(mayor?.total_anio ?? 0, totalAnio)}% del volumen total`}
          icon={<Tag />}
        />
        <StatCard title="Partidas Operativas" value={`${opsAnio} Op.`} footer={ultimo ? `Último egreso ${fecha(ultimo)}` : "Sin egresos"} icon={<PlusCircle />} isSecondary />
      </div>

      <ErrorBanner message={error} />

      {/* Table Container */}
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-surface-container-low/50 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-outline-variant/10">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-xs font-medium focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
              placeholder="Buscar categoría o servicio..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVerInactivas(!verInactivas)}
              className="px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-[10px] font-bold text-on-surface-variant uppercase hover:bg-surface-container-low transition-colors"
            >
              {verInactivas ? `Todas (${categorias.length})` : `Activas (${activas.length})`}
            </button>
            <button
              onClick={() =>
                exportCsv(
                  `categorias-egreso-${hoyISO()}`,
                  filas.map((c) => ({ Nombre: c.nombre, Subtitulo: c.subtitulo, Descripcion: c.descripcion, Color: c.color, "Ops año": c.ops_anio, "Total año": c.total_anio })),
                )
              }
              className="px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-[10px] font-bold text-on-surface-variant uppercase hover:bg-surface-container-low transition-colors"
            >
              Exportar
            </button>
          </div>
        </div>

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-6 py-4">Identificador</th>
                  <th className="px-4 py-4">Nombre de Categoría</th>
                  <th className="px-4 py-4">Descripción / Alcance</th>
                  <th className="px-4 py-4 text-center">Egresos</th>
                  <th className="px-4 py-4 text-right">Total Acumulado {hoyISO().slice(0, 4)}</th>
                  <th className="px-4 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-xs">
                {filas.length === 0 && <EmptyRow colSpan={7} label="Sin categorías" />}
                {filas.map((c) => {
                  const Icono = ICONOS[c.icono ?? ""] ?? Tag;
                  return (
                    <tr key={c.id} className={cn("hover:bg-surface-container-low/50 transition-colors group", !c.activa && "opacity-60")}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ background: c.color ?? undefined }} />
                          <span className="font-numeric text-outline font-medium">{c.color}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-surface-container-low text-secondary border border-outline-variant/10 group-hover:bg-surface-container-high transition-colors">
                            <Icono className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-primary font-display">{c.nombre}</span>
                            {c.subtitulo && <span className="text-[9px] font-bold text-outline uppercase tracking-tight">{c.subtitulo}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[11px] text-on-surface-variant line-clamp-1 max-w-xs">{c.descripcion}</p>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="px-2 py-1 rounded-full bg-surface-container-high text-primary font-bold font-numeric text-[10px]">{c.ops_anio} ops</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="font-bold font-numeric text-sm text-primary">{money(c.total_anio)}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                            c.activa ? "bg-tertiary-container/10 text-on-tertiary-container" : "bg-surface-container-high text-outline",
                          )}
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full", c.activa ? "bg-on-tertiary-container" : "bg-outline")} />
                          {c.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditando(c)} title="Editar" className="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-secondary/5 transition-all">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActiva(c)}
                            title={c.activa ? "Desactivar" : "Activar"}
                            className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container-high transition-all"
                          >
                            {c.activa ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          {(c.ops_anio ?? 0) === 0 && !c.ultimo_egreso && (
                            <button onClick={() => eliminar(c)} title="Eliminar" className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rules Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-surface-container-lowest border border-outline-variant/20 p-8 rounded-xl shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-primary flex items-center justify-between">
            Distribución Presupuestaria de Egresos
            <span className="text-[9px] font-bold text-outline uppercase bg-surface-container-low px-2 py-1 rounded">Año en curso</span>
          </h2>
          <div className="space-y-4">
            {categorias
              .filter((c) => (c.total_anio ?? 0) > 0)
              .slice(0, 5)
              .map((c) => (
                <ProgressItem key={c.id} label={c.nombre ?? ""} value={porcentaje(c.total_anio ?? 0, totalAnio)} color={c.color ?? "#0051D5"} />
              ))}
          </div>
          <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center text-[10px] font-bold text-outline uppercase">
            <span>Total Egresos Relevados</span>
            <span className="text-sm font-numeric text-primary">{money(totalAnio)} ARS</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/20 p-8 rounded-xl shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-surface-container-low text-secondary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-primary">Reglas de Clasificación e Imputación</h2>
          </div>
          <div className="space-y-4">
            <RuleItem icon={<Info />} title="Categorías No Borrables" desc="Las categorías con movimientos históricos no pueden ser eliminadas; se pueden desactivar." />
            <RuleItem icon={<Calculator />} title="Conversión Multi-moneda" desc="Los gastos en dólares se unifican a pesos con el tipo de cambio registrado en cada operación." />
          </div>
          <button
            onClick={() => setEditando("nueva")}
            className="w-full py-2.5 rounded-lg bg-surface-container-low text-primary text-xs font-bold hover:bg-surface-container-high transition-colors"
          >
            + Agregar otra categoría
          </button>
        </div>
      </div>

      {editando && (
        <CategoriaModal
          categoria={editando === "nueva" ? null : editando}
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

function CategoriaModal({ categoria, onClose, onSaved }: { categoria: Categoria | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? "");
  const [subtitulo, setSubtitulo] = useState(categoria?.subtitulo ?? "");
  const [descripcion, setDescripcion] = useState(categoria?.descripcion ?? "");
  const [color, setColor] = useState(categoria?.color ?? COLORES[0]);
  const [icono, setIcono] = useState(categoria?.icono ?? "cloud");
  const { saving, error, setError, run } = useSubmit();

  const guardar = () =>
    run(async () => {
      if (!nombre.trim()) return setError("El nombre es obligatorio");
      const fila = { nombre: nombre.trim(), subtitulo: subtitulo.trim() || null, descripcion: descripcion.trim() || null, color, icono };
      if (categoria) check(await supabase.from("categorias_egreso").update(fila).eq("id", categoria.id!));
      else check(await supabase.from("categorias_egreso").insert(fila));
      onSaved();
    });

  return (
    <Modal
      title={categoria ? "Editar Categoría" : "Nueva Categoría de Egreso"}
      onClose={onClose}
      size="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            <Save className="w-4 h-4" />
            Guardar Categoría
          </SubmitButton>
        </>
      }
    >
      <FormGroup label="Nombre de la Categoría *">
        <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Servicios Profesionales" autoFocus />
      </FormGroup>
      <FormGroup label="Subtítulo">
        <input className={inputCls} value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="Ej: Hosting & Compute" />
      </FormGroup>
      <FormGroup label="Descripción / Alcance">
        <input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </FormGroup>
      <FormGroup label="Color Identificador">
        <div className="flex gap-3 flex-wrap">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn("w-8 h-8 rounded-full shadow-sm border-2 border-white ring-1 hover:scale-110 transition-transform", color === c ? "ring-secondary ring-2" : "ring-outline-variant/20")}
              style={{ background: c }}
            />
          ))}
        </div>
      </FormGroup>
      <FormGroup label="Ícono">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(ICONOS).map(([k, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setIcono(k)}
              className={cn("p-2 rounded-lg border transition-colors", icono === k ? "bg-secondary text-on-secondary border-secondary" : "bg-surface-container-low text-outline border-outline-variant/10")}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </FormGroup>
      <ErrorBanner message={error} />
    </Modal>
  );
}

function StatCard({
  title,
  value,
  footer,
  icon,
  isSecondary,
}: {
  title: string;
  value: string;
  footer: string;
  icon: React.ReactElement<{ className?: string }>;
  isSecondary?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-xl shadow-sm flex items-center justify-between group hover:border-secondary/20 transition-all">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest truncate">{title}</span>
        <span className="text-xl font-bold font-numeric text-primary mt-1 tracking-tight">{value}</span>
        <span className={cn("text-[10px] font-medium mt-1 flex items-center gap-1.5", isSecondary ? "text-outline" : "text-on-tertiary-container")}>
          {React.cloneElement(icon, { className: "w-3 h-3" })}
          {footer}
        </span>
      </div>
      <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-outline group-hover:text-secondary transition-colors shrink-0">
        {React.cloneElement(icon, { className: "w-6 h-6" })}
      </div>
    </div>
  );
}

function ProgressItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs font-bold">
        <span className="text-primary">{label}</span>
        <span className="font-numeric">{value}%</span>
      </div>
      <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function RuleItem({ icon, title, desc }: { icon: React.ReactElement<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
      <div className="p-2 rounded-lg bg-surface-container-lowest text-secondary shadow-sm">{React.cloneElement(icon, { className: "w-4 h-4" })}</div>
      <div className="space-y-1">
        <div className="text-xs font-bold text-primary">{title}</div>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
