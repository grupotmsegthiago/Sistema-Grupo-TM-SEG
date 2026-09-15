import { handleLiveTrackHttp } from '../lib/liveTrack/httpHandler.js';

export default async function handler(req: any, res: any) {
  await handleLiveTrackHttp(req, res);
}

export const config = {
  maxDuration: 30,
};
