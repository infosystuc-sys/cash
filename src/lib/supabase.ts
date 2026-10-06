import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Tables as Row } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en .env.local");
}

export const supabase = createClient<Database>(url, key);

/** Lanza el error de Supabase como Error común para mostrarlo en la UI. */
export function check<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R["data"]>;
}
