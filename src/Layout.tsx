import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Clock,
  TrendingDown,
  Landmark,
  Users,
  Plus,
  Calendar,
  LogOut,
  RefreshCw,
  Truck,
  ShieldCheck
} from "lucide-react";
import { cn } from "./lib/utils";
import { supabase, check } from "./lib/supabase";
import { useData } from "./lib/useData";
import { ACCESO_LIBRE, useSession } from "./Auth";
import { fecha, hoyISO, money } from "./lib/format";

const navigation = [
  { name: "Cash Flow", path: "/", icon: LayoutDashboard },
  { name: "Ingresos", path: "/ingresos", icon: TrendingUp },
  { name: "Cheques", path: "/cheques", icon: Receipt },
  { name: "Deudas", path: "/deudas", icon: Clock },
  { name: "Egresos", path: "/egresos", icon: TrendingDown },
];

const structure = [
  { name: "Cuentas", path: "/cuentas", icon: Landmark },
  { name: "Clientes", path: "/clientes", icon: Users },
  { name: "Proveedores", path: "/proveedores", icon: Truck },
  // Con acceso libre no hay login, así que la lista de autorizados no aplica
  ...(ACCESO_LIBRE ? [] : [{ name: "Usuarios", path: "/usuarios", icon: ShieldCheck }]),
];

export function Sidebar() {
  const location = useLocation();
  const { data: cantCuentas } = useData(async () => {
    const { count, error } = await supabase.from("cuentas").select("id", { count: "exact", head: true }).eq("activa", true);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, [location.pathname]); // se recalcula al cambiar de sección (p.ej. después de crear o eliminar cuentas)

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col z-50">
      <div className="h-16 px-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <TrendingUp className="text-on-primary w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-display font-bold text-primary leading-tight">Synapse Tech</span>
          <span className="text-[10px] font-semibold text-outline uppercase tracking-wider">Finanzas & Cash Flow</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[10px] font-bold text-outline uppercase tracking-widest">Operaciones</div>
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary-container text-on-primary shadow-sm" 
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-on-primary" : "text-outline")} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-3 mb-2 text-[10px] font-bold text-outline uppercase tracking-widest">Estructura</div>
          <div className="space-y-1">
            {structure.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary-container text-on-primary shadow-sm" 
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                >
                  <item.icon className={cn("w-4 h-4", isActive ? "text-on-primary" : "text-outline")} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 mt-auto">
        <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-outline uppercase tracking-tight">Tesorería AR</span>
              <span className="text-xs font-bold text-secondary">Online • {cantCuentas ?? "–"} Cuentas</span>
            </div>
            <Link to="/cuentas" className="w-8 h-8 bg-surface-container-lowest rounded-lg flex items-center justify-center text-secondary border border-outline-variant/30">
              <Plus className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Header() {
  const session = useSession();
  const navigate = useNavigate();
  const { data: tc, reload } = useData(async () => {
    const { data, error } = await supabase.from("v_cotizacion_actual").select("venta, fecha").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

  async function refrescarTc() {
    await supabase.functions.invoke("actualizar-cotizacion");
    reload();
  }

  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex items-center justify-between px-8 z-40">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low rounded-full text-on-surface-variant border border-outline-variant/20">
          <Calendar className="w-3.5 h-3.5 text-outline" />
          <span className="text-xs font-medium">Buenos Aires, {fecha(hoyISO())}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5 bg-surface-container-lowest rounded-lg shadow-sm border border-outline-variant/20">
          <span className="text-[10px] font-bold text-outline uppercase tracking-wider">TC Ref USD</span>
          <span className="font-numeric text-xs font-bold text-on-surface" title={tc ? `Cotización del ${fecha(tc.fecha)}` : "Sin cotización"}>
            {tc?.venta ? money(tc.venta) : "—"}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-tertiary-container/20 text-on-tertiary-container border border-on-tertiary-container/20">MEP</span>
          <button onClick={refrescarTc} title="Actualizar cotización" className="text-outline hover:text-secondary transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/ingresos?nuevo=1")} className="flex items-center gap-2 bg-secondary text-on-secondary px-4 py-2 rounded-lg text-xs font-bold hover:bg-secondary-container transition-all shadow-sm">
          <Plus className="w-4 h-4" />
          Nueva Operación
        </button>
        <div className="h-8 w-px bg-outline-variant/30 mx-2" />
        <div className="flex items-center gap-3 text-right">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-on-surface">{ACCESO_LIBRE ? "Acceso libre" : session?.user.email}</span>
            <span className="text-[10px] font-medium text-outline uppercase">Tesorería</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary-container border border-outline-variant/40 overflow-hidden">
            <img src="/avatar_executive_user_1728200000000.png" alt="User" className="w-full h-full object-cover" onError={(e) => {
              e.currentTarget.src = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
            }} />
          </div>
          {!ACCESO_LIBRE && (
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" className="p-2 rounded-lg text-outline hover:text-error hover:bg-error-container/10 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-16">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
