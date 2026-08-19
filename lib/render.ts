import type { NowPlaying } from "./spotify";

const CARD_WIDTH = 480;
const CARD_HEIGHT = 170;
const CARD_RADIUS = 10;
const FOOTER_HEIGHT = 34;

const BG_COLOR = "#0d1117";
const FOOTER_BG_COLOR = "#161b22";
const BORDER_COLOR = "#21262d";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#b3b3b3";
const TEXT_MUTED = "#6e7681";
const ACCENT_COLOR = "#1ed760";
const TRACK_COLOR = "#30363d";

export interface RenderableTrack extends NowPlaying {
  lyricLine: string;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Downloads the album art and inlines it as a base64 data URI so the SVG
 * has no external image references — GitHub's Camo proxy fails to render
 * <image> tags that point at third-party URLs, so this avoids that entirely.
 */
async function imageUrlToDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function renderEqualizer(x: number, y: number, isPlaying: boolean): string {
  const bars = [
    { dx: 0, base: 6 },
    { dx: 6, base: 12 },
    { dx: 12, base: 8 },
    { dx: 18, base: 14 },
  ];
  const maxHeight = 14;

  const barSvgs = bars.map(({ dx, base }, index) => {
    const barX = x + dx;
    if (!isPlaying) {
      const staticHeight = 3;
      const barY = y + (maxHeight - staticHeight);
      return `<rect x="${barX}" y="${barY}" width="3" height="${staticHeight}" rx="1" fill="${TEXT_MUTED}" />`;
    }

    const dur = 0.7 + index * 0.15;
    const restHeight = 3;
    const restY = y + (maxHeight - restHeight);
    const fullY = y + (maxHeight - base);
    return `<rect x="${barX}" y="${restY}" width="3" height="${restHeight}" rx="1" fill="${ACCENT_COLOR}">
      <animate attributeName="height" values="${restHeight};${base};${restHeight}" dur="${dur}s" repeatCount="indefinite" />
      <animate attributeName="y" values="${restY};${fullY};${restY}" dur="${dur}s" repeatCount="indefinite" />
    </rect>`;
  });

  return `<g>${barSvgs.join("")}</g>`;
}

const ALBUM_ART_SIZE = 104;
const ALBUM_ART_X = 16;
const ALBUM_ART_Y = 16;

function renderAlbumArt(dataUri: string | null): string {
  const { x, y } = { x: ALBUM_ART_X, y: ALBUM_ART_Y };
  const size = ALBUM_ART_SIZE;

  if (dataUri) {
    return `
      <image
        x="${x}" y="${y}" width="${size}" height="${size}"
        href="${dataUri}"
        clip-path="url(#albumClip)"
        preserveAspectRatio="xMidYMid slice"
      />
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="none" stroke="${BORDER_COLOR}" stroke-width="1" />
    `;
  }

  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="#181818" stroke="${BORDER_COLOR}" stroke-width="1" />
    <text x="${x + size / 2}" y="${y + size / 2 + 8}" font-size="34" text-anchor="middle" fill="${TEXT_MUTED}">♪</text>
  `;
}

export async function renderNowPlayingCard(
  track: RenderableTrack
): Promise<string> {
  const albumDataUri = await imageUrlToDataUri(track.albumImageUrl);

  const title = escapeXml(truncate(track.title, 30));
  const artist = escapeXml(truncate(track.artist, 38));
  const lyric = escapeXml(truncate(track.lyricLine, 56));

  const progressRatio =
    track.durationMs > 0
      ? Math.min(1, Math.max(0, track.progressMs / track.durationMs))
      : 0;
  const progressBarWidth = 328;
  const progressX = 136;
  const progressY = 104;
  const progressFillWidth = Math.round(progressBarWidth * progressRatio);

  const statusLabel = track.isPlaying ? "NOW PLAYING" : "LAST PLAYED";

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify now playing: ${title} by ${artist}">
  <title>${title} — ${artist}</title>
  <defs>
    <clipPath id="cardClip">
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}" />
    </clipPath>
    <clipPath id="albumClip">
      <rect x="${ALBUM_ART_X}" y="${ALBUM_ART_Y}" width="${ALBUM_ART_SIZE}" height="${ALBUM_ART_SIZE}" rx="8" />
    </clipPath>
  </defs>
  <g clip-path="url(#cardClip)">
    <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BG_COLOR}" />

    ${renderAlbumArt(albumDataUri)}

    <text x="136" y="34" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="10" font-weight="600" letter-spacing="1.5" fill="${ACCENT_COLOR}">${statusLabel}</text>

    <text x="136" y="58" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${TEXT_PRIMARY}">${title}</text>

    <text x="136" y="78" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="13" fill="${TEXT_SECONDARY}">${artist}</text>

    ${renderEqualizer(136, 84, track.isPlaying)}

    <rect x="${progressX}" y="${progressY}" width="${progressBarWidth}" height="4" rx="2" fill="${TRACK_COLOR}" />
    <rect x="${progressX}" y="${progressY}" width="${progressFillWidth}" height="4" rx="2" fill="${ACCENT_COLOR}" />

    <text x="${progressX}" y="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="9" fill="${TEXT_MUTED}">${formatTime(track.progressMs)}</text>
    <text x="${progressX + progressBarWidth}" y="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="9" fill="${TEXT_MUTED}" text-anchor="end">${formatTime(track.durationMs)}</text>

    <rect x="0" y="${CARD_HEIGHT - FOOTER_HEIGHT}" width="${CARD_WIDTH}" height="${FOOTER_HEIGHT}" fill="${FOOTER_BG_COLOR}" />
    <line x1="0" y1="${CARD_HEIGHT - FOOTER_HEIGHT}" x2="${CARD_WIDTH}" y2="${CARD_HEIGHT - FOOTER_HEIGHT}" stroke="${BORDER_COLOR}" stroke-width="1" />
    <text x="${CARD_WIDTH / 2}" y="${CARD_HEIGHT - 13}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="12.5" font-style="italic" text-anchor="middle" fill="${ACCENT_COLOR}">♪ ${lyric} ♪</text>
  </g>
</svg>`;
}

export function renderOfflineCard(message = "Nothing Playing"): string {
  const safeMessage = escapeXml(message);

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify: ${safeMessage}">
  <title>Spotify — ${safeMessage}</title>
  <defs>
    <clipPath id="cardClip">
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}" />
    </clipPath>
  </defs>
  <g clip-path="url(#cardClip)">
    <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BG_COLOR}" />

    <circle cx="60" cy="${CARD_HEIGHT / 2}" r="28" fill="none" stroke="${TEXT_MUTED}" stroke-width="2" />
    <path d="M 46 ${CARD_HEIGHT / 2 - 10} Q 60 ${CARD_HEIGHT / 2 - 20} 74 ${CARD_HEIGHT / 2 - 10} M 44 ${CARD_HEIGHT / 2} Q 60 ${CARD_HEIGHT / 2 - 13} 76 ${CARD_HEIGHT / 2} M 46 ${CARD_HEIGHT / 2 + 10} Q 60 ${CARD_HEIGHT / 2 + 3} 74 ${CARD_HEIGHT / 2 + 10}" stroke="${TEXT_MUTED}" stroke-width="2" fill="none" stroke-linecap="round" />

    <text x="110" y="${CARD_HEIGHT / 2 - 6}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${TEXT_PRIMARY}">Offline</text>
    <text x="110" y="${CARD_HEIGHT / 2 + 16}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="13" fill="${TEXT_SECONDARY}">${safeMessage}</text>
  </g>
</svg>`;
}
