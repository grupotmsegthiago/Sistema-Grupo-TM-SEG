import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados permanecem "frescos" por 1 min: evita refetch redundante ao
      // navegar entre telas. O Realtime global (RealtimeProvider) continua
      // invalidando os caches em tempo real quando algo muda no banco.
      staleTime: 60 * 1000,
      // Cache sobrevive mais tempo em memória para reabrir telas instantaneamente.
      gcTime: 10 * 60 * 1000,
      // Não recarregar tudo só por trocar de aba/janela (causava lentidão).
      refetchOnWindowFocus: false,
      // Quando reconecta wifi/internet, busca dados frescos
      refetchOnReconnect: true,
      // Ao montar, respeita o staleTime acima (só busca se os dados estiverem velhos).
      refetchOnMount: true,
      retry: 1,
    },
  },
});
