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
};

/** Ventana con los registros que componen el valor de una tarjeta. */
export function DetalleModal<T>({ titulo, subtitulo, filas, cargar, columnas, total, onClose }: DetalleProps<T> & { onClose: () => void }) {
  const carga = useData(async () => (cargar ? cargar() : filas ?? []), []);
  const lista = cargar ? carga.data : filas ?? [];
  const totalTexto = typeof total === "function" ? (lista ? total(lista) : "") : total;

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
      <ErrorBanner message={carga.error} />
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
              {lista.map((f, k) => (
                <tr key={k} className="hover:bg-surface-container-low/50">
                  {columnas.map((c) => (
                    <td
                      key={c.titulo}
                      className={cn(
                        "px-3 py-3",
                        c.alinear === "right" && "text-right font-numeric font-bold whitespace-nowrap",
                        c.alinear === "center" && "text-center",
                      )}
                    >
                      {c.valor(f)}
                    </td>
                  ))}
                </tr>
              ))}
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
