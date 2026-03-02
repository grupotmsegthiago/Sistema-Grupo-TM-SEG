import { createRoot } from "react-dom/client";
import App from "../App";

try {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Elemento #root não encontrado no DOM.");
  }
  const root = createRoot(container);
  root.render(<App />);
} catch (err: any) {
  const msg = (err && err.message ? err.message : String(err)) + '\n' + (err && err.stack ? err.stack : '');
  if (typeof (window as any).showIosError === 'function') {
    (window as any).showIosError('Falha na Inicialização do App', msg);
  } else {
    document.body.innerHTML = '<div style="padding:24px;font-family:monospace;color:red;"><h2>Erro de Inicialização</h2><pre>' + msg + '</pre></div>';
  }
}
