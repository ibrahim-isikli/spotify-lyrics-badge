import { getLastFmNowPlaying } from "./lastfm";
import { getNowPlaying } from "./spotify";

/**
 * Provider-agnostic shape the render/lyrics layers work with. Last.fm's
 * recent-tracks endpoint has no playback-position data, so progressMs and
 * durationMs are optional — only the Spotify provider ever sets them.
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
    return getLastFmNowPlaying();
  }

  if (process.env.SPOTIFY_REFRESH_TOKEN) {
    return getNowPlaying();
  }

  return null;
}
