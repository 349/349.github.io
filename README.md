# Website project — start here

This folder is the **entire world** of the Website project. You are scoped to `website/` only; the private Architectonic vault lives in the parent folder and is **out of reach by design.** Do not try to reach out of this folder.

**Everything here is public.** This project builds and publishes John Smith's personal website (Hugo → GitHub Pages, pushed from desktop). There is no private section and no private data — see the privacy wall in the brief.

## Read first
- **`_brief/RFP-Personal-Website.md`** — your founding brief and standing orders. Read it fully before doing anything else.

## Ground rules (summary — the brief governs)
1. **Public-only, curated-only.** Nothing personal, private, or sensitive ever enters this folder or a commit. When in doubt, hold and ask.
2. **This folder has its own isolated git repo.** Everything you commit/push is public by definition.
3. **Stack is fixed:** Hugo + GitHub Pages + desktop push. Custom dark-mode design, not a stock theme.
4. **Content arrives from Architectonic** as public-safe Markdown drafts placed in this folder. You publish; you never read the vault.

## Suggested custom instructions for this Cowork project
> You build and operate John's personal website. This folder is your only scope. Read `_brief/RFP-Personal-Website.md` at the start of every conversation and follow it with judgment. Everything here is public — never add personal or private content, and treat the privacy wall in the brief as absolute. Stack: Hugo + GitHub Pages, pushed from desktop; custom dark-mode design.

---

## What's in this repo

```
hugo.toml                   site config (sections, tags, menu, RSS)
archetypes/                 templates for `hugo new` entries
assets/css/main.css         the custom dark reading theme
layouts/                    custom templates (baseof, home, single, list, tags…)
layouts/shortcodes/         poem, audio, gallery components
content/                    the writing — one Markdown file per entry
static/                     favicon, and audio/ + images served as-is
.github/workflows/hugo.yml  builds with Hugo and deploys to Pages on every push
CONTENT-GUIDE.md            how to author entries + the Architectonic handoff contract
```

## How deployment works

You **do not need Hugo installed.** Pushing to GitHub triggers a GitHub Actions
workflow that runs Hugo in the cloud and publishes to GitHub Pages. Your only
local tool is `git`:

```
edit / add Markdown  →  git add . && git commit -m "…"  →  git push  →  live in ~1–2 min
```

## First-time GitHub setup (once)

1. Create a **public** repo on GitHub named **`<username>.github.io`** (so the
   site serves at the root: `https://<username>.github.io/`).
2. Point this local repo at it and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<username>/<username>.github.io.git
   git add . && git commit -m "Phase 0: Hugo scaffold, dark theme, About page"
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Set `baseURL` in `hugo.toml` to `https://<username>.github.io/`.
   (The workflow also auto-detects the URL, so this mainly helps local runs.)

Watch the first build under the repo's **Actions** tab.

## Custom domain later (no rework)

Add `static/CNAME` containing just your domain (e.g. `example.com`), set the
domain in **Settings → Pages**, point DNS at GitHub, and update `baseURL`.
Nothing else changes.

## Optional: preview locally

Only if you want a preview before pushing — install Hugo **extended**
(`brew install hugo`), then `hugo server` and open <http://localhost:1313>
(`hugo server -D` includes drafts).

## Adding content

See **`CONTENT-GUIDE.md`** — frontmatter contract, tag conventions, the
poem / audio / gallery components, the publish gate, and the Architectonic
handoff contract.
