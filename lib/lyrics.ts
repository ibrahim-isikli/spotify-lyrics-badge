const LRCLIB_ENDPOINT = "https://lrclib.net/api/get";

export const FALLBACK_LYRIC = "♫ Instrumental or No Lyrics Found ♫";

export interface LyricLine {
  timeMs: number;
  text: string;
}

interface LrcLibResponse {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

const SYNCED_LINE_PATTERN = /^\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

/**
 * Parses LRC-formatted synced lyrics ("[mm:ss.xx] text") into a
 * chronologically sorted list of {timeMs, text} entries. Lines without a
 * usable timestamp (e.g. metadata tags like [ar:], [ti:]) are skipped.
 */
export function parseSyncedLyrics(syncedLyrics: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const rawLine of syncedLyrics.split("\n")) {
    const match = rawLine.trim().match(SYNCED_LINE_PATTERN);
    if (!match) continue;

    const [, mm, ss, fraction, text] = match;
    const minutes = parseInt(mm, 10);
    const seconds = parseInt(ss, 10);
    const millis = fraction
      ? parseInt(fraction.padEnd(3, "0").slice(0, 3), 10)
      : 0;

    if (!text || !text.trim()) continue;

    lines.push({
      timeMs: minutes * 60_000 + seconds * 1_000 + millis,
      text: text.trim(),
    });
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Finds the lyric line whose timestamp is the closest one at or before
 * progressMs — i.e. the line that should currently be displayed.
 */
export function getLineAtProgress(
  lines: LyricLine[],
  progressMs: number
): string | null {
  let current: string | null = null;

  for (const line of lines) {
    if (line.timeMs <= progressMs) {
      current = line.text;
    } else {
      break;
    }
  }

  return current;
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    if (line.trim()) return line.trim();
  }
  return null;
}

/**
 * Fetches lyrics for a track from LRCLIB and returns the line that should
 * be shown given the track's current playback progress. Falls back to the
 * first plain-text line, then to a generic placeholder, so this never
 * throws — a lyrics outage should never take the whole card down.
 */
export async function getCurrentLyricLine(
  trackName: string,
  artistName: string,
  durationMs: number,
  progressMs: number
): Promise<string> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      duration: String(Math.round(durationMs / 1000)),
    });

    const response = await fetch(`${LRCLIB_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      return FALLBACK_LYRIC;
    }

    const data = (await response.json()) as LrcLibResponse;

    if (data.syncedLyrics) {
      const lines = parseSyncedLyrics(data.syncedLyrics);
      const current = getLineAtProgress(lines, progressMs);
      if (current) return current;
    }

    if (data.plainLyrics) {
      const first = firstNonEmptyLine(data.plainLyrics);
      if (first) return first;
    }

    return FALLBACK_LYRIC;
  } catch {
    return FALLBACK_LYRIC;
  }
}
