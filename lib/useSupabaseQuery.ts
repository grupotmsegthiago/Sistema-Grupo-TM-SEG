import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function useSupabaseQuery<T = any>(
  key: string[],
  table: string,
  options?: {
    select?: string;
    filters?: Array<{ method: string; args: any[] }>;
    order?: { column: string; ascending?: boolean };
    single?: boolean;
    enabled?: boolean;
  }
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      let query = supabase.from(table).select(options?.select || '*');

      if (options?.filters) {
        for (const f of options.filters) {
          query = (query as any)[f.method](...f.args);
        }
      }

      if (options?.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
      }

      if (options?.single) {
        const { data, error } = await query.single();
        if (error) throw error;
        return data as T;
      }

      const all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        if (data) all.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return all as T;
    },
    enabled: options?.enabled !== false,
  });
}

export function useSupabaseUpdate(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { error } = await supabase.from(table).update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useSupabaseInsert(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, any> | Record<string, any>[]) => {
      const { error } = await supabase.from(table).insert(Array.isArray(data) ? data : [data]);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useSupabaseDelete(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
