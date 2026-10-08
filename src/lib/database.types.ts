export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categorias_egreso: {
        Row: {
          activa: boolean
          color: string
          created_at: string
          descripcion: string | null
          icono: string | null
          id: number
          nombre: string
          subtitulo: string | null
        }
        Insert: {
          activa?: boolean
          color?: string
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: never
          nombre: string
          subtitulo?: string | null
        }
        Update: {
          activa?: boolean
          color?: string
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: never
          nombre?: string
          subtitulo?: string | null
        }
        Relationships: []
      }
      cheques: {
        Row: {
          banco_emisor: string
          cliente_id: number | null
          created_at: string
          created_by: string | null
          cuenta_deposito_id: number | null
          estado: Database["public"]["Enums"]["estado_cheque"]
          fecha_deposito: string | null
          fecha_emision: string | null
          fecha_endoso: string | null
          fecha_pago: string
          fecha_recepcion: string
          fecha_rechazo: string | null
          id: number
          importe: number
          librador: string | null
          librador_cuit: string | null
          motivo_endoso: string | null
          motivo_rechazo: string | null
          notas: string | null
          numero: string
          proveedor_endoso_id: number | null
          tipo: Database["public"]["Enums"]["tipo_cheque"]
          tipo_endoso: Database["public"]["Enums"]["tipo_endoso"] | null
        }
        Insert: {
          banco_emisor: string
          cliente_id?: number | null
          created_at?: string
          created_by?: string | null
          cuenta_deposito_id?: number | null
          estado?: Database["public"]["Enums"]["estado_cheque"]
          fecha_deposito?: string | null
          fecha_emision?: string | null
          fecha_endoso?: string | null
          fecha_pago: string
          fecha_recepcion?: string
          fecha_rechazo?: string | null
          id?: never
          importe: number
          librador?: string | null
          librador_cuit?: string | null
          motivo_endoso?: string | null
          motivo_rechazo?: string | null
          notas?: string | null
          numero: string
          proveedor_endoso_id?: number | null
          tipo?: Database["public"]["Enums"]["tipo_cheque"]
          tipo_endoso?: Database["public"]["Enums"]["tipo_endoso"] | null
        }
        Update: {
          banco_emisor?: string
          cliente_id?: number | null
          created_at?: string
          created_by?: string | null
          cuenta_deposito_id?: number | null
          estado?: Database["public"]["Enums"]["estado_cheque"]
          fecha_deposito?: string | null
          fecha_emision?: string | null
          fecha_endoso?: string | null
          fecha_pago?: string
          fecha_recepcion?: string
          fecha_rechazo?: string | null
          id?: never
          importe?: number
          librador?: string | null
          librador_cuit?: string | null
          motivo_endoso?: string | null
          motivo_rechazo?: string | null
          notas?: string | null
          numero?: string
          proveedor_endoso_id?: number | null
          tipo?: Database["public"]["Enums"]["tipo_cheque"]
          tipo_endoso?: Database["public"]["Enums"]["tipo_endoso"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cheques_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_cuenta_deposito_id_fkey"
            columns: ["cuenta_deposito_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_cuenta_deposito_id_fkey"
            columns: ["cuenta_deposito_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_proveedor_endoso_id_fkey"
            columns: ["proveedor_endoso_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          cuit: string | null
          id: number
          razon_social: string
          tipo_ingreso_id: number | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cuit?: string | null
          id?: never
          razon_social: string
          tipo_ingreso_id?: number | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cuit?: string | null
          id?: never
          razon_social?: string
          tipo_ingreso_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tipo_ingreso_id_fkey"
            columns: ["tipo_ingreso_id"]
            isOneToOne: false
            referencedRelation: "tipos_ingreso"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          anulado: boolean
          cheque_id: number | null
          cliente_id: number
          concepto: string | null
          created_at: string
          created_by: string | null
          cuenta_id: number | null
          fecha: string
          id: number
          importe: number
          ingreso_vencimiento_id: number | null
          medio: Database["public"]["Enums"]["medio_cobro"]
          moneda: Database["public"]["Enums"]["moneda"]
          tc: number | null
        }
        Insert: {
          anulado?: boolean
          cheque_id?: number | null
          cliente_id: number
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_id?: number | null
          fecha: string
          id?: never
          importe: number
          ingreso_vencimiento_id?: number | null
          medio: Database["public"]["Enums"]["medio_cobro"]
          moneda?: Database["public"]["Enums"]["moneda"]
          tc?: number | null
        }
        Update: {
          anulado?: boolean
          cheque_id?: number | null
          cliente_id?: number
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_id?: number | null
          fecha?: string
          id?: never
          importe?: number
          ingreso_vencimiento_id?: number | null
          medio?: Database["public"]["Enums"]["medio_cobro"]
          moneda?: Database["public"]["Enums"]["moneda"]
          tc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "v_cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_ingreso_vencimiento_id_fkey"
            columns: ["ingreso_vencimiento_id"]
            isOneToOne: false
            referencedRelation: "ingreso_vencimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_ingreso_vencimiento_id_fkey"
            columns: ["ingreso_vencimiento_id"]
            isOneToOne: false
            referencedRelation: "v_ingreso_vencimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          actualizado_at: string
          compra: number | null
          fecha: string
          fuente: string | null
          tipo: string
          venta: number
        }
        Insert: {
          actualizado_at?: string
          compra?: number | null
          fecha: string
          fuente?: string | null
          tipo?: string
          venta: number
        }
        Update: {
          actualizado_at?: string
          compra?: number | null
          fecha?: string
          fuente?: string | null
          tipo?: string
          venta?: number
        }
        Relationships: []
      }
      cuentas: {
        Row: {
          activa: boolean
          alias: string | null
          cbu: string | null
          created_at: string
          entidad: string | null
          etiqueta: string | null
          fecha_saldo_inicial: string
          id: number
          moneda: Database["public"]["Enums"]["moneda"]
          nombre: string
          numero: string | null
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["tipo_cuenta"]
        }
        Insert: {
          activa?: boolean
          alias?: string | null
          cbu?: string | null
          created_at?: string
          entidad?: string | null
          etiqueta?: string | null
          fecha_saldo_inicial?: string
          id?: never
          moneda?: Database["public"]["Enums"]["moneda"]
          nombre: string
          numero?: string | null
          saldo_inicial?: number
          tipo: Database["public"]["Enums"]["tipo_cuenta"]
        }
        Update: {
          activa?: boolean
          alias?: string | null
          cbu?: string | null
          created_at?: string
          entidad?: string | null
          etiqueta?: string | null
          fecha_saldo_inicial?: string
          id?: never
          moneda?: Database["public"]["Enums"]["moneda"]
          nombre?: string
          numero?: string | null
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["tipo_cuenta"]
        }
        Relationships: []
      }
      deuda_cuotas: {
        Row: {
          deuda_id: number
          fecha_vencimiento: string
          id: number
          importe: number
          numero: number
        }
        Insert: {
          deuda_id: number
          fecha_vencimiento: string
          id?: never
          importe: number
          numero: number
        }
        Update: {
          deuda_id?: number
          fecha_vencimiento?: string
          id?: never
          importe?: number
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "v_deudas"
            referencedColumns: ["id"]
          },
        ]
      }
      deudas: {
        Row: {
          categoria_egreso_id: number | null
          concepto: string
          created_at: string
          created_by: string | null
          fecha_alta: string
          forma_pago: Database["public"]["Enums"]["forma_pago_deuda"]
          id: number
          importe_total: number
          moneda: Database["public"]["Enums"]["moneda"]
          notas: string | null
          proveedor_id: number
          referencia: string | null
          tc_referencia: number | null
        }
        Insert: {
          categoria_egreso_id?: number | null
          concepto: string
          created_at?: string
          created_by?: string | null
          fecha_alta?: string
          forma_pago?: Database["public"]["Enums"]["forma_pago_deuda"]
          id?: never
          importe_total: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          proveedor_id: number
          referencia?: string | null
          tc_referencia?: number | null
        }
        Update: {
          categoria_egreso_id?: number | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          fecha_alta?: string
          forma_pago?: Database["public"]["Enums"]["forma_pago_deuda"]
          id?: never
          importe_total?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          proveedor_id?: number
          referencia?: string | null
          tc_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deudas_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "v_categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      egresos: {
        Row: {
          categoria_egreso_id: number
          cheque_id: number | null
          concepto: string
          created_at: string
          created_by: string | null
          cuenta_id: number | null
          deuda_cuota_id: number | null
          fecha: string
          id: number
          importe: number
          medio: Database["public"]["Enums"]["medio_pago"]
          moneda: Database["public"]["Enums"]["moneda"]
          proveedor_id: number | null
          tc: number | null
        }
        Insert: {
          categoria_egreso_id: number
          cheque_id?: number | null
          concepto: string
          created_at?: string
          created_by?: string | null
          cuenta_id?: number | null
          deuda_cuota_id?: number | null
          fecha: string
          id?: never
          importe: number
          medio: Database["public"]["Enums"]["medio_pago"]
          moneda?: Database["public"]["Enums"]["moneda"]
          proveedor_id?: number | null
          tc?: number | null
        }
        Update: {
          categoria_egreso_id?: number
          cheque_id?: number | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          cuenta_id?: number | null
          deuda_cuota_id?: number | null
          fecha?: string
          id?: never
          importe?: number
          medio?: Database["public"]["Enums"]["medio_pago"]
          moneda?: Database["public"]["Enums"]["moneda"]
          proveedor_id?: number | null
          tc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "egresos_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "v_categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "v_cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_deuda_cuota_id_fkey"
            columns: ["deuda_cuota_id"]
            isOneToOne: false
            referencedRelation: "deuda_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_deuda_cuota_id_fkey"
            columns: ["deuda_cuota_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ingreso_vencimientos: {
        Row: {
          cuenta_prevista_id: number | null
          fecha_vencimiento: string
          id: number
          importe: number
          ingreso_id: number
          medio_previsto: string | null
          numero: number
        }
        Insert: {
          cuenta_prevista_id?: number | null
          fecha_vencimiento: string
          id?: never
          importe: number
          ingreso_id: number
          medio_previsto?: string | null
          numero: number
        }
        Update: {
          cuenta_prevista_id?: number | null
          fecha_vencimiento?: string
          id?: never
          importe?: number
          ingreso_id?: number
          medio_previsto?: string | null
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingreso_vencimientos_cuenta_prevista_id_fkey"
            columns: ["cuenta_prevista_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_cuenta_prevista_id_fkey"
            columns: ["cuenta_prevista_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_ingreso_id_fkey"
            columns: ["ingreso_id"]
            isOneToOne: false
            referencedRelation: "ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_ingreso_id_fkey"
            columns: ["ingreso_id"]
            isOneToOne: false
            referencedRelation: "v_ingresos"
            referencedColumns: ["id"]
          },
        ]
      }
      ingresos: {
        Row: {
          cliente_id: number
          comprobante: string | null
          created_at: string
          created_by: string | null
          descripcion: string
          fecha_factura: string
          id: number
          importe_total: number
          moneda: Database["public"]["Enums"]["moneda"]
          tipo_ingreso_id: number
        }
        Insert: {
          cliente_id: number
          comprobante?: string | null
          created_at?: string
          created_by?: string | null
          descripcion: string
          fecha_factura: string
          id?: never
          importe_total: number
          moneda?: Database["public"]["Enums"]["moneda"]
          tipo_ingreso_id: number
        }
        Update: {
          cliente_id?: number
          comprobante?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string
          fecha_factura?: string
          id?: never
          importe_total?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          tipo_ingreso_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_tipo_ingreso_id_fkey"
            columns: ["tipo_ingreso_id"]
            isOneToOne: false
            referencedRelation: "tipos_ingreso"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          cuit: string | null
          id: number
          razon_social: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cuit?: string | null
          id?: never
          razon_social: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cuit?: string | null
          id?: never
          razon_social?: string
        }
        Relationships: []
      }
      tipos_ingreso: {
        Row: {
          activo: boolean
          created_at: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      transferencias: {
        Row: {
          concepto: string | null
          created_at: string
          created_by: string | null
          cuenta_destino_id: number
          cuenta_origen_id: number
          fecha: string
          id: number
          importe_destino: number
          importe_origen: number
        }
        Insert: {
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_destino_id: number
          cuenta_origen_id: number
          fecha: string
          id?: never
          importe_destino: number
          importe_origen: number
        }
        Update: {
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_destino_id?: number
          cuenta_origen_id?: number
          fecha?: string
          id?: never
          importe_destino?: number
          importe_origen?: number
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_autorizados: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_categorias_egreso: {
        Row: {
          activa: boolean | null
          color: string | null
          created_at: string | null
          descripcion: string | null
          icono: string | null
          id: number | null
          nombre: string | null
          ops_anio: number | null
          ops_mes: number | null
          subtitulo: string | null
          total_anio: number | null
          total_mes: number | null
          ultimo_egreso: string | null
        }
        Relationships: []
      }
      v_cheques: {
        Row: {
          banco_emisor: string | null
          cliente: string | null
          cliente_cuit: string | null
          cliente_id: number | null
          cobro_id: number | null
          created_at: string | null
          created_by: string | null
          cuenta_deposito: string | null
          cuenta_deposito_id: number | null
          dias_para_pago: number | null
          egreso_id: number | null
          estado: Database["public"]["Enums"]["estado_cheque"] | null
          fecha_deposito: string | null
          fecha_emision: string | null
          fecha_endoso: string | null
          fecha_pago: string | null
          fecha_recepcion: string | null
          fecha_rechazo: string | null
          id: number | null
          importe: number | null
          ingreso_vencimiento_id: number | null
          librador: string | null
          librador_cuit: string | null
          motivo_endoso: string | null
          motivo_rechazo: string | null
          notas: string | null
          numero: string | null
          proveedor_endoso: string | null
          proveedor_endoso_id: number | null
          tipo: Database["public"]["Enums"]["tipo_cheque"] | null
          tipo_endoso: Database["public"]["Enums"]["tipo_endoso"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cheques_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_cuenta_deposito_id_fkey"
            columns: ["cuenta_deposito_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_cuenta_deposito_id_fkey"
            columns: ["cuenta_deposito_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_proveedor_endoso_id_fkey"
            columns: ["proveedor_endoso_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_ingreso_vencimiento_id_fkey"
            columns: ["ingreso_vencimiento_id"]
            isOneToOne: false
            referencedRelation: "ingreso_vencimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_ingreso_vencimiento_id_fkey"
            columns: ["ingreso_vencimiento_id"]
            isOneToOne: false
            referencedRelation: "v_ingreso_vencimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cotizacion_actual: {
        Row: {
          actualizado_at: string | null
          compra: number | null
          fecha: string | null
          fuente: string | null
          tipo: string | null
          venta: number | null
        }
        Relationships: []
      }
      v_cuentas_saldo: {
        Row: {
          activa: boolean | null
          alias: string | null
          cbu: string | null
          created_at: string | null
          entidad: string | null
          etiqueta: string | null
          fecha_saldo_inicial: string | null
          id: number | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          nombre: string | null
          numero: string | null
          saldo: number | null
          saldo_ars: number | null
          saldo_inicial: number | null
          tipo: Database["public"]["Enums"]["tipo_cuenta"] | null
          ultimo_mov_concepto: string | null
          ultimo_mov_fecha: string | null
          ultimo_mov_importe: number | null
        }
        Relationships: []
      }
      v_deuda_cuotas: {
        Row: {
          cuenta: string | null
          deuda_id: number | null
          estado: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: number | null
          importe: number | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          numero: number | null
          pagado: number | null
          proveedor_id: number | null
          saldo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "v_deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_deudas: {
        Row: {
          categoria: string | null
          categoria_color: string | null
          categoria_egreso_id: number | null
          concepto: string | null
          created_at: string | null
          created_by: string | null
          cuotas_pagadas: number | null
          cuotas_total: number | null
          estado: string | null
          fecha_alta: string | null
          forma_pago: Database["public"]["Enums"]["forma_pago_deuda"] | null
          id: number | null
          importe_total: number | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          notas: string | null
          pagado: number | null
          proveedor: string | null
          proveedor_cuit: string | null
          proveedor_id: number | null
          proxima_cuota: number | null
          proxima_cuota_saldo: number | null
          proximo_vencimiento: string | null
          referencia: string | null
          saldo: number | null
          tc_referencia: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deudas_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "v_categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_egresos: {
        Row: {
          categoria: string | null
          categoria_color: string | null
          categoria_egreso_id: number | null
          cheque_banco: string | null
          cheque_id: number | null
          cheque_numero: string | null
          concepto: string | null
          created_at: string | null
          created_by: string | null
          cuenta: string | null
          cuenta_id: number | null
          cuota_numero: number | null
          deuda_concepto: string | null
          deuda_cuota_id: number | null
          deuda_id: number | null
          fecha: string | null
          id: number | null
          importe: number | null
          importe_ars: number | null
          medio: Database["public"]["Enums"]["medio_pago"] | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          proveedor: string | null
          proveedor_id: number | null
          tc: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deuda_cuotas_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "v_deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_categoria_egreso_id_fkey"
            columns: ["categoria_egreso_id"]
            isOneToOne: false
            referencedRelation: "v_categorias_egreso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: true
            referencedRelation: "v_cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_deuda_cuota_id_fkey"
            columns: ["deuda_cuota_id"]
            isOneToOne: false
            referencedRelation: "deuda_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_deuda_cuota_id_fkey"
            columns: ["deuda_cuota_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ingreso_vencimientos: {
        Row: {
          cliente_id: number | null
          cobrado: number | null
          cuenta_prevista_id: number | null
          estado: string | null
          fecha_vencimiento: string | null
          id: number | null
          importe: number | null
          ingreso_id: number | null
          medio_previsto: string | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          numero: number | null
          saldo: number | null
          ultima_fecha_cobro: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingreso_vencimientos_cuenta_prevista_id_fkey"
            columns: ["cuenta_prevista_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_cuenta_prevista_id_fkey"
            columns: ["cuenta_prevista_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_ingreso_id_fkey"
            columns: ["ingreso_id"]
            isOneToOne: false
            referencedRelation: "ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingreso_vencimientos_ingreso_id_fkey"
            columns: ["ingreso_id"]
            isOneToOne: false
            referencedRelation: "v_ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ingresos: {
        Row: {
          cliente: string | null
          cliente_cuit: string | null
          cliente_id: number | null
          cobrado: number | null
          comprobante: string | null
          created_at: string | null
          created_by: string | null
          cuotas: number | null
          descripcion: string | null
          estado: string | null
          fecha_factura: string | null
          id: number | null
          importe_total: number | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          proxima_cuota: number | null
          proximo_saldo: number | null
          proximo_vencimiento: string | null
          saldo: number | null
          tipo_ingreso: string | null
          tipo_ingreso_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_tipo_ingreso_id_fkey"
            columns: ["tipo_ingreso_id"]
            isOneToOne: false
            referencedRelation: "tipos_ingreso"
            referencedColumns: ["id"]
          },
        ]
      }
      v_movimientos: {
        Row: {
          concepto: string | null
          created_at: string | null
          cuenta_id: number | null
          fecha: string | null
          importe: number | null
          origen: string | null
          origen_id: number | null
          tipo: string | null
        }
        Relationships: []
      }
      v_transferencias: {
        Row: {
          concepto: string | null
          created_at: string | null
          created_by: string | null
          cuenta_destino: string | null
          cuenta_destino_id: number | null
          cuenta_origen: string | null
          cuenta_origen_id: number | null
          fecha: string | null
          id: number | null
          importe_destino: number | null
          importe_origen: number | null
          moneda_destino: Database["public"]["Enums"]["moneda"] | null
          moneda_origen: Database["public"]["Enums"]["moneda"] | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cuentas_saldo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_deuda: {
        Args: {
          p_categoria_egreso_id?: number
          p_concepto: string
          p_cuotas: Json
          p_fecha_alta?: string
          p_id: number
          p_importe_total: number
          p_moneda: Database["public"]["Enums"]["moneda"]
          p_notas?: string
          p_proveedor_id: number
          p_referencia?: string
          p_tc_referencia?: number
        }
        Returns: undefined
      }
      actualizar_deuda_cuota: {
        Args: { p_cuota_id: number; p_fecha_vencimiento: string; p_importe: number }
        Returns: undefined
      }
      actualizar_ingreso: {
        Args: {
          p_cliente_id: number
          p_comprobante?: string
          p_descripcion: string
          p_fecha_factura: string
          p_id: number
          p_importe_total: number
          p_moneda: Database["public"]["Enums"]["moneda"]
          p_tipo_ingreso_id: number
          p_vencimientos: Json
        }
        Returns: undefined
      }
      convertir: {
        Args: {
          p_a: Database["public"]["Enums"]["moneda"]
          p_de: Database["public"]["Enums"]["moneda"]
          p_importe: number
          p_tc: number
        }
        Returns: number
      }
      crear_deuda: {
        Args: {
          p_categoria_egreso_id?: number
          p_concepto: string
          p_cuotas: Json
          p_fecha_alta?: string
          p_importe_total: number
          p_moneda: Database["public"]["Enums"]["moneda"]
          p_notas?: string
          p_proveedor_id: number
          p_referencia?: string
          p_tc_referencia?: number
        }
        Returns: number
      }
      crear_ingreso: {
        Args: {
          p_cliente_id: number
          p_comprobante?: string
          p_descripcion: string
          p_fecha_factura: string
          p_importe_total: number
          p_moneda: Database["public"]["Enums"]["moneda"]
          p_tipo_ingreso_id: number
          p_vencimientos: Json
        }
        Returns: number
      }
      depositar_cheque: {
        Args: { p_cheque_id: number; p_cuenta_id: number; p_fecha: string }
        Returns: undefined
      }
      eliminar_cheque: { Args: { p_cheque_id: number }; Returns: undefined }
      eliminar_deuda_cuota: { Args: { p_cuota_id: number }; Returns: undefined }
      endosar_cheque: {
        Args: {
          p_categoria_egreso_id: number
          p_cheque_id: number
          p_deuda_cuota_id?: number
          p_fecha: string
          p_motivo?: string
          p_proveedor_id: number
          p_tc?: number
          p_tipo_endoso?: Database["public"]["Enums"]["tipo_endoso"]
        }
        Returns: number
      }
      es_autorizado: { Args: never; Returns: boolean }
      fn_cashflow: {
        Args: { p_desde: string; p_hasta: string; p_periodo?: string }
        Returns: {
          egresos: number
          ingresos: number
          neto: number
          periodo_fin: string
          periodo_inicio: string
          proyectado: boolean
          saldo_final: number
          saldo_inicial: number
        }[]
      }
      fn_cashflow_detalle: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          ars: number
          concepto: string
          detalle: string
          fecha: string
          origen: string
          proyectado: boolean
        }[]
      }
      fn_cashflow_saldo_base: {
        Args: { p_inicio: string }
        Returns: {
          ars: number
          concepto: string
          orden: number
        }[]
      }
      hoy: { Args: never; Returns: string }
      rechazar_cheque: {
        Args: { p_cheque_id: number; p_fecha: string; p_motivo?: string }
        Returns: undefined
      }
      registrar_cobro: {
        Args: {
          p_cheque?: Json
          p_concepto?: string
          p_cuenta_id?: number
          p_fecha: string
          p_importe: number
          p_medio: Database["public"]["Enums"]["medio_cobro"]
          p_tc?: number
          p_vencimiento_id: number
        }
        Returns: number
      }
      registrar_cobro_a_cuenta: {
        Args: {
          p_cuenta_id: number
          p_fecha: string
          p_importe: number
          p_ingreso_id: number
          p_medio: Database["public"]["Enums"]["medio_cobro"]
          p_tc?: number
        }
        Returns: number
      }
      registrar_pago_deuda: {
        Args: {
          p_categoria_egreso_id: number
          p_cuenta_id: number
          p_deuda_id: number
          p_fecha: string
          p_importe: number
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_tc?: number
        }
        Returns: number
      }
      tc_actual: { Args: never; Returns: number }
    }
    Enums: {
      estado_cheque: "en_cartera" | "endosado" | "depositado" | "rechazado"
      forma_pago_deuda: "unico" | "cuotas"
      medio_cobro: "transferencia" | "efectivo" | "deposito" | "cheque"
      medio_pago:
        | "transferencia"
        | "debito_automatico"
        | "efectivo"
        | "tarjeta"
        | "cheque_endosado"
      moneda: "ARS" | "USD"
      tipo_cheque: "echeq" | "fisico"
      tipo_cuenta:
        | "cuenta_corriente"
        | "caja_ahorro"
        | "efectivo"
        | "billetera_digital"
        | "custodia"
      tipo_endoso: "nominativo" | "garantia"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_cheque: ["en_cartera", "endosado", "depositado", "rechazado"],
      forma_pago_deuda: ["unico", "cuotas"],
      medio_cobro: ["transferencia", "efectivo", "deposito", "cheque"],
      medio_pago: [
        "transferencia",
        "debito_automatico",
        "efectivo",
        "tarjeta",
        "cheque_endosado",
      ],
      moneda: ["ARS", "USD"],
      tipo_cheque: ["echeq", "fisico"],
      tipo_cuenta: [
        "cuenta_corriente",
        "caja_ahorro",
        "efectivo",
        "billetera_digital",
        "custodia",
      ],
      tipo_endoso: ["nominativo", "garantia"],
    },
  },
} as const
