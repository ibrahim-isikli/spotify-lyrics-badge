import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getTrackInfo } from "../lib/provider";
import { getCurrentLyricLine } from "../lib/lyrics";
import { renderNowPlayingCard, renderOfflineCard } from "../lib/render";
import { parseThemeParams } from "../lib/theme";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Never let GitHub's Camo image proxy cache stale "now playing" state.
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1, must-revalidate"
  );

  const theme = parseThemeParams(req.query);

  try {
    const track = await getTrackInfo();

    if (!track) {
      res.status(200).send(renderOfflineCard(theme));
      return;
    }

    const lyricLine = await getCurrentLyricLine(
      track.title,
      track.artist,
      track.durationMs,
      track.progressMs
    );

    const svg = await renderNowPlayingCard({ ...track, lyricLine }, theme);
    res.status(200).send(svg);
  } catch (error) {
    console.error("Failed to render now-playing card:", error);
    res
      .status(200)
      .send(renderOfflineCard(theme, "Unable to load playback data"));
  }
}
