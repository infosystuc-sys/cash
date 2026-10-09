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
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
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

type Item = { name: string; path: string; icon: React.ComponentType<{ className?: string }> };

function NavLinks({ titulo, items, colapsado }: { titulo: string; items: Item[]; colapsado: boolean }) {
  const location = useLocation();
  return (
    <div>
      {colapsado ? (
        <div className="mx-3 mb-2 border-t border-outline-variant/30" />
      ) : (
        <div className="px-3 mb-2 text-[10px] font-bold text-outline uppercase tracking-widest">{titulo}</div>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              title={colapsado ? item.name : undefined}
              className={cn(
                "flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors",
                colapsado ? "justify-center px-0" : "px-3",
                isActive ? "bg-primary-container text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-on-primary" : "text-outline")} />
              {!colapsado && item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ colapsado, onToggle }: { colapsado: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { data: cantCuentas } = useData(async () => {
    const { count, error } = await supabase.from("cuentas").select("id", { count: "exact", head: true }).eq("activa", true);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, [location.pathname]); // se recalcula al cambiar de sección (p.ej. después de crear o eliminar cuentas)

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col z-50 transition-[width] duration-200",
        colapsado ? "w-16" : "w-64",
      )}
    >
      <div className={cn("h-16 flex items-center gap-3", colapsado ? "px-2 justify-center" : "px-6")}>
        {!colapsado && (
          <>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
              <TrendingUp className="text-on-primary w-5 h-5" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-display font-bold text-primary leading-tight truncate">Synapse Tech</span>
              <span className="text-[10px] font-semibold text-outline uppercase tracking-wider truncate">Finanzas & Cash Flow</span>
            </div>
          </>
        )}
        <button
          onClick={onToggle}
          title={colapsado ? "Expandir menú" : "Retraer menú"}
          className="p-2 rounded-lg text-outline hover:text-secondary hover:bg-surface-container-low transition-colors shrink-0"
        >
          {colapsado ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className={cn("flex-1 py-4 space-y-6 overflow-y-auto", colapsado ? "px-2" : "px-3")}>
        <NavLinks titulo="Operaciones" items={navigation} colapsado={colapsado} />
        <NavLinks titulo="Estructura" items={structure} colapsado={colapsado} />
      </nav>

      <div className={cn("mt-auto", colapsado ? "p-2 flex justify-center" : "p-4")}>
        {colapsado ? (
          <Link
            to="/cuentas"
            title={`Tesorería AR • ${cantCuentas ?? "–"} cuentas`}
            className="w-10 h-10 bg-surface-container-low rounded-lg flex items-center justify-center text-secondary border border-outline-variant/30"
          >
            <Plus className="w-4 h-4" />
          </Link>
        ) : (
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
        )}
      </div>
    </aside>
  );
}

export function Header({ colapsado }: { colapsado: boolean }) {
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
    <header
      className={cn(
        "fixed top-0 right-0 h-16 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex items-center justify-between px-8 z-40 transition-[left] duration-200",
        colapsado ? "left-16" : "left-64",
      )}
    >
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

const CLAVE_MENU = "menu-colapsado";

export function Layout({ children }: { children: React.ReactNode }) {
  // Preferencia por navegador; si el storage no está disponible, arranca expandido
  const [colapsado, setColapsado] = React.useState(() => {
    try {
      return localStorage.getItem(CLAVE_MENU) === "1";
    } catch {
      return false;
    }
  });

  function toggle() {
    setColapsado((c) => {
      try {
        localStorage.setItem(CLAVE_MENU, c ? "0" : "1");
      } catch {
        // sin persistencia
      }
      return !c;
    });
  }

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar colapsado={colapsado} onToggle={toggle} />
      <Header colapsado={colapsado} />
      <main className={cn("pt-16 transition-[padding] duration-200", colapsado ? "pl-16" : "pl-64")}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
