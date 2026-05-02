import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados ficam "stale" rapidamente para que ações do usuário disparem refetch
      staleTime: 10 * 1000,
      gcTime: 5 * 60 * 1000,
      // Quando o usuário volta para a aba/janela, busca dados frescos automaticamente
      refetchOnWindowFocus: true,
      // Quando reconecta wifi/internet, busca dados frescos
      refetchOnReconnect: true,
      // Quando o componente monta, sempre busca dados frescos
      refetchOnMount: true,
      retry: 1,
    },
  },
});
