import { proxyToExpress, expressProxyConfig } from "../../../proxyExpress";

export default proxyToExpress;
export const config = { ...expressProxyConfig, maxDuration: 60 };
