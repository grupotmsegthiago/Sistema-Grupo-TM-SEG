export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken') || '';
  let userId = '';
  let role = '';
  let permissions = '[]';
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    userId = user?.id != null ? String(user.id) : '';
    role = String(user?.role || '');
    permissions = JSON.stringify(Array.isArray(user?.permissions) ? user.permissions : []);
  } catch {
    // mantém vazio — servidor tenta só via Supabase
  }

  return fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'x-tmseg-user-id': userId,
      'x-tmseg-role': role,
      'x-tmseg-permissions': permissions,
      ...(options.headers || {}),
    },
  });
};
