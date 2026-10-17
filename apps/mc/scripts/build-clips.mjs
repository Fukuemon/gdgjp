#!/usr/bin/env node
// Builds the MC clip catalogue from the local (gitignored) source folders:
//
//   音声/<track>/*.wav, 音声/*.wav  — TTS output, the source of truth for timing
//   原稿/*.md                      — the script the TTS read, the source of text
//
// For every WAV it encodes public/audio/<id>.mp3 and aligns the script's phrases
// (split at 、。！？) onto the pauses ffmpeg's silencedetect finds, then writes
// app/features/clips/clips.json. Re-run after adding audio:
//
//   pnpm --filter @gdgjp/mc clips
//
// Text that diverges from the audio can be corrected in scripts/overrides.json
// ({ "<clip id>": "<full spoken text>" }); overrides win over the manuscript.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audioDir = join(root, "音声");
const scriptDir = join(root, "原稿");
const outAudioDir = join(root, "public", "audio");
const outJson = join(root, "app", "features", "clips", "clips.json");
const overridesPath = join(root, "scripts", "overrides.json");

const TRACKS = ["A", "B", "C", "D"];
const LOOP_DEFAULT = new Set(["A-01"]);
// Root-level WAVs map onto 原稿/common.md's 【予備-N】 sections by name.
const COMMON = [
  { file: "登壇準備中", n: 1 },
  { file: "オンライン接続確認", n: 2 },
  { file: "機材調整中", n: 3 },
  { file: "まもなく開始", n: 4 },
];

const force = process.argv.includes("--force");

// Transcription occasionally spells English names the way they sound. These
// restore the manuscript's notation; order matters (longest first).
const NOTATION_FIXES = [
  ["公式ハッシュタグはデブフェスト関西", "公式ハッシュタグは#DevFestKansai"],
  ["デブフェスト関西をつけて", "#DevFestKansaiをつけて"],
  ["デブフェスト関西", "DevFest Kansai"],
  ["デブフェスト2026", "DevFest2026"],
  ["グレーター関西", "Greater Kwansai"],
  ["リオン・ジョーンズ", "Llion Jones"],
  ["リオン様", "Llion様"],
  ["ハローワールド1018", "helloworld1018"],
  ["シェリー様", "Sherry様"],
];

function fixNotation(text) {
  return NOTATION_FIXES.reduce((t, [from, to]) => t.replaceAll(from, to), text);
}

function cleanLine(line) {
  return line
    .replace(/\\(.)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^[>\s#-]+/, "")
    .trim();
}

function cleanTitle(raw) {
  let title = cleanLine(raw).replace(/^【[^】]*】|^\[[^\]]*\]/, "");
  // Drop trailing production notes such as "（①再開前＋②呼び込み）" or "(…なし)".
  for (;;) {
    const next = title.replace(/\s*[（(][^（()）]*[)）]\s*$/, "");
    if (next === title) break;
    title = next;
  }
  return title.replace(/\s+/g, " ").trim();
}

/** Split a manuscript into { key → { title, text } } sections. */
function parseSections(md, markerRe) {
  const sections = new Map();
  let current = null;
  for (const rawLine of md.split("\n")) {
    const line = rawLine.replace(/\\/g, "");
    const m = line.match(markerRe);
    if (m) {
      current = { key: m[1], title: cleanTitle(rawLine), lines: [] };
      sections.set(current.key, current);
      continue;
    }
    if (!current) continue;
    if (/^#{1,3}\s/.test(rawLine) || /^#{1,3}\s*$/.test(rawLine)) {
      current = null;
      continue;
    }
    const text = cleanLine(rawLine);
    if (text) current.lines.push(text);
  }
  return new Map([...sections].map(([k, s]) => [k, { title: s.title, text: s.lines.join("") }]));
}

function splitPhrases(text) {
  const phrases = text.match(/[^、。！？!?]+[、。！？!?」』）)]*|[、。！？!?]+/g) ?? [];
  // Fold punctuation-only fragments into the previous phrase.
  const out = [];
  for (const p of phrases) {
    if (out.length > 0 && /^[、。！？!?」』）)]+$/.test(p)) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

function probeDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number.parseFloat(out.trim());
}

function silencesOf(file, duration) {
  // silencedetect logs to stderr; swap the streams so execFileSync returns it.
  const log = execFileSync(
    "sh",
    [
      "-c",
      `ffmpeg -hide_banner -i "$0" -af silencedetect=noise=-40dB:d=0.12 -f null - 2>&1 >/dev/null`,
      file,
    ],
    { encoding: "utf8" },
  );
  const silences = [];
  let start = null;
  for (const line of log.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    if (s) start = Number.parseFloat(s[1]);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (e && start !== null) {
      silences.push({ start, end: Number.parseFloat(e[1]) });
      start = null;
    }
  }
  if (start !== null) silences.push({ start, end: duration });
  return silences;
}

/**
 * Place phrase boundaries on pauses. Each boundary is either matched to one
 * interior silence (monotonic, at most once) or left floating and later
 * interpolated by character count. Classic edit-distance style DP.
 */
function align(phrases, silences, duration) {
  const lead = silences.find((s) => s.start <= 0.01);
  const trail = silences.find((s) => s.end >= duration - 0.01 && s !== lead);
  const speechStart = lead ? lead.end : 0;
  const speechEnd = trail ? trail.start : duration;
  const interior = silences.filter(
    (s) => s !== lead && s !== trail && s.start > speechStart && s.end < speechEnd,
  );

  const speechRegions = [];
  let cursor = speechStart;
  for (const s of interior) {
    speechRegions.push([cursor, s.start]);
    cursor = s.end;
  }
  speechRegions.push([cursor, speechEnd]);
  const totalSpeech = speechRegions.reduce((n, [a, b]) => n + (b - a), 0);
  const speechToAbs = (t) => {
    let left = t;
    for (const [a, b] of speechRegions) {
      if (left <= b - a) return a + left;
      left -= b - a;
    }
    return speechEnd;
  };

  const lengths = phrases.map((p) => [...p].length);
  const totalChars = lengths.reduce((a, b) => a + b, 0);
  const K = phrases.length - 1;
  const M = interior.length;
  const expected = [];
  let acc = 0;
  for (let i = 0; i < K; i++) {
    acc += lengths[i];
    expected.push(speechToAbs((acc / totalChars) * totalSpeech));
  }

  const MISS_BOUNDARY = 0.9;
  const skipSilence = (s) => Math.max(0.05, (s.end - s.start) * 2.5);
  const INF = Number.POSITIVE_INFINITY;
  const dp = Array.from({ length: K + 1 }, () => new Float64Array(M + 1).fill(INF));
  const from = Array.from({ length: K + 1 }, () => new Int8Array(M + 1));
  dp[0][0] = 0;
  for (let i = 0; i <= K; i++) {
    for (let j = 0; j <= M; j++) {
      if (i === 0 && j === 0) continue;
      let best = INF;
      let dir = 0;
      if (i > 0 && j > 0) {
        const mid = (interior[j - 1].start + interior[j - 1].end) / 2;
        const c = dp[i - 1][j - 1] + Math.abs(expected[i - 1] - mid);
        if (c < best) [best, dir] = [c, 1];
      }
      if (j > 0) {
        const c = dp[i][j - 1] + skipSilence(interior[j - 1]);
        if (c < best) [best, dir] = [c, 2];
      }
      if (i > 0) {
        const c = dp[i - 1][j] + MISS_BOUNDARY;
        if (c < best) [best, dir] = [c, 3];
      }
      dp[i][j] = best;
      from[i][j] = dir;
    }
  }
  const matched = new Array(K).fill(null);
  for (let i = K, j = M; i > 0 || j > 0; ) {
    const dir = from[i][j];
    if (dir === 1) {
      matched[i - 1] = interior[j - 1];
      i--;
      j--;
    } else if (dir === 2) j--;
    else i--;
  }

  // Boundary k sits between phrase k and k+1: [endOfPhrase, startOfNext].
  const bounds = matched.map((s) => (s ? [s.start, s.end] : null));
  // Interpolate floating boundaries between their matched neighbours by chars.
  const anchors = [
    { idx: -1, t: speechStart, chars: 0 },
    ...bounds.flatMap((b, k) =>
      b
        ? [
            {
              idx: k,
              t: (b[0] + b[1]) / 2,
              chars: lengths.slice(0, k + 1).reduce((x, y) => x + y, 0),
            },
          ]
        : [],
    ),
    { idx: K, t: speechEnd, chars: totalChars },
  ];
  for (let k = 0; k < K; k++) {
    if (bounds[k]) continue;
    const chars = lengths.slice(0, k + 1).reduce((x, y) => x + y, 0);
    const prev = [...anchors].reverse().find((a) => a.idx < k);
    const next = anchors.find((a) => a.idx > k);
    const t = prev.t + ((chars - prev.chars) / (next.chars - prev.chars)) * (next.t - prev.t);
    bounds[k] = [t, t];
  }

  const segments = phrases.map((text, k) => ({
    s: Math.round((k === 0 ? speechStart : bounds[k - 1][1]) * 1000),
    e: Math.round((k === K ? speechEnd : bounds[k][0]) * 1000),
    t: text,
  }));
  const matchedCount = matched.filter(Boolean).length;
  return {
    segments,
    stats: {
      cps: totalChars / Math.max(totalSpeech, 0.001),
      matched: K === 0 ? 1 : matchedCount / K,
      unusedPauses: interior.filter((s) => s.end - s.start > 0.35 && !matched.includes(s)).length,
    },
  };
}

function encodeMp3(wav, id) {
  const out = join(outAudioDir, `${id}.mp3`);
  if (existsSync(out) && !force) return;
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    wav,
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "64k",
    out,
  ]);
}

/** Every WAV paired with its manuscript section (shared with transcribe.mjs). */
export function listJobs() {
  const jobs = [];
  const common = parseSections(
    readFileSync(join(scriptDir, "common.md"), "utf8"),
    /【予備-(\d+)】/,
  );
  for (const { file, n } of COMMON) {
    const wav = join(audioDir, `${file}.wav`);
    if (!existsSync(wav)) continue;
    const section = common.get(String(n));
    jobs.push({ id: `X-${String(n).padStart(2, "0")}`, track: null, file, wav, section });
  }
  for (const track of TRACKS) {
    const dir = join(audioDir, `track${track}`);
    const mdPath = join(scriptDir, `track${track}.md`);
    if (!existsSync(dir) || !existsSync(mdPath)) continue;
    const sections = parseSections(
      readFileSync(mdPath, "utf8"),
      new RegExp(`\\[(${track}-\\d+)\\]`, "i"),
    );
    const wavs = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .sort();
    for (const name of wavs) {
      const file = basename(name, ".wav");
      // "04_1050" → A-04, "B-03" / "c-03" → B-03 / C-03.
      const num = file.match(/^(?:[a-z]-)?(\d+)/i)?.[1];
      if (!num) {
        console.warn(`skip ${track}/${name}: no clip number`);
        continue;
      }
      const id = `${track}-${num.padStart(2, "0")}`;
      jobs.push({ id, track, file, wav: join(dir, name), section: sections.get(id) });
    }
  }
  return jobs;
}

function main() {
  if (!existsSync(audioDir) || !existsSync(scriptDir)) {
    console.error("音声/ と 原稿/ が apps/mc 直下に必要です");
    process.exit(1);
  }
  mkdirSync(outAudioDir, { recursive: true });
  mkdirSync(dirname(outJson), { recursive: true });
  const overrides = existsSync(overridesPath)
    ? JSON.parse(readFileSync(overridesPath, "utf8"))
    : {};

  const jobs = listJobs();

  const clips = [];
  const report = [];
  for (const job of jobs) {
    const raw = overrides[job.id] ?? job.section?.text;
    const text = raw ? fixNotation(raw) : raw;
    if (!text) {
      console.warn(`skip ${job.id} (${job.file}): no manuscript section`);
      continue;
    }
    encodeMp3(job.wav, job.id);
    const duration = probeDuration(job.wav);
    const { segments, stats } = align(splitPhrases(text), silencesOf(job.wav, duration), duration);
    clips.push({
      id: job.id,
      track: job.track,
      file: job.file,
      title: job.section?.title ?? job.file,
      src: `/audio/${job.id}.mp3`,
      durationMs: Math.round(duration * 1000),
      loop: LOOP_DEFAULT.has(job.id),
      segments,
    });
    report.push({ id: job.id, ...stats });
  }

  writeFileSync(outJson, `${JSON.stringify({ clips }, null, 2)}\n`);
  console.log(`wrote ${clips.length} clips → ${outJson}`);
  const cps = report.map((r) => r.cps).sort((a, b) => a - b);
  const median = cps[Math.floor(cps.length / 2)];
  for (const r of report) {
    const suspicious =
      Math.abs(r.cps - median) / median > 0.18 || r.matched < 0.7 || r.unusedPauses > 2;
    console.log(
      `${suspicious ? "⚠" : " "} ${r.id}  ${r.cps.toFixed(2)} chars/s  matched ${(r.matched * 100).toFixed(0)}%  unused long pauses ${r.unusedPauses}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
