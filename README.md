# Spotify Lyrics Badge

A dynamic, dependency-free SVG card for your GitHub profile README that shows what you're **currently listening to**, synced live with the matching **lyric line from LRCLIB**. Hosted as a single Vercel Serverless Function. Supports two data sources — the native **Spotify API** or the free **Last.fm** scrobble bridge — so it works whether or not you have Spotify Premium.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ibrahim-isikli/spotify-lyrics-badge&env=LASTFM_API_KEY,LASTFM_USER,SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET,SPOTIFY_REFRESH_TOKEN&envDescription=Fill%20in%20either%20the%20LASTFM_*%20pair%20or%20the%20SPOTIFY_*%20trio%20%E2%80%94%20see%20README%20Providers%20section&envLink=https://github.com/ibrahim-isikli/spotify-lyrics-badge%23providers--setup-modes&project-name=spotify-lyrics-badge&repository-name=spotify-lyrics-badge)

## Overview / Features

- **Minimal, dark card design** inspired by [natemoo-re/novatorem](https://github.com/natemoo-re/novatorem) — rounded corners, muted palette, animated equalizer bars.
- **Dual-provider playback source** — reads live "now playing" data from either the native Spotify API or Last.fm's scrobble bridge (see [Providers / Setup Modes](#providers--setup-modes)), whichever is configured. Falls back to the most recently played track when nothing is active right now.
- **Real-time lyric matching** — fetches synced lyrics (`syncedLyrics`) from [LRCLIB](https://lrclib.net), parses the `[mm:ss.xx]` timestamps, and picks the line matching the track's current playback position. When the active provider can't report a live position (Last.fm), it shows a representative lyric line instead.
- **Zero-dependency SVG rendering** — the card is built from a plain template string, no headless browser, no canvas, no external render service. Album art is downloaded once per request and inlined as a base64 `data:` URI so GitHub's Camo image proxy never has to follow a third-party image link.
- **Edge/Serverless friendly** — a single stateless function with no persistent storage; runs comfortably within Vercel's free tier.
- **Cache-aware** — response headers are tuned so Camo doesn't freeze on a stale "now playing" snapshot.

## Live Preview / Demo

The samples below are generated straight from the real render pipeline (`npm run generate:previews`), using mock playback data — see [Regenerating the previews](#regenerating-the-previews) for how to reproduce them.

| Spotify mode (live progress) | Last.fm mode (no live position) | Nothing playing (fallback) |
| --- | --- | --- |
| ![Now playing with synced lyrics](./assets/playing-with-lyrics.svg) | ![Now playing via Last.fm](./assets/playing-lastfm-mode.svg) | ![Offline / nothing playing](./assets/idle-offline.svg) |

## Quick Start & Deployment

### 1. Deploy

Click **Deploy with Vercel** above, or manually:

```bash
git clone https://github.com/ibrahim-isikli/spotify-lyrics-badge.git
cd spotify-lyrics-badge
npm install
npx vercel --prod
```

### 2. Configure environment variables

Pick **one** provider and fill in only its variables — see [Providers / Setup Modes](#providers--setup-modes) for how to obtain each. Set these in the Vercel deploy dialog, or later under **Project → Settings → Environment Variables**:

| Variable | Provider | Description |
| --- | --- | --- |
| `LASTFM_API_KEY` | Last.fm (Option A) | Free API key from your Last.fm account. |
| `LASTFM_USER` | Last.fm (Option A) | Your Last.fm username (the one scrobbling from Spotify). |
| `SPOTIFY_CLIENT_ID` | Spotify (Option B) | Client ID of your app from the Spotify Developer Dashboard. |
| `SPOTIFY_CLIENT_SECRET` | Spotify (Option B) | Client Secret of the same app. |
| `SPOTIFY_REFRESH_TOKEN` | Spotify (Option B) | Long-lived refresh token obtained once via the OAuth authorization code flow. |

If both `LASTFM_API_KEY`/`LASTFM_USER` and `SPOTIFY_REFRESH_TOKEN` are set, Last.fm takes priority (see `lib/provider.ts`). If neither is set, the badge renders the offline fallback card.

### 3. Verify

Open `https://your-domain.vercel.app/api/spotify-lyrics` in a browser — you should see the SVG card render directly.

## Providers / Setup Modes

### Option A (Recommended for Free Users): Last.fm Bridge

Last.fm's free scrobbling service already tracks what you play on Spotify — no Spotify Developer app, no OAuth flow, and it works on **Spotify Free** too.

1. Create a free [Last.fm](https://www.last.fm) account if you don't have one, then connect it to Spotify: **Settings → Applications → Spotify** on last.fm, and authorize it. Play something on Spotify once to confirm scrobbles show up on your Last.fm profile.
2. Get a free API key at [last.fm/api/account/create](https://www.last.fm/api/account/create) — no credit card, issued instantly. You only need the **API Key** value it gives you.
3. Set these in your Vercel project's Environment Variables:

   | Variable | Value |
   | --- | --- |
   | `LASTFM_API_KEY` | The API key from step 2. |
   | `LASTFM_USER` | Your Last.fm username. |

That's it — no `SPOTIFY_*` variables needed for this mode. Because Last.fm's `user.getrecenttracks` endpoint doesn't expose a live playback position, the card shows a representative lyric line instead of one synced to the exact second (see `pickShowcaseLine` in `lib/lyrics.ts`).

### Option B: Native Spotify API (works on Spotify Free too)

The Spotify Web API's playback-reading endpoints (`currently-playing`, `recently-played`) work on **both Free and Premium** accounts — Premium is only required for *playback-control* endpoints (play/pause/skip), which this project doesn't use. Choose this option if you want second-accurate lyric sync via `progressMs`, at the cost of a one-time OAuth setup.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**, give it any name/description.
3. Under **Redirect URIs**, add `http://localhost:8888/callback` (only used to capture the one-time authorization code).
4. Open **Settings** on the new app and copy the **Client ID** and **Client Secret**.
5. Visit the following URL in your browser, replacing `CLIENT_ID`:

   ```
   https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost:8888/callback&scope=user-read-currently-playing%20user-read-playback-state%20user-read-recently-played
   ```

6. Approve the request. You'll be redirected to `http://localhost:8888/callback?code=...` (the page itself will fail to load — that's expected, just copy the `code` query parameter from the address bar).
7. Exchange that code for a refresh token:

   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \
     -d grant_type=authorization_code \
     -d code=PASTE_YOUR_CODE_HERE \
     -d redirect_uri=http://localhost:8888/callback
   ```

8. Copy the `refresh_token` field from the JSON response — this is your `SPOTIFY_REFRESH_TOKEN`. It doesn't expire under normal use, so this is a one-time setup step.
9. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN` in your Vercel project's Environment Variables.

## Usage

Once deployed, embed the badge in any GitHub profile or project README:

```markdown
![Spotify Lyrics](https://your-domain.vercel.app/api/spotify-lyrics)
```

Or with HTML, if you want to control sizing:

```html
<img src="https://your-domain.vercel.app/api/spotify-lyrics" alt="Spotify Now Playing" width="480" />
```

## Local Development

```bash
npm install
cp .env.example .env   # fill in either the LASTFM_* pair or the SPOTIFY_* trio
npx vercel dev
```

Then open `http://localhost:3000/api/spotify-lyrics`.

### Type checking

```bash
npm run type-check
```

### Running the tests

```bash
npm test
```

Runs assertion-based checks (`scripts/test.ts`) against the LRC parsing/selection logic and the Last.fm/provider selection logic, with `fetch` mocked so no network access or real credentials are needed.

### Regenerating the previews

The card templates in `lib/render.ts` can be exercised offline, without any real Spotify or Last.fm account, using the mock-data script:

```bash
npm run generate:previews
```

This renders three card states — a Spotify-mode "now playing" card (with live progress), a Last.fm-mode "now playing" card (no progress bar, showcase lyric line), and the offline fallback card — through the exact same `renderNowPlayingCard` / `renderOfflineCard` functions used in production, and writes them to `assets/playing-with-lyrics.svg`, `assets/playing-lastfm-mode.svg`, and `assets/idle-offline.svg`.

## How It Works

1. `GET /api/spotify-lyrics` calls `lib/provider.ts`, which picks a data source based on which environment variables are set: Last.fm (`lib/lastfm.ts`) if `LASTFM_API_KEY`/`LASTFM_USER` are configured, otherwise Spotify (`lib/spotify.ts`) if `SPOTIFY_REFRESH_TOKEN` is configured. Both return the same provider-agnostic `TrackInfo` shape. Spotify falls back to `recently-played` when nothing is currently playing; Last.fm falls back to the last scrobble.
2. If a track is found, `lib/lyrics.ts` queries LRCLIB with `track_name`/`artist_name` (and `duration` when known), parses the `[mm:ss.xx]` synced-lyrics timestamps into milliseconds, and selects the line matching the track's `progressMs` when that's available (Spotify), or a representative showcase line when it isn't (Last.fm). If no synced lyrics exist, it falls back to the first line of plain lyrics, and finally to `"♫ Instrumental or No Lyrics Found ♫"`.
3. `lib/render.ts` downloads the album art, inlines it as a base64 `data:` URI, and composes everything into a single SVG template — omitting the progress bar when playback position isn't known.
4. `api/spotify-lyrics.ts` returns the SVG with `Content-Type: image/svg+xml` and `Cache-Control: public, max-age=0, s-maxage=1, must-revalidate` so GitHub's Camo proxy revalidates frequently instead of serving a stale snapshot.

## Project Structure

```
.
├── api/
│   └── spotify-lyrics.ts    # Vercel serverless function (SVG endpoint)
├── lib/
│   ├── provider.ts          # Unified TrackInfo type + provider selection (Last.fm vs Spotify)
│   ├── spotify.ts           # OAuth token refresh + now-playing/recently-played
│   ├── lastfm.ts            # Last.fm recenttracks integration (Spotify Free bridge)
│   ├── lyrics.ts            # LRCLIB integration + LRC timestamp parser
│   └── render.ts            # SVG card templates (now playing / offline)
├── scripts/
│   ├── generate-previews.ts # Offline preview generator for the README gallery
│   └── test.ts              # Assertion-based checks (LRC logic + mocked Last.fm/provider)
├── assets/                  # Generated preview SVGs used in this README
├── .env.example
├── package.json
├── tsconfig.json
└── vercel.json
```

## Credits & License

- Lyrics data provided by [LRCLIB](https://lrclib.net), a free and open lyrics API.
- Playback data provided by the [Spotify Web API](https://developer.spotify.com/documentation/web-api) and/or the [Last.fm API](https://www.last.fm/api).
- Visual design inspired by [natemoo-re/novatorem](https://github.com/natemoo-re/novatorem).
- Released under the [MIT License](./LICENSE).
