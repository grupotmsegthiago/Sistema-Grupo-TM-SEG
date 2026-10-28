import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIMITE_LOGO_BYTES,
  contentTypeLogo,
  pendenciaMarcaComercial,
  validarArquivoLogo,
  validarWebsiteCliente,
} from '../lib/clienteMarca.ts';

test('logo aceita PNG e SVG até 2 MB e recusa o resto', () => {
  assert.equal(validarArquivoLogo({ name: 'marca.png', type: 'image/png', size: 1200 }), null);
  assert.equal(validarArquivoLogo({ name: 'marca.SVG', type: 'image/svg+xml', size: 800 }), null);
  assert.equal(validarArquivoLogo({ name: 'marca.svg', type: '', size: 800 }), null);
  assert.equal(validarArquivoLogo({ name: 'marca.png', type: 'application/octet-stream', size: LIMITE_LOGO_BYTES }), null);
  assert.match(validarArquivoLogo({ name: 'marca.jpg', type: 'image/jpeg', size: 800 }) || '', /PNG ou SVG/);
  assert.match(validarArquivoLogo({ name: 'marca.png', type: 'image/jpeg', size: 800 }) || '', /PNG ou SVG/);
  assert.match(validarArquivoLogo({ name: 'marca.png', type: 'image/png', size: LIMITE_LOGO_BYTES + 1 }) || '', /2 MB/);
  assert.match(validarArquivoLogo({ name: 'marca.png', type: 'image/png', size: 0 }) || '', /vazio/);
  assert.equal(contentTypeLogo({ name: 'a.svg', type: '', size: 10 }), 'image/svg+xml');
  assert.equal(contentTypeLogo({ name: 'a.png', type: 'image/png', size: 10 }), 'image/png');
});

test('site do comercial exige http ou https', () => {
  assert.equal(validarWebsiteCliente('https://cliente.com.br'), null);
  assert.equal(validarWebsiteCliente('http://cliente.com.br/marca'), null);
  assert.match(validarWebsiteCliente('') || '', /http/);
  assert.match(validarWebsiteCliente('cliente.com.br') || '', /http/);
  assert.match(validarWebsiteCliente('javascript:alert(1)') || '', /http/);
});

test('marca obrigatória só quando o chamador pede; arquivo pendente substitui a URL', () => {
  assert.equal(
    pendenciaMarcaComercial({ website: 'https://cliente.com.br', logoUrl: 'https://cdn/logo.png', temArquivo: false }),
    null,
  );
  assert.equal(
    pendenciaMarcaComercial({ website: 'https://cliente.com.br', logoUrl: '', temArquivo: true }),
    null,
  );
  assert.match(
    pendenciaMarcaComercial({ website: '', logoUrl: '', temArquivo: false }) || '',
    /site/,
  );
  assert.match(
    pendenciaMarcaComercial({ website: 'https://cliente.com.br', logoUrl: '  ', temArquivo: false }) || '',
    /logotipo/,
  );
});

test('ClientForm aplica a trava no comercial e no upload, sem NOT NULL', () => {
  const form = readFileSync('components/ClientForm.tsx', 'utf8');
  assert.match(form, /pendenciaMarcaComercial/);
  assert.match(form, /validarArquivoLogo/);
  assert.match(form, /perfilEhComercialRole\(currentUser\?\.role\)/);
  assert.match(form, /image\/png,image\/svg\+xml/);
  assert.match(form, /mission-evidence/);
  assert.doesNotMatch(form, /logo_url TEXT NOT NULL|website VARCHAR\(255\) NOT NULL/);
});
