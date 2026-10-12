import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createLogger } from "../../lib/logger/index.js";

/**
 * Background music for the dialer dock: SoundCloud search and stream URLs
 * through the "SoundCloud API" on RapidAPI (soundcloud-api3), the same
 * provider the CbamReady power dialer used. Nothing is stored: the queue
 * lives in the browser like the other dock preferences.
 */
const router = Router();
router.use(authMiddleware);
const log = createLogger("music");

const HOST = "soundcloud-api3.p.rapidapi.com";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number | null;
  /** soundcloud:tracks:<id>/<format>; swapped for a playable URL by /stream. */
  streamId: string;
  trackAuthorization: string | null;
}

class NoKeyError extends Error {}

async function rapid(path: string): Promise<any> {
  const key = process.env.RAPID_API_KEY;
  if (!key) throw new NoKeyError("Music is off: set RAPID_API_KEY (a RapidAPI key subscribed to soundcloud-api3).");
  const res = await fetch(`https://${HOST}${path}`, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST } });
  if (!res.ok) throw new Error(`SoundCloud answered ${res.status}${res.status === 403 ? ": the RapidAPI key is not subscribed to soundcloud-api3" : ""}`);
  return res.json();
}

/** SoundCloud titles are usually "Artist - Track". */
function splitTitle(title: string, fallbackArtist: string): { artist: string; title: string } {
  const parts = title.split(" - ");
  return parts.length >= 2 ? { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() } : { artist: fallbackArtist, title: title.trim() };
}

/** A direct MP3 plays everywhere; HLS needs hls.js, so it is the fallback. */
function pickStream(streams: Array<{ streamId?: string }> = []): string | null {
  const ids = streams.map((s) => s.streamId).filter((s): s is string => !!s);
  return ids.find((s) => !s.includes("hls")) ?? ids[0] ?? null;
}

function sendError(res: Response, err: any, what: string) {
  if (err instanceof NoKeyError) return res.status(503).json({ error: err.message });
  log.error(`${what} failed:`, err.message);
  res.status(502).json({ error: `${what} failed: ${err.message}` });
}

/** GET /api/music/search?q=lofi */
router.get("/search", async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ tracks: [] });
  try {
    const data = await rapid(`/v2/track/search?query=${encodeURIComponent(q)}&limit=15`);
    const tracks: MusicTrack[] = (data?.data ?? []).slice(0, 15)
      .map((t: any) => {
        const streamId = pickStream(t.tracks);
        if (!streamId) return null;
        const { artist, title } = splitTitle(String(t.title ?? ""), t.user?.username ?? t.artist ?? "SoundCloud");
        return {
          id: String(t.id),
          title,
          artist,
          imageUrl: t.artworkUrl ? String(t.artworkUrl).replace("-large", "-t200x200") : null,
          durationMs: typeof t.durationMs === "number" ? t.durationMs : null,
          streamId,
          trackAuthorization: t.trackAuthorization ?? null,
        };
      })
      .filter(Boolean);
    res.json({ tracks });
  } catch (err: any) {
    sendError(res, err, "Music search");
  }
});

/** GET /api/music/stream?streamId=...&auth=... -> { url } (short-lived). */
router.get("/stream", async (req: AuthRequest, res: Response) => {
  const streamId = String(req.query.streamId ?? "");
  if (!/^soundcloud:tracks:\d+/.test(streamId)) return res.status(400).json({ error: "streamId is not a SoundCloud stream" });
  try {
    let auth = String(req.query.auth ?? "");
    if (!auth) {
      const id = streamId.match(/^soundcloud:tracks:(\d+)/)![1];
      const track = await rapid(`/v2/track/get?id=${id}`);
      auth = track?.data?.trackAuthorization ?? track?.trackAuthorization ?? "";
    }
    if (!auth) return res.status(502).json({ error: "SoundCloud gave no authorization for this track" });
    const data = await rapid(`/v2/stream/get?streamId=${encodeURIComponent(streamId)}&trackAuthorization=${encodeURIComponent(auth)}`);
    const url = data?.data?.streamUrl;
    if (!url) return res.status(502).json({ error: "This track has no playable stream" });
    res.json({ url, hls: String(url).includes(".m3u8") });
  } catch (err: any) {
    sendError(res, err, "Music stream");
  }
});

export default router;
