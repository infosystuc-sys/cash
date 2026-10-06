import React, { useEffect, useRef, useState } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { number as fmtNumber, parseNumber } from "../lib/format";

export const inputCls =
  "w-full h-10 px-3 rounded-lg bg-surface-container-low border-0 text-xs font-medium focus:ring-2 focus:ring-secondary/20 outline-none";
export const selectCls = cn(inputCls, "appearance-none cursor-pointer");

export function FormGroup({
  label,
  children,
  className,
  onNuevo,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Muestra un botón "+ Nuevo" junto a la etiqueta (p.ej. para crear el cliente/proveedor sin salir del formulario) */
  onNuevo?: () => void;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-bold text-primary uppercase tracking-wider">{label}</label>
        {onNuevo && (
          <button type="button" onClick={onNuevo} className="text-[10px] font-bold text-secondary hover:underline whitespace-nowrap">
            + Nuevo
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Input numérico con formato es-AR ("1.800.000,00"). Llama onChange con el número (o NaN). */
export function MoneyInput({
  value,
  onChange,
  prefix = "$",
  className,
  inputClassName,
  placeholder = "0,00",
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(Number.isFinite(value) && value ? fmtNumber(value) : "");

  // Sincroniza cuando el valor cambia desde afuera (p.ej. recalcular cuotas)
  useEffect(() => {
    if (parseNumber(text) !== value) setText(Number.isFinite(value) && value ? fmtNumber(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline font-bold text-[11px]">{prefix}</span>
      <input
        inputMode="decimal"
        className={cn(
          "w-full h-10 pl-9 pr-3 text-right rounded-lg bg-surface-container-low border-0 text-xs font-bold font-numeric focus:ring-2 focus:ring-secondary/20 outline-none",
          inputClassName,
        )}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumber(e.target.value));
        }}
        onBlur={() => {
          const n = parseNumber(text);
          if (Number.isFinite(n)) setText(fmtNumber(n));
        }}
      />
    </div>
  );
}

const pilaModales: object[] = [];

export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  size = "max-w-2xl",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: string;
}) {
  // Con modales anidados, Esc cierra solo el de arriba
  const token = useRef({});
  useEffect(() => {
    const t = token.current;
    pilaModales.push(t);
    return () => {
      pilaModales.splice(pilaModales.indexOf(t), 1);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && pilaModales[pilaModales.length - 1] === token.current && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-primary/40 backdrop-blur-sm">
      <div className={cn("relative w-full bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]", size)}>
        <div className="px-8 py-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/30">
          <div className="flex items-center gap-4">
            {icon && (
              <div className="w-12 h-12 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center shadow-sm">{icon}</div>
            )}
            <div>
              <h2 className="text-xl font-bold text-primary tracking-tight font-display">{title}</h2>
              {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-outline">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8 overflow-y-auto space-y-6">{children}</div>
        {footer && (
          <div className="px-8 py-4 border-t border-outline-variant/10 flex items-center justify-end gap-3 bg-surface-container-low/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-6 py-2.5 rounded-lg text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
    >
      Cancelar
    </button>
  );
}

export function SubmitButton({
  onClick,
  saving,
  disabled,
  children,
}: {
  onClick: () => void;
  saving?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="px-8 py-2.5 rounded-lg text-xs font-bold bg-secondary text-on-secondary shadow-lg hover:bg-secondary-container transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container/30 border border-error/20 text-error text-xs font-bold">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function Loading({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-outline text-xs font-bold">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyRow({ colSpan, label = "Sin registros" }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-10 text-center text-xs text-outline font-medium">
        {label}
      </td>
    </tr>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; danger?: boolean }[];
}) {
  return (
    <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-4 py-1.5 rounded text-[10px] font-bold transition-colors whitespace-nowrap",
            value === o.value
              ? "bg-surface-container-lowest text-primary shadow-sm"
              : o.danger
                ? "text-error hover:bg-error-container/10"
                : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pequeño helper para formularios: ejecuta una acción async mostrando saving/error. */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, setError, run };
}
