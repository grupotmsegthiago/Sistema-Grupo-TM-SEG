// Registra o loader de assets (asset-loader.mjs) na cadeia de hooks do Node.
// Usado via `node --import ./scripts/test-loaders/register.mjs`. Precisa ser um
// módulo separado porque, com --import, os hooks só entram na cadeia quando
// module.register() é chamado explicitamente (apenas exportar resolve/load não
// basta — isso só vale para o antigo --loader).
import { register } from 'node:module';

register('./asset-loader.mjs', import.meta.url);
