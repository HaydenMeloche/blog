// Worth reading (/reads/) capture. The Worker only authenticates and forwards; the
// save-read GitHub Actions workflow fetches the article and commits it.
//
//   GET  /reads/new?url=&title=  save form (opened by the bookmarklet)
//   POST /reads                  {url, topic, note?} with "Authorization: Bearer <READS_KEY>"
//
// Secrets: READS_KEY (shared with the Shortcut/bookmarklet form) and
// GH_DISPATCH_TOKEN (fine-grained PAT for the blog repo, Contents: read and write).
import TOPICS from "../../../data/topics.json";

const REPO = "HaydenMeloche/blog";
const MAX_NOTE = 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Constant-time so the key can't be guessed byte by byte from response timing
function keyMatches(given, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return !crypto.subtle.timingSafeEqual(b, b);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function save(request, env) {
  if (!env.READS_KEY || !env.GH_DISPATCH_TOKEN) return json({ message: "Saving isn't configured" }, 503);

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || !keyMatches(auth.slice(7).trim(), env.READS_KEY)) {
    return json({ message: "Wrong key" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ message: "Expected a JSON body" }, 400);
  }

  let url;
  try {
    url = new URL(String(body.url || "").trim());
  } catch {
    return json({ message: "That isn't a valid URL" }, 400);
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.href.length > 2048) {
    return json({ message: "Only http(s) links can be saved" }, 400);
  }

  const topic = String(body.topic || "").trim().toLowerCase();
  if (!TOPICS.includes(topic)) return json({ message: `Topic must be one of: ${TOPICS.join(", ")}` }, 400);

  const note = String(body.note || "").trim();
  if (note.length > MAX_NOTE) return json({ message: `Keep the note under ${MAX_NOTE} characters` }, 400);

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "hayden.dev-reads",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ event_type: "save-read", client_payload: { url: url.href, topic, note } }),
  });

  if (!res.ok) {
    console.error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
    return json({ message: `GitHub rejected the save (HTTP ${res.status})` }, 502);
  }
  return json({ message: "Saved. It'll be on hayden.dev/reads in a couple of minutes." }, 202);
}

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function form(requestURL) {
  const url = requestURL.searchParams.get("url") || "";
  const title = requestURL.searchParams.get("title") || "";
  const topics = TOPICS.map(
    (t, i) => `<label class="topic"><input type="radio" name="topic" value="${t}"${i === 0 ? " checked" : ""}> ${t}</label>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Save to Worth reading</title>
<style>
  :root { --bg: #faf9f5; --panel: #fff; --border: #e7e3d8; --text: #1c1b18; --muted: #6f6b60; --accent: #c2410c; --accent-soft: #f6e7dd; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #171614; --panel: #1d1b18; --border: #39352e; --text: #f1eee7; --muted: #aaa397; --accent: #f17a45; --accent-soft: #3a241a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 16px; background: var(--bg); color: var(--text); font: 15px/1.5 ui-monospace, "SFMono-Regular", Menlo, monospace; }
  main { max-width: 460px; margin: 0 auto; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .page-title { color: var(--muted); margin: 0 0 20px; overflow-wrap: anywhere; }
  label { display: block; margin-bottom: 16px; }
  .field-label { display: block; color: var(--muted); font-size: 13px; margin-bottom: 4px; }
  input[type=url], input[type=password], textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); font: inherit; }
  textarea { min-height: 84px; resize: vertical; }
  fieldset { border: 0; padding: 0; margin: 0 0 16px; }
  .topics { display: flex; flex-wrap: wrap; gap: 8px; }
  .topic { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
  .topic:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .topic input { margin: 0; accent-color: var(--accent); }
  button { padding: 9px 16px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  #status { margin-top: 14px; min-height: 1.5em; }
  #status.error { color: var(--accent); }
  .forget { background: none; color: var(--muted); padding: 0; font-weight: 400; font-size: 13px; text-decoration: underline; }
</style>
</head>
<body>
<main>
  <h1>Save to Worth reading</h1>
  <p class="page-title">${escapeHTML(title || url || "Paste a link below.")}</p>
  <form id="save">
    <label><span class="field-label">Link</span><input type="url" name="url" required value="${escapeHTML(url)}"></label>
    <fieldset><legend class="field-label">Topic</legend><div class="topics">${topics}</div></fieldset>
    <label><span class="field-label">Note (optional)</span><textarea name="note" maxlength="${MAX_NOTE}" placeholder="Why is it worth reading?"></textarea></label>
    <label id="key-field" hidden><span class="field-label">Key (remembered on this device)</span><input type="password" name="key" autocomplete="current-password"></label>
    <button type="submit">Save</button>
    <button type="button" class="forget" id="forget" hidden>forget key</button>
  </form>
  <p id="status" role="status"></p>
</main>
<script>
  const form = document.getElementById("save");
  const status = document.getElementById("status");
  const keyField = document.getElementById("key-field");
  const forget = document.getElementById("forget");
  const read = () => { try { return localStorage.getItem("reads-key") || ""; } catch (_) { return ""; } };
  const remember = (k) => { try { k ? localStorage.setItem("reads-key", k) : localStorage.removeItem("reads-key"); } catch (_) {} };
  const showKey = () => { const has = !!read(); keyField.hidden = has; forget.hidden = !has; form.key.required = !has; };
  showKey();
  forget.addEventListener("click", () => { remember(""); showKey(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = read() || form.key.value.trim();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.className = "";
    status.textContent = "Saving…";
    try {
      const res = await fetch("/reads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ url: form.url.value, topic: form.topic.value, note: form.note.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { remember(""); showKey(); }
      if (!res.ok) throw new Error(body.message || "Something went wrong (HTTP " + res.status + ")");
      remember(key);
      showKey();
      status.textContent = body.message;
      if (window.opener) setTimeout(() => window.close(), 1500);
    } catch (err) {
      status.className = "error";
      status.textContent = err.message;
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function handleReads(request, env) {
  const requestURL = new URL(request.url);
  const path = requestURL.pathname.replace(/\/+$/, "");

  if (path === "/reads/new") {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    return form(requestURL);
  }
  if (path === "/reads") {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    return save(request, env);
  }
  return new Response("Not found", { status: 404 });
}
