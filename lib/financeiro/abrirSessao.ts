/** Abre a sessão financeira no servidor. A senha não fica no navegador além desta chamada. */
export async function abrirSessaoNoLogin(email: string, senha: string): Promise<void> {
  const resposta = await fetch('/api/auth/sessao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo?.token || !corpo?.sessao) {
    throw new Error('Não foi possível confirmar a sessão. Tente de novo.');
  }
  localStorage.setItem('authToken', String(corpo.token));
  localStorage.setItem('authSessao', String(corpo.sessao));
}
