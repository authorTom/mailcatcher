# Mail Catcher

A self-hosted form backend for landing pages. Point any number of landing pages at it and
it collects, de-duplicates and organises the people who sign up — with a dashboard for
searching, tagging, segmenting and exporting them.

One Next.js app, one SQLite file, one container. No external services.

---

## What it does

**Three ways to send data in**, all hitting the same endpoint:

| Method | Needs JavaScript? | Best for |
|---|---|---|
| Plain HTML `<form action="…">` | No | Any static site. Posts, then redirects to your thank-you page. |
| `embed.js` snippet | Yes | Inline success/error with no page reload, plus automatic UTM capture. |
| Hosted form | No | Nothing to add to your page — link to it or drop in an iframe. |

**One contact, many submissions.** Email is the unique key. When someone signs up again —
from a different landing page, months later — it attaches to the existing contact as a new
submission and merges in anything new they told you. Your list stays clean and you can see
each person's full journey.

**Spam is filtered without a CAPTCHA.** Four layers run on every submission, none of which
your visitors ever see:

- a **honeypot** field with a realistic name, hidden off-screen (not `display:none`, which
  bots detect); anything that fills it gets a *fake success* so it doesn't retry
- a **time trap** — a signed token that rejects submissions faster than two seconds
- **rate limiting** — 5 per form per 10 minutes, 30 per hour overall, per IP
- **validation** — server-side email checks and a disposable-address blocklist

Blocked spam is recorded rather than discarded, so you can confirm the filters aren't eating
real signups.

**Everything else:** analytics dashboard (submissions over time, conversion by form, top UTM
sources and campaigns), full-text contact search, tags, saved segments, per-contact notes,
and filtered CSV export.

---

## Quick start

### Docker (recommended)

```bash
cp .env.example .env

# Fill in the two required values:
openssl rand -hex 32          # → APP_SECRET
npm install && npm run hash-password   # → ADMIN_PASSWORD_HASH

docker compose up -d
```

Open <http://localhost:3000>. Migrations run automatically on start-up.

### Using the published image

Every push to `main` publishes a multi-arch image (amd64 + arm64) to GitHub
Container Registry. `docker-compose.yml` already points at it, so nothing is
built on your server:

```bash
docker run -d \
  -p 3000:3000 \
  -v mailcatcher-data:/data \
  -e APP_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD_HASH='...' \
  -e APP_URL=https://mail.example.com \
  ghcr.io/authortom/mailcatcher:latest
```

Tags: `latest` (current `main`), `sha-<commit>`, and `1.2.0` for `v1.2.0` releases.

### Portainer (or any stack manager)

Paste `docker-compose.yml` into the stack editor as-is — it pulls the published
image, so Portainer never needs a build context. Set two environment variables
in the stack's **Environment variables** section:

| Name | Value |
|---|---|
| `APP_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | see below |
| `APP_URL` | optional, e.g. `https://mail.example.com` |

You don't need a source checkout to generate the password hash — the image will
do it for you:

```bash
docker run --rm ghcr.io/authortom/mailcatcher:latest \
  node -e "require('@node-rs/argon2').hash(process.argv[1]).then(h=>console.log(h))" \
  'your-password-here'
```

Copy the whole `$argon2id$...` string into `ADMIN_PASSWORD_HASH`.

> If the stack fails with `compose build operation failed`, the compose file
> being deployed still has a `build:` line in it. Portainer has no source to
> build from — use the `image:` line above instead.

### Local development

```bash
npm install
cp .env.example .env          # set APP_SECRET; ADMIN_PASSWORD=… is fine locally
npm run db:migrate
npm run seed                  # optional: ~550 realistic contacts over 90 days
npm run dev
```

---

## Connecting a landing page

Create a form in the dashboard, then open its **Setup** tab — it shows copy-paste snippets
for all three methods with your real endpoint already filled in. The short version:

```html
<!-- 1 · Plain HTML: no JavaScript at all -->
<form action="https://your-host/f/FORM_ID" method="POST">
  <input type="email" name="email" required>

  <!-- The trap field. Keep it hidden, leave it empty. -->
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <input type="text" name="company_website" tabindex="-1" autocomplete="off">
  </div>

  <button type="submit">Subscribe</button>
</form>
```

```html
<!-- 2 · JavaScript embed: inline feedback + automatic UTM capture -->
<form data-mailcatcher="FORM_ID">
  <input type="email" name="email" required>
  <button type="submit">Subscribe</button>
  <p data-mc-message></p>
</form>
<script src="https://your-host/embed.js" async></script>
```

The script sets `data-mc-state="submitting | success | error"` on the form, so you style it
to match each landing page:

```css
form[data-mc-state='success'] [data-mc-message] { color: green; }
form[data-mc-state='error']   [data-mc-message] { color: crimson; }
```

It also captures `utm_*` parameters and the referrer, storing them in `sessionStorage` — so
a visitor who arrives on an ad, browses, then converts on another page is still credited to
the campaign that brought them.

`test-landing-page.html` in this repo wires up all three methods on one page. Replace
`YOUR_FORM_ID`, open it in a browser, and watch the submissions arrive.

### Extra fields

You are never limited to the fields configured in the dashboard. Any additional field your
landing page posts is stored automatically and shown on the contact. Common names
(`first_name`, `phone`, `company`, `organisation`, …) are recognised and mapped to the
contact's own columns.

---

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `APP_SECRET` | Yes | Signs session cookies and form timing tokens, salts the IP hash. Changing it signs you out. |
| `ADMIN_PASSWORD_HASH` | Yes | Argon2 hash of your password — `npm run hash-password`. |
| `APP_URL` | No | Public URL, used for the setup snippets. Defaults to the request host. |
| `DATABASE_PATH` | No | Defaults to `./data/mailcatcher.db`, or `/data/mailcatcher.db` in Docker. |
| `ADMIN_PASSWORD` | No | Plaintext password for local development. **Refuses to run in production.** |

---

## Notes on the design

**Why SQLite.** Ingest is write-light and the dashboard is read-heavy, which is exactly
SQLite's strength. Everything runs in one process with no network hop to a database, so a
submission lands in well under a millisecond. WAL mode keeps the dashboard responsive while
writes are happening. Your entire backup strategy is copying one file.

**Privacy.** Raw IP addresses are never written to disk — only a salted hash, used for rate
limiting. Deleting a contact cascades to their submissions. Settings has a retention control
for trimming old submission history while keeping the contacts themselves.

**Spreadsheet safety.** Exported cells beginning `=`, `+`, `-` or `@` are prefixed with an
apostrophe, so a value submitted through a form can't execute as a formula when you open the
CSV in Excel or Sheets.

**Not included in v1:** email notifications and autoresponders, ESP sync (Mailchimp/Kit),
double opt-in, and multi-user accounts. The schema leaves room for all of them; double opt-in
in particular would need outbound email.

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run seed` | Replace all data with a realistic 90-day fixture |
| `npm run hash-password` | Generate `ADMIN_PASSWORD_HASH` |

---

## Project layout

```
src/
  app/
    (dashboard)/        Overview, contacts, forms, tags, settings
    f/[formId]/         The ingest endpoint — POST, OPTIONS, config
    form/[formId]/      Hosted form and thank-you page
    embed.js/           The embeddable snippet
    api/export/         Streaming CSV exports
  db/                   Drizzle schema, migrations, FTS index, seed
  lib/
    ingest.ts           The submission pipeline
    crypto.ts           Token signing, IP hashing
    rate-limit.ts       Sliding-window limiter
    queries/            Analytics and contact queries
```
