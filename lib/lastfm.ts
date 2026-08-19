import type { TrackInfo } from "./provider";

const LASTFM_ENDPOINT = "http://ws.audioscrobbler.com/2.0/";

interface LastFmImage {
  size: string;
  "#text": string;
}

interface LastFmTrack {
  name: string;
  artist?: { "#text"?: string };
  image?: LastFmImage[];
  "@attr"?: { nowplaying?: string };
}

interface LastFmRecentTracksResponse {
  recenttracks?: {
    track?: LastFmTrack[];
  };
}

/**
 * Last.fm lists image sizes small-to-large in an unordered-looking array;
 * prefer the largest available so the album art doesn't look pixelated.
 */
function pickAlbumImageUrl(images: LastFmImage[] | undefined): string {
  if (!images || images.length === 0) return "";

  for (const size of ["extralarge", "large", "medium", "small"]) {
    const match = images.find((image) => image.size === size)?.["#text"];
    if (match) return match;
  }

  return images[images.length - 1]?.["#text"] ?? "";
}

/**
 * Reads the most recent scrobble for LASTFM_USER. This is the "Spotify Free"
 * bridge: Last.fm's Spotify connection scrobbles whatever a user plays, so
 * this needs only a free Last.fm API key — no OAuth, no Premium requirement.
 * Returns the currently-playing track when Last.fm reports one live
 * (`@attr.nowplaying === "true"`), otherwise the last scrobbled track marked
 * as not playing, matching the Spotify provider's recently-played fallback.
 * Returns null when the user has no scrobble history at all.
 */
export async function getLastFmNowPlaying(): Promise<TrackInfo | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!apiKey || !user) {
    return null;
  }

  const params = new URLSearchParams({
    method: "user.getrecenttracks",
    user,
    api_key: apiKey,
    format: "json",
    limit: "1",
  });

  const response = await fetch(`${LASTFM_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Last.fm recenttracks request failed (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as LastFmRecentTracksResponse;
  const track = data.recenttracks?.track?.[0];
  if (!track) {
    return null;
  }

  return {
    title: track.name,
    artist: track.artist?.["#text"] ?? "",
    albumImageUrl: pickAlbumImageUrl(track.image),
    isPlaying: track["@attr"]?.nowplaying === "true",
  };
}
