const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz';
const NUMEROS = '23456789';
/** Sem cifrão: senha em texto com $ é recusada no login (parece hash). */
const ESPECIAIS = '@#%&*';
const TODAS = MAIUSCULAS + MINUSCULAS + NUMEROS + ESPECIAIS;

function indice(limite: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % limite;
}

function letra(alfabeto: string): string {
  return alfabeto[indice(alfabeto.length)];
}

export function mensagemAcessoSistema(credenciais: {
  name: string;
  email: string;
  password: string;
  origem: string;
}): string {
  return `🔐 *GRUPO TMSEG — Acesso ao Sistema*\n\nOlá *${credenciais.name}*,\n\nSeu acesso ao sistema foi criado com sucesso.\n\n📧 *Login:* ${credenciais.email}\n🔑 *Senha:* ${credenciais.password}\n🌐 *Link:* ${credenciais.origem}\n\n⚠️ No primeiro acesso, você deverá trocar sua senha por segurança.\n\nEm caso de dúvidas, entre em contato com o suporte.\n\n_Grupo TMSEG — Gestão Operacional_`;
}

/** Senha temporária com maiúscula, minúscula, número e símbolo. */
export function generateTemporaryPassword(length = 10): string {
  const tamanho = Math.max(4, length);
  const senha = [
    letra(MAIUSCULAS),
    letra(MINUSCULAS),
    letra(NUMEROS),
    letra(ESPECIAIS),
  ];
  for (let i = senha.length; i < tamanho; i += 1) senha.push(letra(TODAS));
  for (let i = senha.length - 1; i > 0; i -= 1) {
    const j = indice(i + 1);
    const atual = senha[i];
    senha[i] = senha[j];
    senha[j] = atual;
  }
  return senha.join('');
}
