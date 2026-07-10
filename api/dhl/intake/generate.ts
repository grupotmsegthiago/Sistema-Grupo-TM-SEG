import { proxyToExpress, expressProxyConfig } from "../../proxyExpress";

/** Produção: usa o handler completo do Express (WhatsApp, e-mail, dedup, auditoria). */
export default proxyToExpress;
export const config = expressProxyConfig;
