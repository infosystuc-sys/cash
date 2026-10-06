import React, { useMemo, useState } from "react";
import { Search, PlusCircle, Building2, Pencil, Power, Trash2 } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { ErrorBanner, FormGroup, Loading, Modal, CancelButton, SubmitButton, EmptyRow, inputCls, selectCls, useSubmit } from "./components/ui";

type Cliente = {
  id: number;
  razon_social: string;
  cuit: string | null;
  tipo_ingreso_id: number | null;
  activo: boolean;
  tipos_ingreso: { nombre: string } | null;
  ingresos: { count: number }[];
  cheques: { count: number }[];
  cobros: { count: number }[];
};

const tieneMovimientos = (c: Cliente) => (c.ingresos[0]?.count ?? 0) + (c.cheques[0]?.count ?? 0) + (c.cobros[0]?.count ?? 0) > 0;

export default function Clientes() {
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Cliente | "nuevo" | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const [clientes, tipos] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razon_social, cuit, tipo_ingreso_id, activo, tipos_ingreso(nombre), ingresos(count), cheques(count), cobros(count)")
        .order("razon_social"),
      supabase.from("tipos_ingreso").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    return { clientes: check(clientes) as unknown as Cliente[], tipos: check(tipos) };
  });

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return (data?.clientes ?? []).filter(
      (c) => !q || c.razon_social.toLowerCase().includes(q) || (c.cuit ?? "").includes(q),
    );
  }, [data, busqueda]);

  async function toggleActivo(c: Cliente) {
    await supabase.from("clientes").update({ activo: !c.activo }).eq("id", c.id);
    reload();
  }

  async function eliminar(c: Cliente) {
    if (!confirm(`¿Eliminar el cliente "${c.razon_social}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("clientes").delete().eq("id", c.id);
    // La FK impide borrar si apareció un movimiento entre la carga de la lista y el borrado
    if (error) alert(error.code === "23503" ? "No se puede eliminar: el cliente tiene movimientos. Podés desactivarlo." : error.message);
    reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Gestión de Clientes</h1>
          <p className="text-sm text-on-surface-variant">Administración de razones sociales, CUITs y categorías comerciales.</p>
        </div>
        <button
          onClick={() => setEditando("nuevo")}
          className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
        >
          <PlusCircle className="w-4 h-4" />
          Registrar Cliente
        </button>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 shadow-sm flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
            placeholder="Buscar por nombre o CUIT..."
          />
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                <th className="px-6 py-4">Razón Social</th>
                <th className="px-4 py-4">CUIT</th>
                <th className="px-4 py-4">Categoría</th>
                <th className="px-4 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-xs">
              {filtrados.length === 0 && <EmptyRow colSpan={5} label="No hay clientes" />}
              {filtrados.map((client) => (
                <tr key={client.id} className="hover:bg-surface-container-low/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-container-low text-primary flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-primary">{client.razon_social}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-numeric font-medium text-on-surface-variant">{client.cuit ?? "—"}</td>
                  <td className="px-4 py-4">
                    {client.tipos_ingreso && (
                      <span className="px-2 py-1 rounded-full bg-surface-container-low text-secondary font-bold text-[9px] uppercase">
                        {client.tipos_ingreso.nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                        client.activo ? "bg-tertiary-container/10 text-on-tertiary-container" : "bg-surface-container-low text-outline",
                      )}
                    >
                      {client.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditando(client)} title="Editar" className="p-1.5 rounded-lg text-outline hover:text-primary transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActivo(client)} title={client.activo ? "Desactivar" : "Activar"} className="p-1.5 rounded-lg text-outline hover:text-primary transition-colors">
                        <Power className="w-4 h-4" />
                      </button>
                      {!tieneMovimientos(client) && (
                        <button onClick={() => eliminar(client)} title="Eliminar (sin movimientos)" className="p-1.5 rounded-lg text-outline hover:text-error transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && data && (
        <ClienteModal
          cliente={editando === "nuevo" ? null : editando}
          tipos={data.tipos}
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

function ClienteModal({
  cliente,
  tipos,
  onClose,
  onSaved,
}: {
  cliente: Cliente | null;
  tipos: { id: number; nombre: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [razon, setRazon] = useState(cliente?.razon_social ?? "");
  const [cuit, setCuit] = useState(cliente?.cuit ?? "");
  const [tipoId, setTipoId] = useState<string>(cliente?.tipo_ingreso_id ? String(cliente.tipo_ingreso_id) : "");
  const [nuevoTipo, setNuevoTipo] = useState("");
  const { saving, error, setError, run } = useSubmit();

  const guardar = () =>
    run(async () => {
      if (!razon.trim()) return setError("La razón social es obligatoria");
      let tipo: number | null = tipoId && tipoId !== "nuevo" ? Number(tipoId) : null;
      if (tipoId === "nuevo") {
        if (!nuevoTipo.trim()) return setError("Indicá el nombre de la nueva categoría");
        tipo = check(await supabase.from("tipos_ingreso").insert({ nombre: nuevoTipo.trim() }).select("id").single()).id;
      }
      const fila = { razon_social: razon.trim(), cuit: cuit.trim() || null, tipo_ingreso_id: tipo };
      if (cliente) check(await supabase.from("clientes").update(fila).eq("id", cliente.id));
      else check(await supabase.from("clientes").insert(fila));
      onSaved();
    });

  return (
    <Modal
      title={cliente ? "Editar Cliente" : "Registrar Cliente"}
      icon={<Building2 className="w-6 h-6" />}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            Guardar Cliente
          </SubmitButton>
        </>
      }
    >
      <FormGroup label="Razón Social *">
        <input className={inputCls} value={razon} onChange={(e) => setRazon(e.target.value)} autoFocus />
      </FormGroup>
      <FormGroup label="CUIT">
        <input className={inputCls} value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-00000000-0" />
      </FormGroup>
      <FormGroup label="Categoría / Tipo de ingreso por defecto">
        <select className={selectCls} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
          <option value="">Sin categoría</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
          <option value="nuevo">+ Nueva categoría…</option>
        </select>
        {tipoId === "nuevo" && (
          <input className={inputCls} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} placeholder="Nombre de la categoría" />
        )}
      </FormGroup>
      <ErrorBanner message={error} />
    </Modal>
  );
}
