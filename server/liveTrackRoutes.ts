import type { Express, Request, Response } from 'express';
import { handleLiveTrackHttp } from '../lib/liveTrack/httpHandler';

/** Em produção o rewrite /api/(.*) cai em api/index → Express. */
export function registerLiveTrackRoutes(app: Express): void {
  const dispatch = (req: Request, res: Response) => {
    void handleLiveTrackHttp(req, res);
  };
  app.get('/api/live-track', dispatch);
  app.post('/api/live-track', dispatch);
}
