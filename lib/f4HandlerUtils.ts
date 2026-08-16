import type { F4ApiResult } from './f4ApiOperations.js';

export type F4Request = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type F4Response = {
  status: (status: number) => F4Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export function f4QueryValue(req: F4Request, key: string): string {
  const raw = req.query?.[key];
  return Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
}

export function sendF4Result(res: F4Response, result: F4ApiResult): void {
  res.status(result.status).json(result.body);
}

export function sendF4MethodNotAllowed(res: F4Response, allow: string): void {
  res.setHeader('Allow', allow);
  res.status(405).json({ error: 'Método não permitido' });
}
