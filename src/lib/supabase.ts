import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Tables as Row } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Variables faltantes (se embeben en el build: en Vercel hay que redeployar tras cargarlas). */
export const configFaltante = [!url && "VITE_SUPABASE_URL", !key && "VITE_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean) as string[];

// Con config faltante se crea un cliente inerte para que la app pueda mostrar el aviso en vez de una página en blanco.
// Cashflow vive en el esquema `cashflow` (el proyecto Supabase es compartido con el ERP, en `public`, y AGRORIV, en `agro`).
export const supabase = createClient<Database, "cashflow">(url || "https://config-faltante.invalid", key || "config-faltante", {
  db: { schema: "cashflow" },
});

/** Lanza el error de Supabase como Error común para mostrarlo en la UI. */
export function check<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R["data"]>;
}
