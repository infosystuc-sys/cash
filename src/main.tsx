import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { configFaltante } from './lib/supabase';
import './index.css';

function ConfigFaltante() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-md bg-surface-container-lowest border border-error/20 rounded-2xl shadow-xl p-8 space-y-3">
        <h1 className="text-lg font-bold text-error">Falta configuración de Supabase</h1>
        <p className="text-xs text-on-surface-variant">
          No están definidas estas variables de entorno al momento del build:
        </p>
        <ul className="text-xs font-mono font-bold text-primary list-disc pl-5">
          {configFaltante.map((v) => <li key={v}>{v}</li>)}
        </ul>
        <p className="text-xs text-on-surface-variant">
          En Vercel: Settings → Environment Variables, cargarlas y luego hacer <strong>Redeploy</strong>.
          En local: completar <code>.env.local</code>.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(configFaltante.length ? <ConfigFaltante /> : <App />);
