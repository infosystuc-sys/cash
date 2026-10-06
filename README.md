# Cashflow Infosys

Tesorería y cash flow (ingresos, cheques, deudas, egresos, cuentas) con React + Vite y backend en Supabase.

## Correr en local

1. `npm install --legacy-peer-deps`
2. Copiar `.env.example` a `.env.local` y completar `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `npm run dev` → http://localhost:3000

> **Temporal: acceso libre, sin login.** `ACCESO_LIBRE = true` en `src/Auth.tsx` y la migración
> `…_acceso_libre_temporal.sql` dan lectura/escritura total al rol anon. Para volver al login:
> poner `ACCESO_LIBRE = false` y ejecutar el bloque "REVERTIR" de esa migración.

Con el login activado, el acceso es por **magic link**: el enlace crea el usuario de Supabase Auth si no existe, pero solo
los emails cargados en la pantalla **Usuarios** (tabla `usuarios_autorizados`) ven y operan datos.
Requiere que "Allow new users to sign up" esté activado en Authentication.

## Backend (carpeta `supabase/`)

| Archivo | Contenido |
|---|---|
| `migrations/…_esquema_base.sql` | Tablas, enums, triggers de validación y RLS |
| `migrations/…_vistas_y_funciones.sql` | Vistas `v_*` (saldos, estados) y RPCs (`crear_ingreso`, `registrar_cobro`, `crear_deuda`, `endosar_cheque`, `depositar_cheque`, `rechazar_cheque`, `fn_cashflow`) |
| `migrations/…_usuarios_autorizados.sql` | Lista de emails autorizados y políticas RLS que la exigen |
| `migrations/…_cron_cotizacion.sql` | pg_cron que llama a la Edge Function cada 30 min (L-V 10–18 hs AR) |
| `functions/actualizar-cotizacion` | Trae el dólar MEP de dolarapi.com y lo guarda en `cotizaciones` |
| `seed.sql` | Datos demo (fechas relativas a hoy) |

### Modelo

- **Saldos**: no se guardan. `v_cuentas_saldo` = `saldo_inicial` + movimientos (`v_movimientos`: cobros, egresos, transferencias, depósitos/rechazos de cheques).
- **Ingresos** → `ingreso_vencimientos` (1–12) → `cobros` (parciales; por transferencia/efectivo a una cuenta, o con cheque que entra a cartera).
- **Cheques** (solo recibidos): `en_cartera` → `endosado` (genera egreso) | `depositado` (acredita en cuenta) | `rechazado` (anula el cobro).
- **Deudas** → `deuda_cuotas` → pagadas con `egresos.deuda_cuota_id`.
- **USD**: cada operación guarda su TC; la valuación de saldos y el cash flow usan el último MEP de `cotizaciones`.
- **RLS**: una sola empresa; solo usuarios logueados cuyo email está en `usuarios_autorizados` leen/escriben (función `es_autorizado()`). La lista se administra desde la pantalla **Usuarios** y nunca puede quedar vacía. `anon` no tiene acceso.

Tipos TS generados en `src/lib/database.types.ts`.
