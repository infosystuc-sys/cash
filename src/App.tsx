import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./Layout";
import { ACCESO_LIBRE, AuthGate } from "./Auth";
import Dashboard from "./Dashboard";
import Ingresos from "./Ingresos";

import Cheques from "./Cheques";
import Deudas from "./Deudas";
import Egresos from "./Egresos";
import CategoriasEgresos from "./CategoriasEgresos";
import Cuentas from "./Cuentas";
import Clientes from "./Clientes";
import Proveedores from "./Proveedores";
import Usuarios from "./Usuarios";
import Configuracion from "./Configuracion";

export default function App() {
  return (
    <AuthGate>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ingresos" element={<Ingresos />} />
            <Route path="/cheques" element={<Cheques />} />
            <Route path="/deudas" element={<Deudas />} />
            <Route path="/egresos" element={<Egresos />} />
            <Route path="/egresos/categorias" element={<CategoriasEgresos />} />
            <Route path="/cuentas" element={<Cuentas />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/proveedores" element={<Proveedores />} />
            {!ACCESO_LIBRE && <Route path="/usuarios" element={<Usuarios />} />}
            <Route path="/configuracion" element={<Configuracion />} />
          </Routes>
        </Layout>
      </Router>
    </AuthGate>
  );
}
