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
 * Used when the provider can't report real playback position (Last.fm has
 * no progressMs): picks a short, representative line instead of a
 * progress-synced one. Skips straight to the second meaningful line where
 * possible, since the very first synced line is often an intro tag or a
 * near-empty pickup rather than a line worth showcasing.
 */
export function pickShowcaseLine(lines: LyricLine[]): string | null {
  const meaningful = lines.filter((line) => line.text.length >= 8);
  const candidates = meaningful.length > 0 ? meaningful : lines;
  if (candidates.length === 0) return null;

  const index = Math.min(1, candidates.length - 1);
  return candidates[index].text;
}

/**
 * Fetches lyrics for a track from LRCLIB and returns the line that should
 * be shown. When progressMs is known (Spotify), returns the line matching
 * that exact playback position. When it isn't (Last.fm has no live
 * position data), falls back to a representative showcase line. Falls back
 * further to the first plain-text line, then to a generic placeholder, so
 * this never throws — a lyrics outage should never take the whole card down.
 */
export async function getCurrentLyricLine(
  trackName: string,
  artistName: string,
  durationMs?: number,
  progressMs?: number
): Promise<string> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (durationMs !== undefined) {
      params.set("duration", String(Math.round(durationMs / 1000)));
    }

    const response = await fetch(`${LRCLIB_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      return FALLBACK_LYRIC;
    }

    const data = (await response.json()) as LrcLibResponse;

    if (data.syncedLyrics) {
      const lines = parseSyncedLyrics(data.syncedLyrics);
      const current =
        progressMs !== undefined
          ? getLineAtProgress(lines, progressMs)
          : pickShowcaseLine(lines);
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
