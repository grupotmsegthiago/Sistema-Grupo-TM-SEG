import type { Express, Request, Response } from 'express';

/** Dev local. Em produção o rewrite aponta para api/live-track.ts (função leve). */
export function registerLiveTrackRoutes(app: Express): void {
  const dispatch = async (req: Request, res: Response) => {
    const { handleLiveTrackHttp } = await import('../lib/liveTrack/httpHandler');
    await handleLiveTrackHttp(req, res);
  };
  app.get('/api/live-track', (req, res) => { void dispatch(req, res); });
  app.post('/api/live-track', (req, res) => { void dispatch(req, res); });
}
