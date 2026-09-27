# Worth reading

Notes for maintaining the [Worth reading](https://hayden.dev/reads/) section.

Links to articles worth reading live in `content/reads/`, one file per link, and are shown at [/reads/](https://hayden.dev/reads/). Each has one topic from `data/topics.json`.

## How saving works

```
iOS Shortcut ─┐
              ├─► api.hayden.dev/reads ─► GitHub "save-read" workflow ─► commit ─► deploy.yml
Bookmarklet ──┘   (Worker: checks key)   (fetches title/description)
```

1. The Shortcut or bookmarklet form sends `{url, topic, note}` to the Worker with the reads key.
2. The Worker (`workers/api/src/reads.js`) checks the key and triggers `.github/workflows/save-read.yml`.
3. The workflow runs `scripts/save-read.mjs`, which fetches the article's title and description, writes `content/reads/<date>-<slug>.md`, commits it, and starts the site deploy. Links that are already saved are skipped.

A read can also be added by hand: **Actions → Save a read → Run workflow** (works from the GitHub mobile app too), or by adding a file to `content/reads/`. To edit or remove one, change or delete its file. To mark a read as an all-time favourite, add `favourite: true` to its front matter; it gets a ★ and shows up at [/reads/favourites/](https://hayden.dev/reads/favourites/).

## One-time setup

The Worker is deployed from your machine, and its two secrets are stored in Cloudflare. GitHub needs no secrets: the save workflow uses the built-in `GITHUB_TOKEN`.

| Worker secret | What it is |
|---|---|
| `READS_KEY` | A long random string; the Shortcut and bookmarklet form send it. Generate with `openssl rand -hex 32`. |
| `GH_DISPATCH_TOKEN` | A [fine-grained token](https://github.com/settings/personal-access-tokens/new) for this repo only, with **Contents: Read and write**. The Worker uses it to start the workflow. |

```bash
npm run worker:login   # if wrangler isn't logged in
npx wrangler secret put READS_KEY --config workers/api/wrangler.toml
npx wrangler secret put GH_DISPATCH_TOKEN --config workers/api/wrangler.toml
npm run worker:deploy
```

Secrets persist across deploys, so this is only needed once (or when rotating a key). After changing anything in `workers/` or `data/topics.json`, run `npm run worker:deploy`.

## iOS Shortcut

Create a Shortcut named **Worth reading** with **Show in Share Sheet** turned on (receives URLs and Safari web pages):

1. **Get URLs from** Shortcut Input
2. **List**: `engineering`, `leadership`, `ai`, `life` → **Choose from List** (prompt: "Topic")
3. **Ask for Input** (Text, prompt: "Note (optional)")
4. **Get Contents of URL** `https://api.hayden.dev/reads`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <READS_KEY>`
   - Request Body: **JSON** with `url` = URLs, `topic` = Chosen Item, `note` = Provided Input
5. **Get Dictionary Value** `message` from Contents of URL → **Show Notification** with Dictionary Value

Simpler alternative: **URL Encode** the Shortcut Input, then **Open URLs** `https://api.hayden.dev/reads/new?url=<URL Encoded Text>` to open the same form the bookmarklet uses.

## Bookmarklet

Add a bookmark with this as the URL. It opens a small save form; enter the reads key the first time and the form remembers it on that device.

```
javascript:(()=>{window.open('https://api.hayden.dev/reads/new?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'save-read','width=520,height=640')})()
```

## Adding a topic

Add it to `data/topics.json` and to the `options` list in `.github/workflows/save-read.yml`, then add it to the Shortcut's list. Run `npm run worker:deploy` so the Worker accepts it; until then, saves with the new topic are rejected.
