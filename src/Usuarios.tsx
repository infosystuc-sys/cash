import React, { useState } from "react";
import { ShieldCheck, UserPlus, Trash2, Info, Mail } from "lucide-react";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { useSession } from "./Auth";
import { fecha } from "./lib/format";
import { EmptyRow, ErrorBanner, Loading, SubmitButton, useSubmit } from "./components/ui";

export default function Usuarios() {
  const session = useSession();
  const miEmail = session?.user.email?.toLowerCase();
  const [email, setEmail] = useState("");
  const { saving, error, setError, run } = useSubmit();

  const { data, loading, error: errorCarga, reload } = useData(async () =>
    check(await supabase.from("usuarios_autorizados").select("*").order("email")),
  );

  const agregar = () =>
    run(async () => {
      const e = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError("Email inválido");
      if (data?.some((u) => u.email === e)) return setError("Ese email ya está autorizado");
      check(await supabase.from("usuarios_autorizados").insert({ email: e }));
      setEmail("");
      reload();
    });

  async function quitar(e: string) {
    const propio = e === miEmail;
    if (!confirm(propio ? "¿Quitarte a vos mismo? Vas a perder el acceso inmediatamente." : `¿Quitar el acceso a ${e}?`)) return;
    const { error } = await supabase.from("usuarios_autorizados").delete().eq("email", e);
    if (error) return alert(error.message);
    if (propio) window.location.reload();
    else reload();
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary tracking-tight font-display">Usuarios Autorizados</h1>
        <p className="text-sm text-on-surface-variant">Solo los emails de esta lista pueden ver y operar la tesorería.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
              placeholder="nombre@empresa.com"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-xs font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none"
            />
          </div>
          <SubmitButton onClick={agregar} saving={saving}>
            <UserPlus className="w-4 h-4" />
            Autorizar email
          </SubmitButton>
        </div>
        <ErrorBanner message={error} />
        <div className="flex gap-3 p-3 rounded-lg bg-secondary-fixed/20 border border-secondary/10 text-[11px] text-on-surface-variant">
          <Info className="w-4 h-4 text-secondary shrink-0" />
          <p>
            Una vez autorizado, la persona entra con su email desde la pantalla de login y recibe el enlace de acceso. Cualquier email puede pedir el
            enlace, pero solo los de esta lista ven datos.
          </p>
        </div>
      </div>

      <ErrorBanner message={errorCarga} />

      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-sm overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50 text-[10px] font-bold text-outline uppercase tracking-widest border-b border-outline-variant/10">
                <th className="px-6 py-4">Email</th>
                <th className="px-4 py-4">Autorizado el</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-xs">
              {data?.length === 0 && <EmptyRow colSpan={3} />}
              {data?.map((u) => (
                <tr key={u.email} className="hover:bg-surface-container-low/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-container-low text-secondary flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-primary">{u.email}</span>
                      {u.email === miEmail && <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[9px] font-bold uppercase">Vos</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-numeric text-on-surface-variant">{fecha(u.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => quitar(u.email)}
                      disabled={data.length === 1}
                      title={data.length === 1 ? "Debe quedar al menos un usuario" : "Quitar acceso"}
                      className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors disabled:opacity-30 disabled:hover:text-outline"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
