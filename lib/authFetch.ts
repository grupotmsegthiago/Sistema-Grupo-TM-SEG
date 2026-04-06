export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken') || '';
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
};
