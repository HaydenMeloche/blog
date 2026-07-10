# hayden.dev

Personal blog built with [Hugo](https://gohugo.io/).

**Live site:** [https://hayden.dev](https://hayden.dev)

Prefer reading on GitHub? Posts are plain markdown:

- [How EFT payment files work in Canada](content/posts/how-eft-payment-files-work-in-canada.md)

## Local development

Requires Hugo extended (v0.154.5 or similar).

```bash
hugo server -D
```

Open [http://localhost:1313](http://localhost:1313).

To build the production output locally:

```bash
hugo --minify
```

Output goes to `public/`.

## Content

Posts live in `content/posts/`. Site config is in `config.toml`.
