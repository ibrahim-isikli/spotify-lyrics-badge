const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_ENDPOINT =
  "https://api.spotify.com/v1/me/player/currently-playing";
const RECENTLY_PLAYED_ENDPOINT =
  "https://api.spotify.com/v1/me/player/recently-played?limit=1";

export interface NowPlaying {
  isPlaying: boolean;
  title: string;
  artist: string;
  albumImageUrl: string;
  progressMs: number;
  durationMs: number;
  songUrl: string | null;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyTrackItem {
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album?: {
    images?: { url: string }[];
  };
  external_urls?: {
    spotify?: string;
  };
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Exchanges the long-lived refresh token for a short-lived access token.
 * Spotify access tokens expire quickly, so this runs on every invocation
 * rather than being cached across (stateless) serverless invocations.
 */
export async function getAccessToken(): Promise<string> {
  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = getRequiredEnv("SPOTIFY_REFRESH_TOKEN");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to refresh Spotify access token (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  return data.access_token;
}

function mapTrackItem(
  item: SpotifyTrackItem,
  isPlaying: boolean,
  progressMs: number
): NowPlaying {
  return {
    isPlaying,
    title: item.name,
    artist: item.artists.map((artist) => artist.name).join(", "),
    albumImageUrl: item.album?.images?.[0]?.url ?? "",
    progressMs,
    durationMs: item.duration_ms,
    songUrl: item.external_urls?.spotify ?? null,
  };
}

/**
 * Returns the currently playing track, or falls back to the most recently
 * played track (marked as not playing) when nothing is active. Returns
 * null only when there is no playback history to show at all.
 */
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const accessToken = await getAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const currentResponse = await fetch(NOW_PLAYING_ENDPOINT, { headers });

  if (currentResponse.status === 200) {
    const raw = await currentResponse.text();
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.item) {
        return mapTrackItem(
          data.item as SpotifyTrackItem,
          Boolean(data.is_playing),
          data.progress_ms ?? 0
        );
      }
    }
  } else if (currentResponse.status !== 204) {
    const errorBody = await currentResponse.text();
    throw new Error(
      `Spotify currently-playing request failed (${currentResponse.status}): ${errorBody}`
    );
  }

  const recentResponse = await fetch(RECENTLY_PLAYED_ENDPOINT, { headers });
  if (recentResponse.ok) {
    const data = (await recentResponse.json()) as {
      items?: { track?: SpotifyTrackItem }[];
    };
    const item = data.items?.[0]?.track;
    if (item) {
      return mapTrackItem(item, false, 0);
    }
  }

  return null;
}
