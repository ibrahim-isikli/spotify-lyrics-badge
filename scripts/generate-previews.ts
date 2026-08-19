/**
 * Generates realistic sample SVG cards for the README preview gallery by
 * exercising the real render pipeline (lib/render.ts) against mock data,
 * instead of hand-authoring static SVGs that could drift from the actual
 * output. Run with: npm run generate:previews
 */
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderNowPlayingCard, renderOfflineCard } from "../lib/render";

const ASSETS_DIR = path.join(__dirname, "..", "assets");

// --- Minimal dependency-free PNG encoder, used to synthesize a placeholder
// album cover (a brand-colored gradient) so the preview doesn't depend on
// fetching or committing any real, copyrighted artwork. -------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function buildGradientAlbumArtPng(size = 300): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let offset = 0;

  // Diagonal gradient from the brand accent green to near-black.
  const from = { r: 30, g: 215, b: 96 };
  const to = { r: 18, g: 18, b: 18 };

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (size * 2);
      raw[offset++] = Math.round(from.r + (to.r - from.r) * t);
      raw[offset++] = Math.round(from.g + (to.g - from.g) * t);
      raw[offset++] = Math.round(from.b + (to.b - from.b) * t);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Preview generation ----------------------------------------------------

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });

  const albumArt = buildGradientAlbumArtPng();

  // renderNowPlayingCard() downloads albumImageUrl and inlines it as base64,
  // exactly like it would in production — so we serve the placeholder art
  // from a throwaway local HTTP server rather than faking that step.
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(albumArt);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start local preview asset server");
  }
  const albumImageUrl = `http://127.0.0.1:${address.port}/album.png`;

  try {
    const playingSvg = await renderNowPlayingCard({
      isPlaying: true,
      title: "Midnight City Lights",
      artist: "Nova Ray",
      albumImageUrl,
      progressMs: 96_000,
      durationMs: 214_000,
      songUrl: null,
      lyricLine: "we're chasing neon shadows down the boulevard",
    });

    const offlineSvg = renderOfflineCard("Nothing Playing");

    await writeFile(
      path.join(ASSETS_DIR, "playing-with-lyrics.svg"),
      playingSvg,
      "utf8"
    );
    await writeFile(
      path.join(ASSETS_DIR, "idle-offline.svg"),
      offlineSvg,
      "utf8"
    );

    console.log("Generated preview cards:");
    console.log(`  assets/playing-with-lyrics.svg (${playingSvg.length} bytes)`);
    console.log(`  assets/idle-offline.svg (${offlineSvg.length} bytes)`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error("Failed to generate preview cards:", error);
  process.exitCode = 1;
});
