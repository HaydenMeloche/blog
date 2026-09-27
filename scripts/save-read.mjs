// Saves a read for Worth reading (/reads/): fetches the article's metadata and writes
// content/reads/<date>-<slug>.md. Run by .github/workflows/save-read.yml with
// READ_URL, READ_TOPIC and (optionally) READ_NOTE set. READ_DATE (any date
// or ISO timestamp) backdates the read, e.g. when importing older links.
//
// Local test: READ_URL=https://example.com READ_TOPIC=engineering node scripts/save-read.mjs

import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const READS_DIR = new URL("content/reads/", ROOT);
const TOPICS = JSON.parse(await readFile(new URL("data/topics.json", ROOT), "utf8"));
const TIME_ZONE = "America/Toronto";
const USER_AGENT = "Mozilla/5.0 (compatible; hayden.dev-reads/1.0; +https://hayden.dev/reads/)";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v).replace(/\n/g, " ")}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, lines.join(""));
}

// Drops the #fragment and tracking parameters so the same article isn't saved twice.
function normalizeURL(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    fail(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail(`Only http(s) URLs can be saved: ${raw}`);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid|ref_src)$/i.test(key)) url.searchParams.delete(key);
  }
  return url;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function clean(text) {
  return text ? decodeEntities(text).replace(/\s+/g, " ").trim() : "";
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max).replace(/[\s,.;:]+$/, "") + "…";
}

// Reads <meta> tags keyed by property/name, plus <title>. First occurrence wins.
function parseMetadata(html) {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 500_000);
  const meta = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const [, name, , dq, sq, bare] of tag.matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare;
    }
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = clean(attrs.content);
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return { meta, title: title ? clean(title[1]) : "" };
}

// Titles of bot-check and error interstitials, which say nothing about the article
const INTERSTITIAL = /^(just a moment|making sure you'?re not a bot|attention required|access denied|verifying you are human|are you a robot|403 forbidden|page not found)\b/i;

// "Git at any scale · Cursor" → "Git at any scale", when the suffix is the site's name
function stripSiteName(title, url, siteName) {
  const match = title.match(/^(.{8,})\s+[|·•—–-]\s+(.+?)$/);
  if (!match) return title;
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = squash(match[2]);
  const host = squash(url.hostname.replace(/^www\./, "").split(".").slice(-2, -1)[0] || "");
  const site = squash(siteName);
  const isSite = suffix && ((site && (suffix.includes(site) || site.includes(suffix))) || (host.length > 2 && (suffix.includes(host) || host.includes(suffix))));
  return isSite ? match[1].trim() : title;
}

async function fetchMetadata(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get("content-type") || "").includes("html")) throw new Error("not an HTML page");
    const metadata = parseMetadata(await res.text());
    if (INTERSTITIAL.test(metadata.meta["og:title"] || metadata.title)) throw new Error("got a bot-check page");
    return metadata;
  } catch (err) {
    console.warn(`::warning::Couldn't read ${url.href} (${err.message}); saving with the URL as the title.`);
    return { meta: {}, title: "" };
  }
}

// Local wall-clock time in TIME_ZONE, e.g. { day: "2026-09-27", iso: "2026-09-27T09:14:00-04:00" }.
function localTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  return { day, iso: `${day}T${parts.hour}:${parts.minute}:${parts.second}${offset}` };
}

function slugify(text) {
  const slug = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length <= 60) return slug;
  const cut = slug.slice(0, 60);
  return cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut;
}

// JSON strings are valid YAML double-quoted strings.
const yaml = (value) => JSON.stringify(value);

const url = normalizeURL(process.env.READ_URL);
const topic = String(process.env.READ_TOPIC || "").trim().toLowerCase();
const note = String(process.env.READ_NOTE || "").trim();
if (!TOPICS.includes(topic)) fail(`Unknown topic "${topic}". Expected one of: ${TOPICS.join(", ")}`);

for (const name of await readdir(READS_DIR)) {
  if (!name.endsWith(".md") || name === "_index.md") continue;
  const existing = await readFile(new URL(name, READS_DIR), "utf8");
  if (existing.includes(`link: ${yaml(url.href)}\n`)) {
    console.log(`Already saved as content/reads/${name}; nothing to do.`);
    await setOutputs({ saved: false });
    process.exit(0);
  }
}

const { meta, title: htmlTitle } = await fetchMetadata(url);
const domain = url.hostname.replace(/^www\./, "");
const source = meta["og:site_name"] || "";
const pageTitle = meta["og:title"] || meta["twitter:title"] || htmlTitle;
const title = pageTitle ? stripSiteName(pageTitle, url, source) : `${domain}${url.pathname === "/" ? "" : url.pathname}`;
let description = truncate(meta["og:description"] || meta["twitter:description"] || meta.description || "", 400);
if (description.toLowerCase() === title.toLowerCase()) description = "";
const published = (meta["article:published_time"] || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
let image = "";
try {
  if (meta["og:image"]) image = new URL(meta["og:image"], url).href;
} catch {}

const savedAt = process.env.READ_DATE ? new Date(process.env.READ_DATE) : new Date();
if (Number.isNaN(savedAt.getTime())) fail(`Not a valid READ_DATE: ${process.env.READ_DATE}`);
const now = localTime(savedAt);
const slug = slugify(title) || slugify(url.pathname) || "read";
let file = `${now.day}-${slug}.md`;
for (let n = 2; existsSync(new URL(file, READS_DIR)); n++) file = `${now.day}-${slug}-${n}.md`;

const frontMatter = [
  `title: ${yaml(title)}`,
  `link: ${yaml(url.href)}`,
  source && `source: ${yaml(source)}`,
  `domain: ${yaml(domain)}`,
  `date: ${now.iso}`,
  published && `source_date: ${published}`,
  description && `description: ${yaml(description)}`,
  image && `image: ${yaml(image)}`,
  `topics: [${yaml(topic)}]`,
].filter(Boolean);

await writeFile(new URL(file, READS_DIR), `---\n${frontMatter.join("\n")}\n---\n${note ? `${note}\n` : ""}`);
console.log(`Saved content/reads/${file}: ${title}`);
await setOutputs({ saved: true, file: `content/reads/${file}`, title });
