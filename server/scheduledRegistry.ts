export type ScheduledTick = () => Promise<void>;

const ticks: ScheduledTick[] = [];

export function registerScheduledTick(fn: ScheduledTick): void {
  ticks.push(fn);
}

export function getScheduledTicks(): readonly ScheduledTick[] {
  return ticks;
}
