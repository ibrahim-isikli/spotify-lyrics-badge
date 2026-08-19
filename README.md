# Spotify Lyrics Badge

A dynamic, dependency-free SVG card for your GitHub profile README that shows what you're **currently listening to on Spotify**, synced live with the matching **lyric line from LRCLIB**. Hosted as a single Vercel Serverless Function.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ibrahim-isikli/spotify-lyrics-badge&env=SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET,SPOTIFY_REFRESH_TOKEN&envDescription=Spotify%20API%20credentials%20required%20to%20read%20now-playing%20data&envLink=https://github.com/ibrahim-isikli/spotify-lyrics-badge%23spotify-api-setup&project-name=spotify-lyrics-badge&repository-name=spotify-lyrics-badge)

## Overview / Features

- **Minimal, dark card design** inspired by [natemoo-re/novatorem](https://github.com/natemoo-re/novatorem) — rounded corners, muted palette, animated equalizer bars.
- **Live Spotify sync** — reads `currently-playing`, and gracefully falls back to your most recent `recently-played` track when nothing is active.
- **Real-time lyric matching** — fetches synced lyrics (`syncedLyrics`) from [LRCLIB](https://lrclib.net), parses the `[mm:ss.xx]` timestamps, and picks the exact line that corresponds to the track's current playback position.
- **Zero-dependency SVG rendering** — the card is built from a plain template string, no headless browser, no canvas, no external render service. Album art is downloaded once per request and inlined as a base64 `data:` URI so GitHub's Camo image proxy never has to follow a third-party image link.
- **Edge/Serverless friendly** — a single stateless function with no persistent storage; runs comfortably within Vercel's free tier.
- **Cache-aware** — response headers are tuned so Camo doesn't freeze on a stale "now playing" snapshot.

## Live Preview / Demo

The samples below are generated straight from the real render pipeline (`npm run generate:previews`), using mock playback data — see [Sanal Ortamda Çalıştırma](#regenerating-the-previews) for how to reproduce them.

| Now playing, with synced lyric | Nothing playing (fallback) |
| --- | --- |
| ![Now playing with synced lyrics](./assets/playing-with-lyrics.svg) | ![Offline / nothing playing](./assets/idle-offline.svg) |

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

Set these in the Vercel deploy dialog, or later under **Project → Settings → Environment Variables**:

| Variable | Description |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Client ID of your app from the Spotify Developer Dashboard. |
| `SPOTIFY_CLIENT_SECRET` | Client Secret of the same app. |
| `SPOTIFY_REFRESH_TOKEN` | Long-lived refresh token obtained once via the OAuth authorization code flow (see below). |

### 3. Verify

Open `https://your-domain.vercel.app/api/spotify-lyrics` in a browser — you should see the SVG card render directly.

## Spotify API Setup

The API needs your explicit, one-time authorization to read your playback state. This is a **standard OAuth authorization code flow**, done once locally.

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
cp .env.example .env   # fill in SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN
npx vercel dev
```

Then open `http://localhost:3000/api/spotify-lyrics`.

### Type checking

```bash
npm run type-check
```

### Regenerating the previews

The card templates in `lib/render.ts` can be exercised offline, without any real Spotify account, using the mock-data script:

```bash
npm run generate:previews
```

This renders both card states — a "now playing" card (with a synthesized placeholder album cover and a sample lyric line) and the offline fallback card — through the exact same `renderNowPlayingCard` / `renderOfflineCard` functions used in production, and writes them to `assets/playing-with-lyrics.svg` and `assets/idle-offline.svg`.

## How It Works

1. `GET /api/spotify-lyrics` triggers `lib/spotify.ts`, which exchanges the refresh token for a fresh access token and queries the `currently-playing` endpoint, falling back to `recently-played` if nothing is active right now.
2. If a track is found, `lib/lyrics.ts` queries LRCLIB with `track_name`, `artist_name`, and `duration`, parses the `[mm:ss.xx]` synced-lyrics timestamps into milliseconds, and selects the most recent line at or before the track's `progressMs`. If no synced lyrics exist, it falls back to the first line of plain lyrics, and finally to `"♫ Instrumental or No Lyrics Found ♫"`.
3. `lib/render.ts` downloads the album art, inlines it as a base64 `data:` URI, and composes everything into a single SVG template.
4. `api/spotify-lyrics.ts` returns the SVG with `Content-Type: image/svg+xml` and `Cache-Control: public, max-age=0, s-maxage=1, must-revalidate` so GitHub's Camo proxy revalidates frequently instead of serving a stale snapshot.

## Project Structure

```
.
├── api/
│   └── spotify-lyrics.ts   # Vercel serverless function (SVG endpoint)
├── lib/
│   ├── spotify.ts          # OAuth token refresh + now-playing/recently-played
│   ├── lyrics.ts           # LRCLIB integration + LRC timestamp parser
│   └── render.ts           # SVG card templates (now playing / offline)
├── scripts/
│   └── generate-previews.ts # Offline preview generator for the README gallery
├── assets/                  # Generated preview SVGs used in this README
├── .env.example
├── package.json
├── tsconfig.json
└── vercel.json
```

## Credits & License

- Lyrics data provided by [LRCLIB](https://lrclib.net), a free and open lyrics API.
- Visual design inspired by [natemoo-re/novatorem](https://github.com/natemoo-re/novatorem).
- Released under the [MIT License](./LICENSE).
