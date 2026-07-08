export class TimeoutError extends Error {
  constructor(message = 'Operação excedeu o tempo limite') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Rejeita se a promise não resolver dentro de `ms` milissegundos. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
