-- Datos demo (los que estaban hardcodeados en el frontend).
-- Las fechas son relativas a hoy (el mock original estaba armado sobre 24/10/2024).
do $$
declare
  d date := public.hoy();
  -- catálogos
  ti_retainer bigint; ti_honorario bigint; ti_horas bigint; ti_comision bigint; ti_mant bigint; ti_apps bigint;
  c_acme bigint; c_fintech bigint; c_distri bigint; c_logistica bigint; c_neosoft bigint;
  p_aws bigint; p_dell bigint; p_palermo bigint; p_inmob bigint; p_github bigint;
  k_cloud bigint; k_sueldos bigint; k_lic bigint; k_alq bigint; k_leasing bigint; k_hon bigint; k_otros bigint;
  a_tom bigint; a_cab bigint; a_usd bigint; a_caja bigint;
  -- operaciones
  v_ing bigint; v_deu bigint; v_cheque bigint;
begin
  -- ---------- Tipos de ingreso ----------
  insert into public.tipos_ingreso (nombre) values ('Retainer Mensual') returning id into ti_retainer;
  insert into public.tipos_ingreso (nombre) values ('Honorario Mensual') returning id into ti_honorario;
  insert into public.tipos_ingreso (nombre) values ('Horas Técnicas') returning id into ti_horas;
  insert into public.tipos_ingreso (nombre) values ('Comisión Tango') returning id into ti_comision;
  insert into public.tipos_ingreso (nombre) values ('Mantenimiento') returning id into ti_mant;
  insert into public.tipos_ingreso (nombre) values ('Desarrollo Apps') returning id into ti_apps;

  -- ---------- Clientes ----------
  insert into public.clientes (razon_social, cuit, tipo_ingreso_id) values ('Acme Corp S.A.', '30-71442109-8', ti_retainer) returning id into c_acme;
  insert into public.clientes (razon_social, cuit, tipo_ingreso_id) values ('FinTech Sur SRL', '30-79883411-2', ti_horas) returning id into c_fintech;
  insert into public.clientes (razon_social, cuit, tipo_ingreso_id) values ('Distribuidora Centro', '30-68310928-1', ti_comision) returning id into c_distri;
  insert into public.clientes (razon_social, cuit, tipo_ingreso_id) values ('Logística Baires S.A.', '33-65229103-9', ti_mant) returning id into c_logistica;
  insert into public.clientes (razon_social, cuit, tipo_ingreso_id, activo) values ('Neosoft SRL', '30-71190442-4', ti_apps, false) returning id into c_neosoft;

  -- ---------- Proveedores ----------
  insert into public.proveedores (razon_social, cuit) values ('Amazon Web Services / IT Soluciones SRL', '30-71192834-4') returning id into p_aws;
  insert into public.proveedores (razon_social, cuit) values ('Dell Financial Services S.A.', '30-70891234-9') returning id into p_dell;
  insert into public.proveedores (razon_social, cuit) values ('Oficinas Palermo Cowork S.A.', '30-68934521-8') returning id into p_palermo;
  insert into public.proveedores (razon_social) values ('Inmobiliaria Metropolitana') returning id into p_inmob;
  insert into public.proveedores (razon_social) values ('GitHub Inc.') returning id into p_github;

  -- ---------- Categorías de egreso ----------
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Infraestructura Cloud', 'Hosting & Compute', 'Servidores AWS, Azure, Google Cloud, Cloudflare y CDN Edge', '#0051D5', 'cloud') returning id into k_cloud;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Sueldos y Cargas Devs', 'Nómina Core', 'Salarios ingenieros full-stack, arquitectos y retenciones', '#1E293B', 'badge') returning id into k_sueldos;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Licencias y Repositorios', 'SaaS & DevOps Tools', 'GitHub Enterprise, Jira, Datadog, Slack, OpenAI API', '#24A375', 'key') returning id into k_lic;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Alquiler y Servicios', 'Oficinas', 'Alquiler de oficinas, coworking, expensas y servicios', '#316BF3', 'building') returning id into k_alq;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Leasing Equipos', 'Activos Fijos Tecnología', 'Financiamiento y leasing de equipamiento', '#45474C', 'laptop') returning id into k_leasing;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Honorarios', 'Servicios Profesionales', 'Contador, abogados y consultores externos', '#B4C5FF', 'briefcase') returning id into k_hon;
  insert into public.categorias_egreso (nombre, subtitulo, descripcion, color, icono) values
    ('Otros / Caja', 'Gastos menores', 'Gastos de caja chica y varios', '#75777D', 'wallet') returning id into k_otros;

  -- ---------- Cuentas (saldo inicial se ajusta al final) ----------
  insert into public.cuentas (nombre, entidad, etiqueta, tipo, moneda, numero, cbu, alias, fecha_saldo_inicial)
  values ('Galicia TOM', 'Banco Galicia', 'Banco Galicia Operativa', 'cuenta_corriente', 'ARS', '40182-1', '0070123430004018210023', 'SYNAPSE.GALICIA.TOM', d - 90)
  returning id into a_tom;
  insert into public.cuentas (nombre, entidad, etiqueta, tipo, moneda, numero, fecha_saldo_inicial)
  values ('Galicia CAB', 'Banco Galicia', 'Banco Galicia Reserva', 'cuenta_corriente', 'ARS', '092-23491-0', d - 90)
  returning id into a_cab;
  insert into public.cuentas (nombre, etiqueta, tipo, moneda, numero, fecha_saldo_inicial)
  values ('Caja en dólares', 'Custodia Física Billete', 'custodia', 'USD', 'Cofre de Seguridad', d - 90)
  returning id into a_usd;
  insert into public.cuentas (nombre, etiqueta, tipo, moneda, fecha_saldo_inicial)
  values ('Caja en efectivo', 'Caja Chica', 'efectivo', 'ARS', d - 90)
  returning id into a_caja;

  -- ---------- Ingresos + cobros ----------
  -- Acme: MVP App choferes, 2 cuotas; la 1ra cobrada por transferencia, la 2da vence en 4 días
  v_ing := public.crear_ingreso(c_acme, ti_apps, d - 19, 'Desarrollo MVP App Choferes iOS/Android - Hito 2', 'ARS', 4200000,
    jsonb_build_array(
      jsonb_build_object('fecha_vencimiento', d - 9, 'importe', 2100000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_tom),
      jsonb_build_object('fecha_vencimiento', d + 4, 'importe', 2100000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_tom)),
    'Factura A-0004-00001248');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing and numero = 1),
    d - 2, 2100000, 'transferencia', a_tom, null, null, 'Cobro Acme Corp Hito 2');

  -- FinTech: horas técnicas, vencido impago
  perform public.crear_ingreso(c_fintech, ti_horas, d - 23, '50 hs soporte arquitectura Kubernetes & CI/CD', 'ARS', 1820000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 9, 'importe', 1820000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_tom)),
    'Factura A-0004-00001239');

  -- Acme: honorarios mensuales, a cobrar en 4 días
  perform public.crear_ingreso(c_acme, ti_retainer, d - 5, 'Honorarios mensuales retainer', 'ARS', 2450000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d + 4, 'importe', 2450000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_tom)),
    'Factura A-0004-00001250');

  -- FinTech: horas técnicas cloud, a cobrar en 9 días
  perform public.crear_ingreso(c_fintech, ti_horas, d - 3, 'Horas técnicas cloud', 'ARS', 1650000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d + 9, 'importe', 1650000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_cab)),
    'Factura A-0004-00001252');

  -- Abono mensual en 2 cuotas (ejemplo del modal)
  perform public.crear_ingreso(c_logistica, ti_mant, d, 'Abono soporte mensual servidores y mantenimiento de arquitectura cloud', 'ARS', 3600000,
    jsonb_build_array(
      jsonb_build_object('fecha_vencimiento', d + 12, 'importe', 1800000, 'medio_previsto', 'Transferencia', 'cuenta_prevista_id', a_tom),
      jsonb_build_object('fecha_vencimiento', d + 27, 'importe', 1800000, 'medio_previsto', 'eCheq a 30 días')),
    'Factura A-0004-00001253');

  -- Acme: mantenimiento cobrado con eCheq Santander (en cartera, vence en 6 días)
  v_ing := public.crear_ingreso(c_acme, ti_mant, d - 15, 'Mantenimiento evolutivo plataforma', 'ARS', 1800000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 5, 'importe', 1800000)), 'Factura A-0004-00001241');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing),
    d - 5, 1800000, 'cheque', null, null,
    jsonb_build_object('banco_emisor', 'Santander Río', 'numero', '00849201', 'tipo', 'echeq', 'fecha_pago', d + 6,
                       'librador', 'Acme Corp S.A.', 'librador_cuit', '30-71449821-4'));

  -- FinTech: mantenimiento cobrado con eCheq Galicia (vence en 4 días)
  v_ing := public.crear_ingreso(c_fintech, ti_mant, d - 12, 'Mantenimiento mensual infraestructura', 'ARS', 850000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 4, 'importe', 850000)), 'Factura A-0004-00001244');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing),
    d - 4, 850000, 'cheque', null, null,
    jsonb_build_object('banco_emisor', 'Banco Galicia', 'numero', '00931245', 'tipo', 'echeq', 'fecha_pago', d + 4,
                       'librador', 'FinTech Sur SRL', 'librador_cuit', '30-71882049-9'));

  -- Distribuidora: comisión cobrada con cheque físico BBVA (vence en 22 días)
  v_ing := public.crear_ingreso(c_distri, ti_comision, d - 20, 'Comisión implementación Tango Gestión', 'ARS', 1630000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 10, 'importe', 1630000)), 'Factura A-0004-00001240');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing),
    d - 10, 1630000, 'cheque', null, null,
    jsonb_build_object('banco_emisor', 'BBVA Francés', 'numero', '00472190', 'tipo', 'fisico', 'fecha_pago', d + 22,
                       'librador', 'Distribuidora Centro', 'librador_cuit', '33-65918234-9'));

  -- Distribuidora: comisión anterior cobrada con cheque luego endosado a Oficinas Palermo
  v_ing := public.crear_ingreso(c_distri, ti_comision, d - 45, 'Comisión renovación licencias Tango', 'ARS', 600000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 35, 'importe', 600000)), 'Factura A-0004-00001221');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing),
    d - 35, 600000, 'cheque', null, null,
    jsonb_build_object('banco_emisor', 'Banco Macro', 'numero', '00311877', 'tipo', 'fisico', 'fecha_pago', d - 20,
                       'librador', 'Distribuidora Centro', 'librador_cuit', '33-65918234-9'));
  select id into v_cheque from public.cheques where numero = '00311877';
  perform public.endosar_cheque(v_cheque, d - 25, p_palermo, k_alq, 'nominativo', 'Alquiler coworking mes anterior');

  -- Logística: exportación de software cobrada en USD a la caja en dólares
  v_ing := public.crear_ingreso(c_logistica, ti_apps, d - 10, 'Exportación SW - módulo de ruteo', 'USD', 1200,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d - 6, 'importe', 1200)), 'Factura E-0002-00000031');
  perform public.registrar_cobro((select id from public.ingreso_vencimientos where ingreso_id = v_ing),
    d - 6, 1200, 'efectivo', a_usd, 1285, null, 'Cobro Exterior Exportación SW');

  -- ---------- Deudas ----------
  -- AWS factura del mes (USD), vence en 2 días
  perform public.crear_deuda(p_aws, 'Infraestructura Servidores Cloud AWS', 'USD', 850,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d + 2, 'importe', 850)),
    k_cloud, 1285, 'AWS Factura del mes', null, d - 5);

  -- Dell leasing 6 cuotas de 680.000 (2 pagadas)
  v_deu := public.crear_deuda(p_dell, 'Financiamiento 6 notebooks devs', 'ARS', 4080000,
    (select jsonb_agg(jsonb_build_object('fecha_vencimiento', d - 50 + (n - 1) * 30, 'importe', 680000)) from generate_series(1, 6) n),
    k_leasing, null, 'Contrato #DL-AR-8831', 'Tasa fija comercial en pesos (TNA 0.0%). Leasing directo con cuotas fijas sin ajuste.', d - 60);
  insert into public.egresos (fecha, categoria_egreso_id, proveedor_id, concepto, moneda, importe, medio, cuenta_id, deuda_cuota_id)
  values
    (d - 50, k_leasing, p_dell, 'Cuota 1/6 leasing Dell', 'ARS', 680000, 'debito_automatico', a_cab,
      (select id from public.deuda_cuotas where deuda_id = v_deu and numero = 1)),
    (d - 21, k_leasing, p_dell, 'Cuota 2/6 leasing Dell', 'ARS', 680000, 'transferencia', a_cab,
      (select id from public.deuda_cuotas where deuda_id = v_deu and numero = 2));

  -- Alquiler Oficinas Palermo, vence en 7 días
  perform public.crear_deuda(p_palermo, 'Alquiler coworking mes en curso', 'ARS', 950000,
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', d + 7, 'importe', 950000)),
    k_alq, null, null, null, d - 3);

  -- ---------- Egresos sueltos ----------
  insert into public.egresos (fecha, categoria_egreso_id, proveedor_id, concepto, moneda, importe, tc, medio, cuenta_id) values
    (d - 30, k_cloud, p_aws, 'Pago mensual infraestructura cloud AWS (mes anterior)', 'USD', 850, 1285, 'transferencia', a_tom),
    (d - 2, k_alq, p_inmob, 'Alquiler Piso Oficinas Catalinas Norte', 'ARS', 950000, null, 'transferencia', a_cab),
    (d - 8, k_lic, p_github, 'GitHub Enterprise + Jira + Datadog', 'ARS', 420550, null, 'tarjeta', a_tom),
    (d - 10, k_hon, null, 'Honorarios estudio contable', 'ARS', 390000, null, 'transferencia', a_tom),
    (d - 12, k_otros, null, 'Gastos varios caja chica', 'ARS', 280000, null, 'efectivo', a_caja),
    (d - 4, k_sueldos, null, 'Sueldos devs quincena', 'ARS', 4500000, null, 'transferencia', a_cab);

  -- ---------- Transferencias internas ----------
  insert into public.transferencias (fecha, cuenta_origen_id, cuenta_destino_id, importe_origen, importe_destino, concepto) values
    (d - 2, a_tom, a_cab, 1200000, 1200000, 'Reserva para pago de sueldos'),
    (d - 6, a_tom, a_caja, 100000, 100000, 'Extracción reposición fondo fijo');

  -- ---------- Saldo inicial: ajustado para que el saldo actual coincida con el mock ----------
  update public.cuentas cu
     set saldo_inicial = x.objetivo - coalesce((select sum(m.importe) from public.v_movimientos m where m.cuenta_id = cu.id), 0)
    from (values (a_tom, 6420150.50), (a_cab, 3180000.00), (a_usd, 3200.00), (a_caja, 288170.00)) as x(id, objetivo)
   where cu.id = x.id;
end;
$$;
