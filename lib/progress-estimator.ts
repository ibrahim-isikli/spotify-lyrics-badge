export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    options?: { ex?: number }
  ): Promise<unknown>;
}

interface TrackStartRecord {
  key: string;
  startedAtMs: number;
}

const STORAGE_KEY = "spotify-lyrics-badge:current-track-start";
const RECORD_TTL_SECONDS = 60 * 60 * 6; // 6h — a stale/undetected track change shouldn't linger forever

function trackKey(title: string, artist: string): string {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

/**
 * Estimates elapsed playback time for a track that's reported as playing
 * but has no live position of its own (Last.fm). Works by remembering, in
 * the given key-value store, the first moment this exact track was seen
 * playing, and returning the elapsed time since then on every later call
 * for the same track. This is an approximation, not a measurement: it
 * can't detect the listener pausing, seeking, or looping the track, and it
 * only starts counting from whenever this badge first happened to notice
 * the track — so it's the best available proxy, not a real progress clock.
 *
 * Returns undefined when not playing, or when this is a brand new track
 * (progress is genuinely 0 in that case, which is also `undefined`-free —
 * 0 is a valid, meaningful value here, unlike undefined).
 */
export async function estimateProgressMs(
  store: KeyValueStore,
  title: string,
  artist: string,
  isPlaying: boolean,
  now: number = Date.now()
): Promise<number | undefined> {
  if (!isPlaying) return undefined;

  const key = trackKey(title, artist);
  const stored = await store.get<TrackStartRecord>(STORAGE_KEY);

  if (stored && stored.key === key) {
    return Math.max(0, now - stored.startedAtMs);
  }

  await store.set(
    STORAGE_KEY,
    { key, startedAtMs: now } satisfies TrackStartRecord,
    { ex: RECORD_TTL_SECONDS }
  );
  return 0;
}
