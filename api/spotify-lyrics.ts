import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getTrackInfo } from "../lib/provider";
import { getCurrentLyricLine } from "../lib/lyrics";
import { renderNowPlayingCard, renderOfflineCard } from "../lib/render";

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Never let GitHub's Camo image proxy cache stale "now playing" state.
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1, must-revalidate"
  );

  try {
    const track = await getTrackInfo();

    if (!track) {
      res.status(200).send(renderOfflineCard());
      return;
    }

    const lyricLine = await getCurrentLyricLine(
      track.title,
      track.artist,
      track.durationMs,
      track.progressMs
    );

    const svg = await renderNowPlayingCard({ ...track, lyricLine });
    res.status(200).send(svg);
  } catch (error) {
    console.error("Failed to render now-playing card:", error);
    res.status(200).send(renderOfflineCard("Unable to load playback data"));
  }
}
