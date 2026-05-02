export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken') || '';
  return fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(options.headers || {})
    }
  });
};
