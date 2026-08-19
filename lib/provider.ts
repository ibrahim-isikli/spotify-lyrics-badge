import { Redis } from "@upstash/redis";
import { getLastFmNowPlaying } from "./lastfm";
import { getNowPlaying } from "./spotify";
import { estimateProgressMs, type KeyValueStore } from "./progress-estimator";

/**
 * Provider-agnostic shape the render/lyrics layers work with. Last.fm's
 * recent-tracks endpoint has no playback-position data, so progressMs and
 * durationMs are optional — Spotify always sets progressMs; for Last.fm it's
 * only set when a KV store is configured to back estimateProgressMs().
 */
export interface TrackInfo {
  title: string;
  artist: string;
  albumImageUrl: string;
  isPlaying: boolean;
  progressMs?: number;
  durationMs?: number;
  songUrl?: string | null;
}

/**
 * Builds a Redis client from whichever env var names the connected store
 * uses — Vercel's Marketplace Redis integrations and the older Vercel KV
 * both land on Upstash under the hood, but have used different env var
 * names over time, so both are checked. Returns null when neither pair is
 * configured, meaning no store is linked to the project.
 */
function createStoreFromEnv(): KeyValueStore | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Picks a playback data source based on which environment variables are
 * configured, so the same badge works for Spotify Free accounts (via the
 * Last.fm scrobble bridge, no OAuth needed) and Spotify accounts using the
 * native API. Last.fm is checked first since it's the simpler, zero-OAuth
 * setup path. Returns null when neither provider is configured, or when the
 * configured one has no track to show — the caller renders the offline
 * fallback card in both cases.
 */
export async function getTrackInfo(): Promise<TrackInfo | null> {
  if (process.env.LASTFM_API_KEY && process.env.LASTFM_USER) {
    const track = await getLastFmNowPlaying();

    if (track && track.progressMs === undefined) {
      const store = createStoreFromEnv();
      if (store) {
        try {
          track.progressMs = await estimateProgressMs(
            store,
            track.title,
            track.artist,
            track.isPlaying
          );
        } catch (error) {
          // A misconfigured or unreachable store should never take the
          // badge down — just fall back to the non-progress lyric line.
          console.error("Progress estimation via KV store failed:", error);
        }
      }
    }

    return track;
  }

  if (process.env.SPOTIFY_REFRESH_TOKEN) {
    return getNowPlaying();
  }

  return null;
}
