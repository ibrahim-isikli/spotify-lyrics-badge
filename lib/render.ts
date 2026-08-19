import type { TrackInfo } from "./provider";
import type { StyleConfig } from "./theme";

const CARD_WIDTH = 480;
const CARD_HEIGHT = 170;
const FOOTER_HEIGHT = 34;

export interface RenderableTrack extends TrackInfo {
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

const EQUALIZER_BARS = [
  { dx: 0, base: 6 },
  { dx: 6, base: 12 },
  { dx: 12, base: 8 },
  { dx: 18, base: 14 },
];
const EQUALIZER_MAX_HEIGHT = 14;
const EQUALIZER_REST_HEIGHT = 3;

/**
 * Renders the equalizer bars as CSS-animated elements: a <style> block
 * defines one @keyframes rule per bar (each has its own peak height) plus a
 * shared .eq-bar rule that ties the fill to the theme's equalizer color,
 * and each <rect> just references its keyframes via `animation`.
 */
function renderEqualizer(
  x: number,
  y: number,
  isPlaying: boolean,
  equalizerColor: string
): string {
  if (!isPlaying) {
    const bars = EQUALIZER_BARS.map(({ dx }) => {
      const barY = y + (EQUALIZER_MAX_HEIGHT - EQUALIZER_REST_HEIGHT);
      return `<rect x="${x + dx}" y="${barY}" width="3" height="${EQUALIZER_REST_HEIGHT}" rx="1" fill="${equalizerColor}" opacity="0.5" />`;
    });
    return `<g>${bars.join("")}</g>`;
  }

  const keyframes: string[] = [];
  const bars = EQUALIZER_BARS.map(({ dx, base }, index) => {
    const restY = y + (EQUALIZER_MAX_HEIGHT - EQUALIZER_REST_HEIGHT);
    const fullY = y + (EQUALIZER_MAX_HEIGHT - base);
    const dur = 0.7 + index * 0.15;
    const name = `eqBar${index}`;

    keyframes.push(
      `@keyframes ${name} { 0%, 100% { height: ${EQUALIZER_REST_HEIGHT}; y: ${restY}; } 50% { height: ${base}; y: ${fullY}; } }`
    );

    return `<rect class="eq-bar" x="${x + dx}" y="${restY}" width="3" height="${EQUALIZER_REST_HEIGHT}" rx="1" style="animation: ${name} ${dur}s ease-in-out infinite;" />`;
  });

  return `<style>.eq-bar { fill: ${equalizerColor}; } ${keyframes.join(" ")}</style><g>${bars.join("")}</g>`;
}

const ALBUM_ART_SIZE = 104;
const ALBUM_ART_X = 16;
const ALBUM_ART_Y = 16;

function renderAlbumArt(
  dataUri: string | null,
  theme: StyleConfig
): string {
  const x = ALBUM_ART_X;
  const y = ALBUM_ART_Y;
  const size = ALBUM_ART_SIZE;
  const radius = Math.max(0, Math.min(8, theme.borderRadius));

  if (dataUri) {
    return `
      <image
        x="${x}" y="${y}" width="${size}" height="${size}"
        href="${dataUri}"
        clip-path="url(#albumClip)"
        preserveAspectRatio="xMidYMid slice"
      />
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="none" stroke="${theme.border}" stroke-width="1" />
    `;
  }

  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${theme.progressBg}" stroke="${theme.border}" stroke-width="1" />
    <text x="${x + size / 2}" y="${y + size / 2 + 8}" font-size="34" text-anchor="middle" fill="${theme.artist}">♪</text>
  `;
}

export async function renderNowPlayingCard(
  track: RenderableTrack,
  theme: StyleConfig
): Promise<string> {
  const albumDataUri = await imageUrlToDataUri(track.albumImageUrl);
  const albumRadius = Math.max(0, Math.min(8, theme.borderRadius));

  const title = escapeXml(truncate(track.title, 30));
  const artist = escapeXml(truncate(track.artist, 38));
  const lyric = escapeXml(truncate(track.lyricLine, 56));

  const hasProgress =
    typeof track.progressMs === "number" &&
    typeof track.durationMs === "number" &&
    track.durationMs > 0;

  const progressBarWidth = 328;
  const progressX = 136;
  const progressY = 104;

  const progressSection = hasProgress
    ? (() => {
        const progressRatio = Math.min(
          1,
          Math.max(0, track.progressMs! / track.durationMs!)
        );
        const progressFillWidth = Math.round(
          progressBarWidth * progressRatio
        );
        return `
    <rect x="${progressX}" y="${progressY}" width="${progressBarWidth}" height="4" rx="2" fill="${theme.progressBg}" />
    <rect x="${progressX}" y="${progressY}" width="${progressFillWidth}" height="4" rx="2" fill="${theme.progressBar}" />

    <text x="${progressX}" y="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="9" fill="${theme.artist}">${formatTime(track.progressMs!)}</text>
    <text x="${progressX + progressBarWidth}" y="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="9" fill="${theme.artist}" text-anchor="end">${formatTime(track.durationMs!)}</text>`;
      })()
    : "";

  const statusLabel = track.isPlaying ? "NOW PLAYING" : "LAST PLAYED";

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Now playing: ${title} by ${artist}">
  <title>${title} — ${artist}</title>
  <defs>
    <clipPath id="cardClip">
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${theme.borderRadius}" />
    </clipPath>
    <clipPath id="albumClip">
      <rect x="${ALBUM_ART_X}" y="${ALBUM_ART_Y}" width="${ALBUM_ART_SIZE}" height="${ALBUM_ART_SIZE}" rx="${albumRadius}" />
    </clipPath>
  </defs>
  <g clip-path="url(#cardClip)">
    <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${theme.background}" />
    <rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="${theme.borderRadius}" fill="none" stroke="${theme.border}" stroke-width="1" />

    ${renderAlbumArt(albumDataUri, theme)}

    <text x="136" y="34" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="10" font-weight="600" letter-spacing="1.5" fill="${theme.progressBar}">${statusLabel}</text>

    <text x="136" y="58" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${theme.title}">${title}</text>

    <text x="136" y="78" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="13" fill="${theme.artist}">${artist}</text>

    ${renderEqualizer(136, 84, track.isPlaying, theme.equalizer)}
    ${progressSection}

    <rect x="0" y="${CARD_HEIGHT - FOOTER_HEIGHT}" width="${CARD_WIDTH}" height="${FOOTER_HEIGHT}" fill="${theme.progressBg}" />
    <line x1="0" y1="${CARD_HEIGHT - FOOTER_HEIGHT}" x2="${CARD_WIDTH}" y2="${CARD_HEIGHT - FOOTER_HEIGHT}" stroke="${theme.border}" stroke-width="1" />
    <text x="${CARD_WIDTH / 2}" y="${CARD_HEIGHT - 13}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="12.5" font-style="italic" text-anchor="middle" fill="${theme.lyrics}">♪ ${lyric} ♪</text>
  </g>
</svg>`;
}

export function renderOfflineCard(
  theme: StyleConfig,
  message = "Nothing Playing"
): string {
  const safeMessage = escapeXml(message);

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeMessage}">
  <title>${safeMessage}</title>
  <defs>
    <clipPath id="cardClip">
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${theme.borderRadius}" />
    </clipPath>
  </defs>
  <g clip-path="url(#cardClip)">
    <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${theme.background}" />
    <rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="${theme.borderRadius}" fill="none" stroke="${theme.border}" stroke-width="1" />

    <circle cx="60" cy="${CARD_HEIGHT / 2}" r="28" fill="none" stroke="${theme.artist}" stroke-width="2" />
    <path d="M 46 ${CARD_HEIGHT / 2 - 10} Q 60 ${CARD_HEIGHT / 2 - 20} 74 ${CARD_HEIGHT / 2 - 10} M 44 ${CARD_HEIGHT / 2} Q 60 ${CARD_HEIGHT / 2 - 13} 76 ${CARD_HEIGHT / 2} M 46 ${CARD_HEIGHT / 2 + 10} Q 60 ${CARD_HEIGHT / 2 + 3} 74 ${CARD_HEIGHT / 2 + 10}" stroke="${theme.artist}" stroke-width="2" fill="none" stroke-linecap="round" />

    <text x="110" y="${CARD_HEIGHT / 2 - 6}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${theme.title}">Offline</text>
    <text x="110" y="${CARD_HEIGHT / 2 + 16}" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif" font-size="13" fill="${theme.artist}">${safeMessage}</text>
  </g>
</svg>`;
}
