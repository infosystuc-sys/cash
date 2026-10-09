import React from "react";
import { ListTree } from "lucide-react";
import { cn } from "../lib/utils";
import { useData } from "../lib/useData";
import { EmptyRow, ErrorBanner, Loading, Modal } from "./ui";

export type ColumnaDetalle<T> = {
  titulo: string;
  valor: (fila: T) => React.ReactNode;
  alinear?: "right" | "center";
};

export type DetalleProps<T> = {
  titulo: string;
  subtitulo?: string;
  /** Filas ya disponibles en pantalla... */
  filas?: T[];
  /** ...o una carga bajo demanda al abrir */
  cargar?: () => Promise<T[]>;
  columnas: ColumnaDetalle<T>[];
  /** Total formateado a mostrar al pie (debe coincidir con el valor de la tarjeta) */
  total?: string | ((filas: T[]) => string);
  /** Edición en línea de una fecha con doble click sobre el renglón (requiere `cargar`, que se vuelve a ejecutar al guardar) */
  editarFecha?: EditarFecha<T>;
};

export type EditarFecha<T> = {
  /** Título de la columna que se vuelve editable */
  columna: string;
  /** Si el renglón admite edición */
  puede: (fila: T) => boolean;
  /** Fecha inicial del selector (YYYY-MM-DD) */
  valor: (fila: T) => string;
  guardar: (fila: T, fecha: string) => Promise<void>;
  /** Texto de ayuda al pie */
  ayuda?: string;
};

/** Ventana con los registros que componen el valor de una tarjeta. */
export function DetalleModal<T>({ titulo, subtitulo, filas, cargar, columnas, total, editarFecha, onClose }: DetalleProps<T> & { onClose: () => void }) {
  const carga = useData(async () => (cargar ? cargar() : filas ?? []), []);
  const lista = cargar ? carga.data : filas ?? [];
  const totalTexto = typeof total === "function" ? (lista ? total(lista) : "") : total;

  const [editando, setEditando] = React.useState<{ fila: number; fecha: string } | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [errorEdicion, setErrorEdicion] = React.useState<string | null>(null);

  async function confirmar(f: T) {
    if (!editarFecha || !editando || guardando) return;
    if (!editando.fecha || editando.fecha === editarFecha.valor(f)) return setEditando(null);
    setGuardando(true);
    setErrorEdicion(null);
    try {
      await editarFecha.guardar(f, editando.fecha);
      setEditando(null);
      await carga.reload();
    } catch (e) {
      setErrorEdicion((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      title={titulo}
      subtitle={subtitulo}
      icon={<ListTree className="w-6 h-6" />}
      onClose={onClose}
      size="max-w-4xl"
      footer={
        <div className="flex items-center justify-between w-full text-xs">
          <span className="text-on-surface-variant font-medium">{lista ? `${lista.length} registro${lista.length === 1 ? "" : "s"}` : ""}</span>
          {totalTexto && (
            <span>
              <span className="text-[10px] font-bold text-outline uppercase mr-2">Total</span>
              <span className="font-numeric font-bold text-primary text-sm">{totalTexto}</span>
            </span>
          )}
        </div>
      }
    >
      <ErrorBanner message={carga.error || errorEdicion} />
      {editarFecha?.ayuda && lista && lista.some(editarFecha.puede) && <p className="text-[11px] text-on-surface-variant -mt-2">{editarFecha.ayuda}</p>}
      {!lista ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                {columnas.map((c) => (
                  <th key={c.titulo} className={cn("px-3 py-3", c.alinear === "right" && "text-right", c.alinear === "center" && "text-center")}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-xs">
              {lista.length === 0 && <EmptyRow colSpan={columnas.length} label="No hay registros" />}
              {lista.map((f, k) => {
                const editable = !!editarFecha?.puede(f);
                return (
                  <tr
                    key={k}
                    onDoubleClick={() => {
                      if (!editable || guardando) return;
                      setErrorEdicion(null);
                      setEditando({ fila: k, fecha: editarFecha!.valor(f) });
                    }}
                    title={editable ? "Doble click para cambiar la fecha de vencimiento" : undefined}
                    className={cn("hover:bg-surface-container-low/50", editable && "cursor-pointer select-none")}
                  >
                    {columnas.map((c) => (
                      <td
                        key={c.titulo}
                        className={cn(
                          "px-3 py-3",
                          c.alinear === "right" && "text-right font-numeric font-bold whitespace-nowrap",
                          c.alinear === "center" && "text-center",
                        )}
                      >
                        {editando?.fila === k && c.titulo === editarFecha?.columna ? (
                          <input
                            type="date"
                            autoFocus
                            disabled={guardando}
                            value={editando.fecha}
                            onChange={(e) => setEditando({ fila: k, fecha: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmar(f);
                              if (e.key === "Escape") {
                                // Que el Esc cancele la edición sin cerrar la ventana
                                e.stopPropagation();
                                setEditando(null);
                              }
                            }}
                            onBlur={() => confirmar(f)}
                            className="h-8 px-2 rounded-lg bg-surface-container-low border-0 text-xs font-medium focus:ring-2 focus:ring-secondary/30 outline-none disabled:opacity-50"
                          />
                        ) : (
                          c.valor(f)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Estado de "qué detalle está abierto" para una pantalla. */
export function useDetalle() {
  const [abierto, setAbierto] = React.useState<React.ReactElement | null>(null);
  function abrir<T>(props: DetalleProps<T>) {
    setAbierto(<DetalleModal {...props} onClose={() => setAbierto(null)} />);
  }
  return { abrir, modal: abierto };
}

/** Clases para que una tarjeta se vea clickeable. */
export const tarjetaClickeable = "cursor-pointer hover:shadow-md active:scale-[0.99]";
