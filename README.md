# RisoRead

**Your shelf, on whatever you are holding.**

RisoRead is the reading half of [RisoDesk](../RisoDesk), on its own. PDFs and
EPUBs kept in the cloud, opening at the page you left, on a phone, a tablet or a
desktop — signed in with the same account, reading the same database, showing
the same shelf.

---

## What it is

RisoDesk is a research workspace: a library of papers, screening, evidence
cards, a manuscript, a citation graph. Its shelf of books was the part people
opened on a phone in bed, and it did not need the other seven tools standing
around it.

So it is here on its own. Not a copy of the data — **the same data**. One
Supabase project, one set of accounts, one set of books. A book added in either
application appears in both. A page you stop on here is the page RisoDesk opens
at. Your plan, your storage allowance and the people you share a shelf with are
the same in both, because there is only one account.

| | |
| --- | --- |
| **The shelf** | A grid of covers, in folders four levels deep, with tags suggested by Claude when you want them. Drag a cover onto a folder, or file it with a select — both work, because one of them has to work on a phone. |
| **The reader** | Focus mode fills the screen; tap the edges or swipe to turn pages. Text size, line spacing, measure, typeface and page tint for EPUBs; fit and zoom for PDFs. All server-rendered, all working before any script arrives. |
| **Your place in it** | Reading position, bookmarks and the notes on them are yours alone. A shared shelf, but not a shared place in it — enforced by the database, not by the interface. |

---

## The one thing to get right

**Point it at RisoDesk's Supabase project.** That is the whole design. Pointed
at a project of its own, you get a second, empty application that happens to
look the same.

RisoRead owns **no migrations**. Every table it reads — `books`, `book_folders`,
`reading_progress`, `bookmarks`, `memberships`, `orgs`, `profiles`,
`activity_days`, `plan_limits` — is defined in
[`RisoDesk/supabase/migrations`](../RisoDesk/supabase/migrations). Schema
changes are made there and RisoRead picks them up, which is what stops the two
applications from drifting into disagreeing about the same rows.

Point `R2_BUCKET` at the same bucket too. Rows store an object path and never a
URL, so a file uploaded by either application is readable by both.

---

## Quick start

Needs RisoDesk's Supabase stack running.

```bash
cd ../RisoDesk && npx supabase start    # from the RisoDesk repo root
```

```bash
cd app
cp .env.example .env.local              # paste the keys supabase start printed
npm install
npm run dev -- --port 3100
```

| | |
| --- | --- |
| RisoRead | http://localhost:3100 |
| RisoDesk | http://localhost:3000 |
| Supabase Studio | http://localhost:54323 |
| Auth emails | http://localhost:54324 |

Port 3100 rather than 3000 so both applications can run at once, which is how
you actually check that a change in one is visible in the other.

`ANTHROPIC_API_KEY` is optional and only used to suggest tags for a book;
without it, uploads still work and suggestion is skipped. R2 credentials are
optional too — without them, files go to Supabase Storage, which the local stack
already runs.

```bash
npm run verify      # typecheck · lint · build
```

### From another machine

```bash
npm run dev:remote   # auto-detects your Tailscale address
```

This exists because `NEXT_PUBLIC_SUPABASE_URL` is compiled into the browser
bundle: left at `127.0.0.1`, a remote browser resolves it to *its own*
localhost, and the app loads while every query fails.

---

## How it is put together

Next.js App Router, server components, Server Actions. The rule the whole
application follows is that **a page of a book must render without client
JavaScript**, because a reader that needs hydration to show a paragraph is a
blank screen when hydration fails — and on a phone, over a flaky connection, it
does.

So: page turns are plain anchors, not fetches. EPUB chapters are unzipped and
sanitised on the server. PDF pages are rasterised to images on the server, which
is also what fixed iOS Safari refusing to scroll a PDF in an iframe. Reading
preferences are set as CSS custom properties during the server render, so the
first paint is already at the right text size and nothing reflows.

Where scripts do run, they are enhancements over something that already worked:
drag-to-file a book, per-file upload progress, swipe to turn a page.

```
app/src/
  app/
    books/          the shelf, the reader, upload, asset and page-image routes
    login/          sign in and sign up, as a Server Action
    settings/       account, reading, usage, data
    welcome/        the landing page, privacy, terms
    manifest.webmanifest/   generated, so there is no binary icon in the repo
  components/       shelf and reader UI
  lib/
    books/          EPUB parsing, ingest, reading preferences
    storage/        R2, with a Supabase Storage fallback
    billing/        plan limits, enforced at the write
    supabase/       request-scoped and service-role clients
```

---

## Installing it on a phone

RisoRead is a progressive web app. Opened in Safari or Chrome and added to the
home screen, it launches without browser chrome, keeps its session, and reads
the same shelf.

**Native iOS and Android applications are not built.** They would be a separate
codebase against this same Supabase project, and the reason to build them is
offline reading: a web app on iOS cannot reliably hold a few hundred megabytes
of books through an eviction, and cannot download in the background. Everything
the native apps would need on the server side is already here — the auth, the
schema, the storage layout, the signed URLs — so that work is additive rather
than a rewrite.

---

## What was deliberately left out

RisoDesk's library, discovery, screening, evidence cards, manuscripts, matrix,
citation graph, QR codes, short links, business cards and admin console are all
absent. None of them are part of reading a book. The one seam where they show
through is honest rather than hidden: the activity heatmap on the usage page
counts a day you spent screening papers in RisoDesk, because it is one account's
year and not one application's.
