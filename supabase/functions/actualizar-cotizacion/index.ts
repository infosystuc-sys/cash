// Trae el dólar MEP (bolsa) de dolarapi.com y lo guarda en public.cotizaciones.
// La invoca pg_cron (ver migración de cotizaciones) y también puede llamarla el frontend.
import { createClient } from "npm:@supabase/supabase-js@2";

const FUENTE = "https://dolarapi.com/v1/dolares/bolsa";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const res = await fetch(FUENTE);
    if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
    const data = await res.json();

    const venta = Number(data.venta);
    if (!venta || venta <= 0) throw new Error("Cotización inválida");

    // Fecha en horario de Buenos Aires (YYYY-MM-DD)
    const fecha = new Date(data.fechaActualizacion ?? Date.now()).toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const fila = {
      fecha,
      tipo: "MEP",
      compra: data.compra ?? null,
      venta,
      fuente: "dolarapi.com/bolsa",
      actualizado_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("cotizaciones").upsert(fila, { onConflict: "fecha,tipo" });
    if (error) throw error;

    return new Response(JSON.stringify(fila), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
