// Records screens.html scene by scene and lays the narration under it.
//
// Usage: node record.mjs <audio_dir> <out.mp4> [narration.json] [page.html]
//   <audio_dir> holds <scene>.wav and durations.json from make_audio.py.
//
// Each scene lasts as long as its narration (plus a short pause) or its on-screen
// actions, whichever is longer. Scene start times are measured while recording and
// used to place each narration clip, so audio and video stay in step.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// CommonJS require so a globally installed playwright resolves too.
const { chromium } = createRequire(import.meta.url)("playwright");
const [audioDir, outFile, narrationFile = join(here, "narration.json"), pageFile = join(here, "screens.html")] = process.argv.slice(2).map((p) => resolve(p));
const narration = JSON.parse(readFileSync(narrationFile, "utf8"));
const durations = JSON.parse(readFileSync(join(audioDir, "durations.json"), "utf8"));
const PAUSE = 900; // ms of silence after each narration clip
const W = 1600, H = 900;

const videoDir = mkdtempSync(join(tmpdir(), "v1video-"));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
const t0 = Date.now();
const page = await context.newPage();
await page.goto(pathToFileURL(pageFile).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

const starts = [];
for (const scene of narration) {
  const start = Date.now();
  starts.push({ id: scene.id, at: start - t0 });
  const minMs = durations[scene.id] * 1000 + PAUSE;
  await Promise.all([page.evaluate((id) => window.director.run(id), scene.id), page.waitForTimeout(minMs)]);
  const took = Date.now() - start;
  console.log(`${scene.id.padEnd(14)} start ${(start - t0) / 1000}s  narration ${durations[scene.id]}s  scene ${took / 1000}s`);
}
await page.waitForTimeout(1500);
const endAt = Date.now() - t0;
await context.close();
await browser.close();

const webm = join(videoDir, readdirSync(videoDir).find((f) => f.endsWith(".webm")));
const args = ["-y", "-i", webm];
narration.forEach((s) => args.push("-i", join(audioDir, s.id + ".wav")));
const delays = starts.map((s, i) => `[${i + 1}:a]adelay=${s.at}|${s.at}[a${i}]`).join(";");
const mix = starts.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${starts.length}:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[aout]`;
args.push(
  "-filter_complex", `${delays};${mix}`,
  "-map", "0:v", "-map", "[aout]",
  "-t", String(endAt / 1000),
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
  outFile,
);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
console.log("wrote", outFile, `(${(endAt / 1000).toFixed(1)}s)`);
