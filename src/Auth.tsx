import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Mail, TrendingUp, CheckCircle, Loader2, ShieldAlert, LogOut } from "lucide-react";
import { supabase } from "./lib/supabase";
import { ErrorBanner } from "./components/ui";

const SessionContext = createContext<Session | null>(null);

export const useSession = () => useContext(SessionContext);

/**
 * TEMPORAL: sin login, la app usa el rol anon (ver migración acceso_libre_temporal).
 * Para volver al magic link + lista de autorizados: poner en false y revertir esa migración.
 */
export const ACCESO_LIBRE = true;

export function AuthGate({ children }: { children: React.ReactNode }) {
  if (ACCESO_LIBRE) return <AccesoLibre>{children}</AccesoLibre>;
  return <AuthConLogin>{children}</AuthConLogin>;
}

/** Descarta sesiones previas (locales) para que todas las consultas vayan como anon. */
function AccesoLibre({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.signOut({ scope: "local" }).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <>{children}</>;
}

/** Muestra el login hasta que haya sesión; luego renderiza la app. */
function AuthConLogin({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-outline">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <SessionContext.Provider value={session}>
      <AccesoGate email={session.user.email ?? ""}>{children}</AccesoGate>
    </SessionContext.Provider>
  );
}

/** Verifica que el email logueado esté en la lista de usuarios autorizados. */
function AccesoGate({ email, children }: { email: string; children: React.ReactNode }) {
  const [estado, setEstado] = useState<"verificando" | "ok" | "denegado" | "error">("verificando");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEstado("verificando");
    supabase.rpc("es_autorizado").then(({ data, error }) => {
      if (error) {
        setError(error.message);
        setEstado("error");
      } else setEstado(data ? "ok" : "denegado");
    });
  }, [email]);

  if (estado === "ok") return <>{children}</>;

  if (estado === "verificando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-outline">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-xl p-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-error font-bold text-sm">
          <ShieldAlert className="w-5 h-5" /> Sin acceso
        </div>
        {estado === "error" ? (
          <ErrorBanner message={error} />
        ) : (
          <p className="text-xs text-on-surface-variant">
            El email <strong className="text-primary">{email}</strong> no está en la lista de usuarios autorizados. Pedile a un usuario con acceso que lo agregue
            desde la sección Usuarios.
          </p>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          className="h-10 rounded-lg bg-surface-container-high text-primary text-xs font-bold hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Crea el usuario de Auth si no existe; el acceso a los datos lo decide la lista de usuarios autorizados (RLS)
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-xl p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="text-on-primary w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-primary leading-tight">Synapse Tech</span>
            <span className="text-[10px] font-semibold text-outline uppercase tracking-wider">Finanzas & Cash Flow</span>
          </div>
        </div>

        {sent ? (
          <div className="flex flex-col gap-3 items-start">
            <div className="flex items-center gap-2 text-on-tertiary-container font-bold text-sm">
              <CheckCircle className="w-5 h-5" /> Revisá tu email
            </div>
            <p className="text-xs text-on-surface-variant">
              Enviamos un enlace de acceso a <strong className="text-primary">{email}</strong>. Abrilo desde este mismo navegador.
            </p>
            <button onClick={() => setSent(false)} className="text-[11px] font-bold text-secondary hover:underline">
              Usar otro email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold text-primary font-display">Ingresar</h1>
              <p className="text-xs text-on-surface-variant">Te enviamos un enlace mágico por email.</p>
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full h-11 pl-9 pr-3 rounded-lg bg-surface-container-low text-sm font-medium border-0 focus:ring-2 focus:ring-secondary/20 outline-none"
              />
            </div>
            <ErrorBanner message={error} />
            <button
              type="submit"
              disabled={sending}
              className="h-11 rounded-lg bg-secondary text-on-secondary text-xs font-bold shadow-md hover:bg-secondary-container transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enviar enlace de acceso
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
