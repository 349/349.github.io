# Content authoring & publishing guide

Everything you need to add to the site without re-deriving the conventions. Two audiences: **John** (editing directly) and **Architectonic** (dropping public-safe drafts in). If you follow the frontmatter contract below, publishing is mechanical.

---

## The 30-second version

1. Put a Markdown file in the right section folder under `content/`.
2. Give it the frontmatter for its type (see below).
3. Commit and push. GitHub Actions builds and deploys automatically — no Hugo needed on your machine.

---

## Where files go

| Content type | Folder | URL becomes |
|---|---|---|
| Essay / blog | `content/essays/` | `/essays/<slug>/` |
| Favorite poem | `content/poems/` | `/poems/<slug>/` |
| Vulgate text + audio | `content/vulgate/` | `/vulgate/<slug>/` |
| Etymology note | `content/etymology/` | `/etymology/<slug>/` |
| Photo collection | `content/photography/<name>/index.md` + images | `/photography/<name>/` |
| Standalone page (e.g. About) | `content/<name>.md` | `/<name>/` |

The **home page** feed is generated automatically from every entry in a section folder, newest first. Standalone pages (like About) do **not** appear in the feed.

---

## Frontmatter contract

Every entry starts with a YAML block between `---` fences.

**Required on every entry**

```yaml
title: "Human Title"
date: 2026-07-03        # YYYY-MM-DD — controls feed order
summary: "One or two sentences. Used in the home feed AND as the meta description."
tags: ["tag-one", "tag-two"]
```

**Optional, useful**

```yaml
lede: "A subtitle shown under the title on the page."
kicker: "A small uppercase label above the title (e.g. a poet's name)."
draft: true             # keeps it out of the built site until removed
```

### Tag conventions

- Lowercase, hyphenated: `anglican-music`, `public-domain`, `george-herbert`.
- Tags are the connective tissue of the garden. Reuse existing tags before inventing new ones.
- Every tag automatically gets a page at `/tags/<tag>/` and is clickable in the home filter bar.
- Good tag families so far: *poetry, etymology, vulgate, latin, greek, devotional, public-domain, church.*

---

## The three specialized formats

### Poems — `content/poems/`

Use the `poem` shortcode so line breaks and stanza spacing are preserved:

```markdown
{{< poem attribution="George Herbert, *The Elixir* (1633). Public domain." >}}
Teach me, my God and King,
In all things Thee to see,
{{< /poem >}}
```

**Copyright:** prefer public-domain works (author died 70+ years ago). For in-copyright poems, quote an excerpt only, attribute clearly, and link to a full source — never the whole poem.

### Vulgate text + audio — `content/vulgate/`

1. Drop the recording in `static/audio/` (e.g. `static/audio/psalmus-22.mp3`).
2. Reference it with the `audio` shortcode; wrap the Latin in the text block:

```markdown
{{< audio src="/audio/psalmus-22.mp3" title="Read aloud" >}}

<div class="textaudio__latin">

Dominus regit me, et nihil mihi deerit:
in loco pascuae ibi me collocavit.

</div>
```

Keep a blank line between stanzas. The Clementine Vulgate text is public domain; note where each recording came from.

### Photo collections — `content/photography/<name>/`

A collection is a **folder**, not a single file:

```
content/photography/venice/
  index.md          ← frontmatter + intro + {{< gallery >}}
  01-canal.jpg
  02-facade.jpg
```

In `index.md`:

```markdown
---
title: "Venice"
date: 2026-07-03
summary: "Stone and water."
tags: ["photography", "architecture"]
---

A sentence on the set.

{{< gallery >}}
```

`{{< gallery >}}` picks up every image in the folder, generates lazy-loaded thumbnails, and links each to the full image. Add `match="*.jpg"` to filter.

---

## Publish gate — the privacy wall in practice

**Everything committed here is public.** Before any entry ships, it must pass this check (hold and ask if any answer is "yes/unsure"):

- [ ] No `private: true` and nothing sourced from the private vault.
- [ ] No names or contact details of private individuals.
- [ ] No journal, academic, administrative, financial, or medical-personal content.
- [ ] No vault file paths, secrets, tokens, or API keys.
- [ ] Copyright is handled (public domain, or excerpt + attribution).
- [ ] It is something deliberately chosen for a public audience — curation over accumulation.

When in doubt, **hold it and ask.** The privacy wall wins over every other consideration.

---

## Architectonic handoff contract

When Architectonic prepares a draft for publication, it should deliver a file that is **ready to drop in with zero cleanup**:

1. **Location:** place the file directly in the correct `content/<section>/` folder (or `content/_inbox/` if the section is uncertain — see below).
2. **Format:** plain Markdown with the frontmatter contract above already filled in (`title`, `date`, `summary`, `tags` at minimum).
3. **Public-safe:** already passed the publish gate above. Architectonic is the editor-in-chief; nothing private should ever reach this folder in the first place.
4. **Self-contained:** any images or audio included alongside (in the entry's bundle folder or `static/`), with attribution/licensing noted in the body or frontmatter.
5. **`draft: true`** if it's a work-in-progress that shouldn't publish yet.

**Optional staging inbox:** if you want a review step, drop drafts in `content/_inbox/` (git-ignored from the build via a leading underscore is *not* automatic — instead mark them `draft: true`). Simplest is: `draft: true` until John says ship.

**What makes a draft "ready":** correct folder, complete frontmatter, passes the publish gate, copyright handled, and it reads as a finished public artifact — not a note-to-self.
