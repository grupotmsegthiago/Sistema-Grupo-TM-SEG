export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken') || '';
  let userId = '';
  let role = '';
  let userName = '';
  let permissions = '[]';
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    userId = user?.id != null ? String(user.id) : '';
    role = String(user?.role || '');
    userName = String(user?.name || '');
    permissions = JSON.stringify(Array.isArray(user?.permissions) ? user.permissions : []);
  } catch {
    // mantém vazio — servidor tenta só via Supabase
  }

  return fetch(url, {
    cache: 'no-store',
    ...options,
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'x-tmseg-user-id': userId,
      'x-tmseg-role': role,
      'x-tmseg-user-name': userName,
      'x-tmseg-permissions': permissions,
      ...(options.headers || {}),
    },
  });
};
