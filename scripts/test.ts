/**
 * Lightweight assertion-based checks for the pieces that don't touch a real
 * network: LRC parsing/selection logic and the Last.fm / provider mock
 * paths (fetch is monkey-patched with fixed responses). Run with:
 *   npm test
 * Exits non-zero on the first failed assertion so it's CI-friendly without
 * needing a full test framework.
 */
import assert from "node:assert/strict";
import {
  parseSyncedLyrics,
  getLineAtProgress,
  pickShowcaseLine,
  getCurrentLyricLine,
  FALLBACK_LYRIC,
} from "../lib/lyrics";
import { getLastFmNowPlaying } from "../lib/lastfm";
import { getTrackInfo } from "../lib/provider";
import { parseThemeParams, THEMES } from "../lib/theme";
import { estimateProgressMs, type KeyValueStore } from "../lib/progress-estimator";

const SAMPLE_SYNCED_LYRICS = `[00:00.00] intro line here
[00:12.50] first verse line here
[00:20.00] second verse line
[00:35.25] chorus line goes here`;

type Test = { name: string; run: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, run: Test["run"]) {
  tests.push({ name, run });
}

function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  const original = global.fetch;
  global.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? (init?.ok === false ? 500 : 200),
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  return () => {
    global.fetch = original;
  };
}

function mockFetchThrows(message: string) {
  const original = global.fetch;
  global.fetch = (async () => {
    throw new Error(message);
  }) as typeof fetch;
  return () => {
    global.fetch = original;
  };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

// --- lib/lyrics.ts: LRC parsing and line selection -------------------------

test("parseSyncedLyrics parses [mm:ss.xx] timestamps in order", () => {
  const lines = parseSyncedLyrics(SAMPLE_SYNCED_LYRICS);
  assert.equal(lines.length, 4);
  assert.deepEqual(
    lines.map((l) => l.timeMs),
    [0, 12_500, 20_000, 35_250]
  );
});

test("getLineAtProgress returns the most recent line at or before progressMs", () => {
  const lines = parseSyncedLyrics(SAMPLE_SYNCED_LYRICS);
  assert.equal(getLineAtProgress(lines, 15_000), "first verse line here");
  assert.equal(getLineAtProgress(lines, 40_000), "chorus line goes here");
  assert.equal(getLineAtProgress(lines, 0), "intro line here");
});

test("pickShowcaseLine prefers the second meaningful line (Last.fm mode)", () => {
  const lines = parseSyncedLyrics(SAMPLE_SYNCED_LYRICS);
  assert.equal(pickShowcaseLine(lines), "first verse line here");

  const single = parseSyncedLyrics("[00:00.00] only line here");
  assert.equal(pickShowcaseLine(single), "only line here");

  assert.equal(pickShowcaseLine([]), null);
});

test("getCurrentLyricLine uses progress-synced selection when progressMs is given", async () => {
  const restore = mockFetchOnce({ syncedLyrics: SAMPLE_SYNCED_LYRICS });
  try {
    const line = await getCurrentLyricLine("Song", "Artist", 210_000, 40_000);
    assert.equal(line, "chorus line goes here");
  } finally {
    restore();
  }
});

test("getCurrentLyricLine uses a showcase line when progressMs is omitted (Last.fm mode)", async () => {
  const restore = mockFetchOnce({ syncedLyrics: SAMPLE_SYNCED_LYRICS });
  try {
    const line = await getCurrentLyricLine("Song", "Artist");
    assert.equal(line, "first verse line here");
  } finally {
    restore();
  }
});

test("getCurrentLyricLine falls back to the first plain-text line when no synced lyrics exist", async () => {
  const restore = mockFetchOnce({
    syncedLyrics: null,
    plainLyrics: "Some fallback text\nMore text",
  });
  try {
    const line = await getCurrentLyricLine("Song", "Artist");
    assert.equal(line, "Some fallback text");
  } finally {
    restore();
  }
});

test("getCurrentLyricLine falls back to the placeholder when LRCLIB has nothing", async () => {
  const restore = mockFetchOnce({ syncedLyrics: null, plainLyrics: null });
  try {
    const line = await getCurrentLyricLine("Song", "Artist");
    assert.equal(line, FALLBACK_LYRIC);
  } finally {
    restore();
  }
});

// --- lib/lastfm.ts -----------------------------------------------------

const LASTFM_MOCK_RESPONSE = {
  recenttracks: {
    track: [
      {
        name: "Test Track",
        artist: { "#text": "Test Artist" },
        image: [
          { size: "small", "#text": "http://example.com/small.jpg" },
          { size: "large", "#text": "http://example.com/large.jpg" },
          { size: "extralarge", "#text": "http://example.com/extralarge.jpg" },
        ],
        "@attr": { nowplaying: "true" },
      },
    ],
  },
};

test("getLastFmNowPlaying maps a live scrobble to TrackInfo, preferring the extralarge image", async () => {
  const restore = mockFetchOnce(LASTFM_MOCK_RESPONSE);
  try {
    const track = await withEnv(
      { LASTFM_API_KEY: "key", LASTFM_USER: "user" },
      () => getLastFmNowPlaying()
    );
    assert.deepEqual(track, {
      title: "Test Track",
      artist: "Test Artist",
      albumImageUrl: "http://example.com/extralarge.jpg",
      isPlaying: true,
    });
  } finally {
    restore();
  }
});

test("getLastFmNowPlaying marks a track not playing when Last.fm omits @attr.nowplaying", async () => {
  const restore = mockFetchOnce({
    recenttracks: {
      track: [{ name: "Old Track", artist: { "#text": "Old Artist" }, image: [] }],
    },
  });
  try {
    const track = await withEnv(
      { LASTFM_API_KEY: "key", LASTFM_USER: "user" },
      () => getLastFmNowPlaying()
    );
    assert.equal(track?.isPlaying, false);
    assert.equal(track?.albumImageUrl, "");
  } finally {
    restore();
  }
});

test("getLastFmNowPlaying returns null when the user has no scrobble history", async () => {
  const restore = mockFetchOnce({ recenttracks: { track: [] } });
  try {
    const track = await withEnv(
      { LASTFM_API_KEY: "key", LASTFM_USER: "user" },
      () => getLastFmNowPlaying()
    );
    assert.equal(track, null);
  } finally {
    restore();
  }
});

test("getLastFmNowPlaying returns null without fetching when not configured", async () => {
  const restore = mockFetchThrows(
    "fetch should not be called when Last.fm env vars are unset"
  );
  try {
    const track = await withEnv(
      { LASTFM_API_KEY: undefined, LASTFM_USER: undefined },
      () => getLastFmNowPlaying()
    );
    assert.equal(track, null);
  } finally {
    restore();
  }
});

// --- lib/provider.ts -----------------------------------------------------

test("getTrackInfo prefers Last.fm over Spotify when both are configured", async () => {
  const restore = mockFetchOnce(LASTFM_MOCK_RESPONSE);
  try {
    const track = await withEnv(
      {
        LASTFM_API_KEY: "key",
        LASTFM_USER: "user",
        SPOTIFY_REFRESH_TOKEN: "should-not-be-used",
      },
      () => getTrackInfo()
    );
    assert.equal(track?.title, "Test Track");
  } finally {
    restore();
  }
});

test("getTrackInfo returns null when no provider is configured", async () => {
  const track = await withEnv(
    {
      LASTFM_API_KEY: undefined,
      LASTFM_USER: undefined,
      SPOTIFY_REFRESH_TOKEN: undefined,
    },
    () => getTrackInfo()
  );
  assert.equal(track, null);
});

// --- lib/theme.ts --------------------------------------------------------

test("parseThemeParams defaults to the 'default' theme with border_radius 10", () => {
  const style = parseThemeParams({});
  assert.deepEqual(style, { ...THEMES.default, borderRadius: 10 });
});

test("parseThemeParams selects a preset by name, case-insensitively", () => {
  const style = parseThemeParams({ theme: "Dracula" });
  assert.equal(style.background, THEMES.dracula.background);
  assert.equal(style.lyrics, THEMES.dracula.lyrics);
  assert.equal(style.equalizer, THEMES.dracula.equalizer);
});

test("parseThemeParams falls back to 'default' for an unknown theme name", () => {
  const style = parseThemeParams({ theme: "not-a-real-theme" });
  assert.equal(style.background, THEMES.default.background);
});

test("parseThemeParams overrides individual colors on top of the base theme, adding '#' when missing", () => {
  const style = parseThemeParams({
    theme: "dracula",
    bg_color: "1a1b26", // no leading '#'
    lyrics_color: "#ff007f",
  });
  assert.equal(style.background, "#1a1b26");
  assert.equal(style.lyrics, "#ff007f");
  // Untouched fields keep the base theme's values.
  assert.equal(style.progressBar, THEMES.dracula.progressBar);
});

test("parseThemeParams ignores unsafe/invalid color values and keeps the theme default", () => {
  const style = parseThemeParams({
    bg_color: "red; } </style><script>alert(1)</script>",
  });
  assert.equal(style.background, THEMES.default.background);
});

test("parseThemeParams accepts bare CSS color keywords", () => {
  const style = parseThemeParams({ border_color: "tomato" });
  assert.equal(style.border, "tomato");
});

test("parseThemeParams parses border_radius, clamping to a safe non-negative range", () => {
  assert.equal(parseThemeParams({ border_radius: "0" }).borderRadius, 0);
  assert.equal(parseThemeParams({ border_radius: "24" }).borderRadius, 24);
  assert.equal(parseThemeParams({ border_radius: "-5" }).borderRadius, 0);
  assert.equal(parseThemeParams({ border_radius: "not-a-number" }).borderRadius, 10);
  assert.equal(parseThemeParams({ border_radius: "99999" }).borderRadius, 85);
});

test("parseThemeParams makes the border transparent when show_border=false", () => {
  assert.equal(parseThemeParams({ show_border: "false" }).border, "transparent");
  assert.equal(
    parseThemeParams({ show_border: "false", border_color: "ff0000" }).border,
    "transparent"
  );
  assert.equal(
    parseThemeParams({ show_border: "true" }).border,
    THEMES.default.border
  );
});

test("parseThemeParams takes the first value when a param is repeated (array query value)", () => {
  const style = parseThemeParams({ theme: ["dracula", "nord"] });
  assert.equal(style.background, THEMES.dracula.background);
});

// --- lib/progress-estimator.ts --------------------------------------------

function createMemoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return data.has(key) ? (data.get(key) as T) : null;
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
      return "OK";
    },
  };
}

test("estimateProgressMs returns undefined when the track isn't playing", async () => {
  const store = createMemoryStore();
  const result = await estimateProgressMs(store, "Song", "Artist", false);
  assert.equal(result, undefined);
});

test("estimateProgressMs returns 0 on first sighting of a track and remembers it", async () => {
  const store = createMemoryStore();
  const result = await estimateProgressMs(
    store,
    "Song",
    "Artist",
    true,
    1_000_000
  );
  assert.equal(result, 0);
});

test("estimateProgressMs returns elapsed time on later calls for the same track", async () => {
  const store = createMemoryStore();
  await estimateProgressMs(store, "Song", "Artist", true, 1_000_000);
  const later = await estimateProgressMs(
    store,
    "Song",
    "Artist",
    true,
    1_045_000
  );
  assert.equal(later, 45_000);
});

test("estimateProgressMs is case/whitespace-insensitive when matching the stored track", async () => {
  const store = createMemoryStore();
  await estimateProgressMs(store, "Song Title", "The Artist", true, 1_000_000);
  const later = await estimateProgressMs(
    store,
    "  song title  ",
    "THE ARTIST",
    true,
    1_010_000
  );
  assert.equal(later, 10_000);
});

test("estimateProgressMs resets to 0 when the track changes", async () => {
  const store = createMemoryStore();
  await estimateProgressMs(store, "First Song", "Artist", true, 1_000_000);
  const afterChange = await estimateProgressMs(
    store,
    "Second Song",
    "Artist",
    true,
    1_500_000
  );
  assert.equal(afterChange, 0);
});

test("estimateProgressMs never goes negative even with clock skew", async () => {
  const store = createMemoryStore();
  await estimateProgressMs(store, "Song", "Artist", true, 1_000_000);
  const earlier = await estimateProgressMs(
    store,
    "Song",
    "Artist",
    true,
    999_000
  );
  assert.equal(earlier, 0);
});

// --- runner ----------------------------------------------------------------

async function main() {
  let failures = 0;

  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`  ok  - ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL  - ${name}`);
      console.error(error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main();
