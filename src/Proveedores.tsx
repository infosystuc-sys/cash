import React, { useMemo, useState } from "react";
import { Search, PlusCircle, Truck, Pencil, Power } from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check, type Row } from "./lib/supabase";
import { useData } from "./lib/useData";
import { ErrorBanner, FormGroup, Loading, Modal, CancelButton, SubmitButton, EmptyRow, inputCls, useSubmit } from "./components/ui";

type Proveedor = Row<"proveedores">;

export default function Proveedores() {
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);

  const { data, loading, error, reload } = useData(async () =>
    check(await supabase.from("proveedores").select("*").order("razon_social")),
  );

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return (data ?? []).filter((p) => !q || p.razon_social.toLowerCase().includes(q) || (p.cuit ?? "").includes(q));
  }, [data, busqueda]);

  async function toggleActivo(p: Proveedor) {
    await supabase.from("proveedores").update({ activo: !p.activo }).eq("id", p.id);
    reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Proveedores y Acreedores</h1>
          <p className="text-sm text-on-surface-variant">Catálogo usado en deudas, egresos y endosos de cheques.</p>
        </div>
        <button
          onClick={() => setEditando("nuevo")}
          className="inline-flex items-center gap-2 px-6 py-2 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-md hover:bg-secondary-container transition-all active:scale-[0.98]"
        >
          <PlusCircle className="w-4 h-4" />
          Registrar Proveedor
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
                <th className="px-4 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-xs">
              {filtrados.length === 0 && <EmptyRow colSpan={4} label="No hay proveedores" />}
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-container-low text-primary flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-primary">{p.razon_social}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-numeric font-medium text-on-surface-variant">{p.cuit ?? "—"}</td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                        p.activo ? "bg-tertiary-container/10 text-on-tertiary-container" : "bg-surface-container-low text-outline",
                      )}
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditando(p)} title="Editar" className="p-1.5 rounded-lg text-outline hover:text-primary transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActivo(p)} title={p.activo ? "Desactivar" : "Activar"} className="p-1.5 rounded-lg text-outline hover:text-primary transition-colors">
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <ProveedorModal
          proveedor={editando === "nuevo" ? null : editando}
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

/** Alta/edición de proveedor. Exportado para crear proveedores desde otros formularios. */
export function ProveedorModal({
  proveedor,
  onClose,
  onSaved,
}: {
  proveedor: Proveedor | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [razon, setRazon] = useState(proveedor?.razon_social ?? "");
  const [cuit, setCuit] = useState(proveedor?.cuit ?? "");
  const { saving, error, setError, run } = useSubmit();

  const guardar = () =>
    run(async () => {
      if (!razon.trim()) return setError("La razón social es obligatoria");
      const fila = { razon_social: razon.trim(), cuit: cuit.trim() || null };
      if (proveedor) {
        check(await supabase.from("proveedores").update(fila).eq("id", proveedor.id));
        onSaved(proveedor.id);
      } else {
        onSaved(check(await supabase.from("proveedores").insert(fila).select("id").single()).id);
      }
    });

  return (
    <Modal
      title={proveedor ? "Editar Proveedor" : "Registrar Proveedor"}
      icon={<Truck className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SubmitButton onClick={guardar} saving={saving}>
            Guardar Proveedor
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
      <ErrorBanner message={error} />
    </Modal>
  );
}
