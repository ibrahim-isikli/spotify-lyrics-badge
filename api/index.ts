import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getNowPlaying } from "../lib/spotify";
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
    const nowPlaying = await getNowPlaying();

    if (!nowPlaying) {
      res.status(200).send(renderOfflineCard());
      return;
    }

    const lyricLine = await getCurrentLyricLine(
      nowPlaying.title,
      nowPlaying.artist,
      nowPlaying.durationMs,
      nowPlaying.progressMs
    );

    const svg = await renderNowPlayingCard({ ...nowPlaying, lyricLine });
    res.status(200).send(svg);
  } catch (error) {
    console.error("Failed to render Spotify now-playing card:", error);
    res.status(200).send(renderOfflineCard("Unable to load Spotify data"));
  }
}
