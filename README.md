# The AI Interview Prep Kit

Turn a job description and a company URL into a structured, editable, practice-able interview
preparation kit — researched, generated, and validated by code, not by a single prompt.

## Contents

- [Overview & tech stack](#overview--tech-stack)
- [Architecture](#architecture)
- [LLM provider](#llm-provider)
- [Retrieval approach & sources](#retrieval-approach--sources)
- [Research & generation sequencing](#research--generation-sequencing)
- [The second pass (coverage)](#the-second-pass-coverage)
- [Builder state: generated, edited, pinned](#builder-state-generated-edited-pinned)
- [Schedule allocation](#schedule-allocation)
- [Practice mode](#practice-mode)
- [Creative feature: weak spots](#creative-feature-weak-spots)
- [Security](#security)
- [Edge cases & failure handling](#edge-cases--failure-handling)
- [Setup — local development](#setup--local-development)
- [The batch evaluation command](#the-batch-evaluation-command)
- [Deployment](#deployment)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Known limitations & trade-offs](#known-limitations--trade-offs)

## Overview & tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + Tailwind v4 | matches the brief's preferred stack |
| Backend | Node.js + Express 5 | matches the brief's preferred stack |
| Database | MongoDB | matches the brief's preferred stack |
| Language | TypeScript everywhere | one `Kit` type (from `@prep-kit/schema`) shared by the pipeline, the API, and the frontend — no re-typing the same shape three times |
| LLM | Google Gemini (free tier) | see [LLM provider](#llm-provider) |
| Search | Tavily | free tier, purpose-built for this kind of "find public discussion of X" query |
| Server state (frontend) | TanStack Query | caching, optimistic mutations, refetch-on-error — the loading/empty/error states Section 12 asks for, without hand-rolling them per endpoint |

The repo is an npm-workspaces monorepo:

```
apps/
  web/      Next.js frontend
  api/      Express API — auth, persistence, job orchestration, SSE
  cli/      the batch entry point (Section 9)
packages/
  core/     the pipeline itself — retrieval, generation, deterministic logic, builder, practice
  schema/   the Appendix A Zod schema + structural validator (@prep-kit/schema)
fixtures/   local company sites used by tests and by example batch cases
```

`packages/core` is the one implementation the API, the CLI, and every test import — Section 9's
"the same code your application uses, not a parallel implementation" is enforced by there being no
other place the pipeline logic could live.

## Architecture

```
┌─────────────┐        ┌─────────────────┐        ┌──────────────────┐
│  apps/web   │──────▶│    apps/api      │──────▶│  packages/core    │
│  (Next.js)  │  HTTP  │  (Express)       │  calls │  (the pipeline)   │
│             │◀──────│  auth, Mongo,     │◀──────│  retrieval         │
│  SSE client │  SSE   │  job runner, SSE  │        │  generation        │
└─────────────┘        └────────┬─────────┘        │  deterministic     │
                                 │                   │  builder           │
                          ┌──────▼──────┐            │  practice          │
                          │   MongoDB    │            └─────────┬──────────┘
                          └─────────────┘                       │
                                                    ┌────────────┼────────────┐
                                                    ▼            ▼            ▼
                                              Gemini API   Tavily API   company sites
```

`apps/cli/src/evaluate.ts` calls `packages/core` directly, bypassing the API/Mongo layer entirely —
it reads cases from a file and writes kits to a file, with no server involved.

Within `packages/core`, concerns are split into folders that map directly onto Section 13's
"keep retrieval, extraction, generation, scheduling and persistence as clearly separated concerns":

- `retrieval/` — `fetchPage`, `crawlCompany`, the SSRF guard, robots.txt, rate limiting/backoff
- `llm/` — the Gemini client: JSON-repair retry, 429 backoff, prompt-injection wrapping
- `generation/` — the LLM-calling steps (requirements, brief, questions, flashcards)
- `deterministic/` — the two things Section 3 explicitly reserves for code: coverage checking and
  schedule allocation, plus page classification and company-name derivation
- `pipeline/` — `buildKit`, the orchestrator that sequences everything above
- `builder/` — pure state-transition logic for editing (id sequencing, `_meta` transitions, reference
  cleanup, per-section regeneration)
- `practice/` — SM-2 scheduling, coverage, and the weak-spots report

## LLM provider

**Google Gemini**, model `gemini-3.5-flash-lite` (overridable via `GEMINI_MODEL`).

This wasn't the first choice — it's the result of two real failures during development that are
worth documenting because they're exactly the kind of thing Section 2 warns about ("a pipeline that
falls over the first time a provider says 'slow down' is the most common way to lose points here"):

1. `gemini-2.5-flash-lite` was used for a while, then started returning HTTP 404 ("no longer
   available to new users") — a live model deprecation, not a bug in the code.
2. The obvious fallback, plain `gemini-2.5-flash`, turned out to share a **5 RPM / 20 requests-per-day**
   free-tier bucket with every other non-Lite Flash model (2.5, 3, 3.5, 3.6, 3.7, 3.8 — confirmed via
   [Google AI Studio's rate-limit dashboard](https://aistudio.google.com/rate-limit)). A single kit
   generation makes roughly 7–9 Gemini calls, so one kit could burn nearly half a day's entire quota.

The fix was `gemini-3.5-flash-lite`, which sits in a separate, far larger free-tier bucket — **15 RPM /
500 RPD** — comfortably covering a full 5-case batch run (see [the batch evaluation
command](#the-batch-evaluation-command) for real timing). The takeaway documented here for anyone
re-running this after another Google deprecation: check the rate-limit dashboard before assuming a
model's free-tier numbers, and prefer the "Lite" variant of whatever generation is current — it isn't
just cheaper, it's a structurally different (and much larger) quota bucket.

**Rate-limit and failure handling**, all in `packages/core/src/llm/gemini-client.ts`:

- A shared rate limiter enforces a minimum gap between calls (default 4.5s ≈ 13.3 RPM, safely under
  the 15 RPM cap). It's a promise-chain queue, not a plain read-then-write timestamp — the naive
  version breaks under concurrency (several calls fired via `Promise.all` would all read the same
  stale "last request" time before any of them updated it, letting a burst through). This actually
  broke once during development and was caught by a test written specifically to reproduce it
  (`packages/core/test/rate-limit.test.ts`).
- A 429 is retried with exponential backoff (3 retries, 4s/8s/16s) via the same `withRetry` utility
  the crawler uses for flaky pages.
- If the model returns malformed JSON or a shape that doesn't validate against the expected Zod
  schema, exactly one repair attempt is made — the model is shown its own broken output and the
  validation error and asked to fix it. Failing twice raises a typed `GeminiError` rather than
  retrying indefinitely (that would just burn quota on a model that isn't going to converge).
- Vitest runs test files in parallel worker processes by default, which meant the rate limiter
  (an in-process singleton) couldn't coordinate across files — parallel live-API tests could trip the
  real limit even though each file paced its own calls correctly. Fixed with `fileParallelism: false`
  in `packages/core/vitest.config.ts`.

## Retrieval approach & sources

Two independent research channels feed a kit, and neither depends on the other succeeding:

1. **The company site** (`retrieval/crawl.ts`): fetch the root page, score every discovered link by
   how strongly its URL/anchor-text signals "hiring/interview page" vs. "about the company" vs. noise
   (`retrieval/link-ranking.ts`), fetch the top-ranked candidates up to a page/depth budget (8 pages,
   depth 2 by default), repeat. This is deliberately not a fixed path list — Section 2 explicitly
   calls that insufficient, and a crawl test (`crawl.test.ts`) exercises a fixture site with the
   hiring page buried at an unpredictable, non-obvious path to prove it.
2. **Public discussion of the interview process** (`search/tavily.ts`): a Tavily search for
   `"{company} interview process questions experience"`. An empty result is treated as a valid,
   honest outcome, not an error — most of the companies this gets pointed at won't have public
   interview writeups, and the kit should say so rather than fail or fabricate.

Retrieval discipline (`retrieval/fetch-page.ts`, `retrieval/ssrf-guard.ts`):

- Every URL is validated before fetching: http(s) only, and — **only when `NODE_ENV=production`** —
  the resolved IP is checked against private/loopback/link-local ranges (via real DNS resolution, not
  just string matching, so a public-looking hostname that resolves to an internal IP is still caught).
  This is gated on environment deliberately: Appendix B's own example company URL is
  `http://localhost:8099/acme/`, and Section 9 requires the batch tool to work against local fixture
  hosts. The batch CLI always passes `allowPrivateNetworks: true` explicitly (it's a trusted local
  tool run by the operator, not a public-facing endpoint accepting arbitrary user input); the deployed
  API defaults to the environment-gated behavior.
- Redirects are followed manually, one hop at a time, re-validating the SSRF guard on every hop — a
  malicious page can't redirect past the check into an internal address.
- Content type is restricted to `text/html`/`text/plain`, and body size is capped (2MB) via a
  streaming read that aborts early rather than trusting `Content-Length`.
- `robots.txt` is fetched and respected for every crawl.
- A per-host rate limiter spaces requests to the company's own site, separate from the Gemini limiter.

Everything fetched — job description text and every crawled page — is wrapped in an explicit
`<untrusted-content>` delimiter before being sent to the model, paired with a system-instruction line
telling the model that content inside it is source material to analyze, never an instruction to
follow (`llm/gemini-client.ts`, `wrapUntrusted` / `UNTRUSTED_CONTENT_POLICY`). This is Section 11's
prompt-injection requirement enforced structurally, not by hoping the model behaves.

## Research & generation sequencing

`packages/core/src/pipeline/build-kit.ts` runs a genuine sequence, not one prompt:

1. **Extract requirements from the JD, concurrently with company research.** These are independent —
   the JD needs no retrieval at all — so they run in parallel via `Promise.all`. One Gemini call does
   double duty: it returns both the requirements list *and* the role metadata (title, seniority,
   location, responsibilities) Appendix A also needs, since both come from one read of the same text.
2. **Company research is itself a real dependency chain**: crawl → classify the crawled pages into
   hiring-signal vs. about vs. noise (a *deterministic* re-use of the same keyword heuristic the
   crawler used to decide what to fetch, not a second LLM call) → derive a company display name from
   the root page's `<title>` → search for public discussion, using that derived name.
3. **Company brief and all four question categories run concurrently** once both prior steps are in —
   they're mutually independent, and the rate limiter (see above) queues and spaces the underlying
   calls correctly even when fired at once. Each category gets its own call with its own instructions
   and its own requirement subset: `technical`/`domain`-kind requirements feed the `technical` and
   `system-design` calls (system-design questions often span several technical requirements at once,
   which is why the same subset feeds both, under different instructions); `behavioural`-kind
   requirements feed the `behavioural` call; `company-fit` gets no requirement subset at all — it's
   grounded in whatever hiring-signal text was found, and falls back to an honest "no public
   information was found" line when there's nothing.
4. **Coverage check** (deterministic — see below), then the [second pass](#the-second-pass-coverage).
5. **Flashcards**, generated from the final question set.
6. **Schedule** (deterministic — see [Schedule allocation](#schedule-allocation)).
7. **Validate** the assembled kit against the Appendix A schema before returning it — if `buildKit`'s
   own output doesn't pass its own validator, that's a bug, and it throws rather than returning
   something broken.

Two of these steps are explicitly never handed to the model, per Section 3:

- **Coverage checking** (`deterministic/coverage.ts`) is a set-difference: every requirement id that
  doesn't appear in any question's `requirement_ids`. Not a judgment call.
- **Schedule allocation** (`deterministic/schedule.ts`) is arithmetic — see below.

## The second pass (coverage)

After the first full pass, `checkCoverage` finds any **must-have** requirement with no question
against it (nice-to-have gaps are reported but not chased — see below). If there are gaps:

1. Group the uncovered musts by kind (technical/domain → the `technical` category; behavioural → the
   `behavioural` category).
2. Re-run *only those categories*, scoped to *only the uncovered requirements*, with the existing
   question prompts passed as `excludePrompts` so the model doesn't just repeat what's already there.
3. Recheck coverage. If a pass closed nothing, stop — repeating a call that isn't converging just
   burns quota on a free tier that doesn't have much to spare.

This repeats up to **3 passes total** (1 initial + 2 gap-closing). Three was chosen as a small, bounded
budget: in practice a category call either closes a gap on the first retry or it's asking for
something the requirement text itself doesn't support (e.g. a requirement so vague the model can't
generate a targeted question for it), and a fourth attempt is unlikely to help. Whatever's still
uncovered after that is reported honestly in `coverage.uncovered_requirement_ids` — a kit is never
silently shipped with a gap hidden, and by design that remainder should only ever be `nice`-priority
requirements, since it's the musts the loop is bounded to close.

The same merge-and-retarget logic is reused (not reimplemented) for the builder's
"regenerate one question category" action — see the next section.

## Builder state: generated, edited, pinned

This is the state problem Section 6 calls the hardest part of the assessment, and the design is:
every requirement, question, and flashcard carries a `_meta` block —

```ts
{ origin: "generated" | "edited" | "manual", pinned: boolean, order: number, revision: number }
```

— which Appendix A doesn't name, but Section 5 explicitly permits extending the structure where it
helps. `_meta` is that extension point, kept separate from the named fields so it never collides with
anything the grader's harness checks against.

**Transitions** (`packages/core/src/builder/item-state.ts`):

- A fresh item from generation starts `generated`.
- The first hand-edit flips it to `edited` (and bumps `revision`, so staleness is visible).
- A hand-added item is born `manual` and stays `manual` through further edits — editing something you
  wrote yourself doesn't make it "generated."
- `pinned` is a separate, orthogonal flag, toggle-able independent of origin.

**What survives regeneration** (`isProtected`): an item is protected from being discarded by a
category regeneration if its origin is `edited` or `manual`, **or** it's `pinned` — this is true even
if the item happens to be in the exact category being regenerated. That's a direct implementation of
Section 6's own example: "a question the user wrote or edited by hand must survive a regeneration of
its category." `regenerateQuestionCategory` (`builder/regenerate-questions.ts`) splits the category's
current questions into protected (kept, untouched, ids preserved) and replaceable, generates fresh
questions only to fill the replaced slots (continuing the kit's existing id sequence — `q7`, `q8`, …
— rather than restarting, so ids never collide with a survivor), and runs one bounded top-up pass if
that replacement leaves a must-have newly uncovered. Every other category is never even read.

Company brief regeneration works slightly differently, because there's only one instance of it (not a
list to merge): **pinning is the only thing that blocks a direct "regenerate this section" click** —
a plain edit doesn't, because there's nothing else in a single field to preserve once the user has
explicitly asked to regenerate exactly it. Schedule regeneration doesn't need protection logic at all:
it's a pure recomputation from the current question set, and never touches any other section.

**Persistence and integrity**: every mutation — edit, add, delete, reorder, regenerate — goes through
`saveKit()` in `apps/api/src/routes/kits.ts`, which re-runs `validateKit` before writing to Mongo. A
few mutations need explicit cleanup to stay valid: deleting a requirement strips it from any
question's/flashcard's `requirement_ids`; deleting a question strips it from the schedule; regenerating
a category can drop several questions at once, so a more general `pruneDanglingScheduleReferences`
re-validates the whole schedule against whatever the question set ends up being, rather than tracking
exactly which ids were removed. All of this was caught by writing tests for the merge logic directly
(not just the HTTP layer) — see [Testing](#testing).

**Frontend feel** (Section 12's "immediate, not round-tripping per keystroke"): text fields are local
component state until blur, so typing never touches the network — only leaving the field does
(`EditableField.tsx`). Reorder and pin-toggle *do* patch the TanStack Query cache optimistically (with
rollback on error), since users expect a toggle or a drag to respond instantly, and both are cheap,
well-understood mutations to predict locally without duplicating server-side `_meta` logic.

## Schedule allocation

`deterministic/schedule.ts` — arithmetic, never the model's call (Section 3, Section 8).

1. Each question gets an estimated minutes value from its `difficulty` (1→10, 2→15, 3→25).
2. Questions are sorted: **must-linked and harder material first**. A question's priority rank is 0 if
   any of its linked requirements is `must`, 1 if it's linked only to `nice` requirements, 2 if it's
   unlinked (e.g. `company-fit`); ties break by difficulty descending.
3. **If there's at least as much material as days requested**, days are filled greedily up to a
   per-day cap (`clamp(total / days, 30, 180)` minutes), with the last day absorbing any remainder.
   A subtlety caught by hand-tracing the algorithm during development: a naive greedy fill can let one
   day's cap absorb a run of small items and starve a later day entirely, even though there was enough
   material overall — fixed by capping how many items a day may take based on what the remaining days
   still need (`packIntoExactDays`'s `maxTake` calculation), and covered by a dedicated test.
4. **If there are fewer questions than days requested** (a thin JD + a generous day count, or a
   60-day ask), each question gets its own "new material" day first, then the remaining days cycle
   back through the material as spaced review at half the original minutes — not empty days, and not
   padding with invented content.
5. **A 1-day request** absorbs everything into that single day, uncapped; if that pushes minutes past
   the sanity threshold, the day's `focus` label says so plainly ("longer than ideal for one
   day…") rather than hiding it.

Every path guarantees: exactly `days_available` days in the output, every must-have requirement's
question scheduled somewhere, and no schedule entry ever references a question id that doesn't exist.

## Practice mode

SM-2 spaced repetition (`practice/sm2.ts`), not a plain confidence-weighted sort — chosen because it
does something a sort can't: it decides *when* a card should resurface, not just how it ranks against
the others right now, so a card someone just nailed doesn't clutter tomorrow's session. The 1–5
confidence rating the UI collects is used directly as SM-2's quality score (a documented
simplification of the original 0–5 scale — a self-rating has no real need for the "total blackout vs.
incorrect but familiar" distinction the extra point at the bottom exists for).

`orderForNextSession` layers Section 7's own requirement on top of SM-2 rather than replacing it: due
(or never-reviewed) cards sort first, and *within* that group, least-confident-first.
`computePracticeCoverage` answers "what's been covered and what hasn't."

## Creative feature: weak spots

`practice/weak-spots.ts`, surfaced in the practice page and via `GET
/api/kits/:id/practice/weak-spots`.

Rather than a leaderboard of which *flashcards* went badly, it joins practice confidence back to
**job requirements** via each flashcard's `requirement_ids` — the same id spine that makes coverage
checking possible in the first place. The result is a ranked list of the *actual posting
requirements* someone is weakest on, which is the thing they'll really be asked about in the
interview. A requirement with no practiced flashcard yet ranks as the weakest possible entry — not
knowing is itself a weak spot, and treating it as neutral would hide exactly the gap this feature
exists to surface. It's cheap to build (pure aggregation over data the pipeline already produces) and
directly answers a real question — "what should I still cram before tomorrow?" — that a flat flashcard
list doesn't.

## Security

- **SSRF**: see [Retrieval approach](#retrieval-approach--sources) — real DNS resolution against
  private/loopback/link-local ranges, environment-gated so local fixture hosts keep working for the
  batch tool.
- **Content discipline**: content-type allowlist, byte cap on every fetch, manual redirect
  re-validation.
- **Prompt injection**: every piece of untrusted text (JD, crawled pages) is wrapped in an explicit
  delimiter with an instruction that it's data, never a command — see above.
- **Auth**: bcrypt-hashed passwords, `httpOnly`/`secure`(-in-production)/`sameSite=lax` session
  cookies backed by `connect-mongo` (so sessions survive a restart and expire via TTL rather than a
  hand-rolled check), and a login error message that's identical whether the account doesn't exist or
  the password is wrong (no account enumeration).
- **Ownership**: every kit route checks `kit.userId === session.userId`; a kit that exists but belongs
  to someone else returns the same 404 as a kit that doesn't exist, so existence isn't leaked.
- **Auth is checked client-side, not via Next middleware.** The session cookie is `httpOnly` and lives
  on the API's own origin (in production, a different domain from the frontend); a Next server, even
  in production, has no way to read a cookie scoped to a different origin during rendering — only the
  browser can, via a credentialed fetch, which is exactly what CORS on the API is configured to allow.
  So the frontend is necessarily client-rendered for anything auth-gated (`ProtectedRoute.tsx` checks
  `GET /api/auth/me` on mount and redirects), rather than pretending to be server-protected when it
  structurally can't be.
- **Input validation**: every request body is parsed through a Zod schema before touching the
  database; every generated (or edited) kit is re-validated against the full Appendix A schema before
  being saved, so a bad edit or a malformed model response can never be persisted.

## Edge cases & failure handling

Per Section 10, with where each is handled:

| Case | Handling |
|---|---|
| Invalid/404/timeout company URL | `crawlCompany` never throws for this — it records the failure in `skipped` with a reason and returns whatever it did get (possibly nothing); the kit still generates from the JD alone, with an honest brief |
| No discoverable hiring/about page | Same as above — an honest "no information could be retrieved" brief, not a fabricated one |
| Two-line JD stub | `extractRequirements`'s prompt explicitly instructs: return only what's stated, don't pad; verified by a live test |
| No public discussion found | `searchPublicDiscussion` returns `[]`, treated as a valid outcome, not an error |
| Model returns invalid JSON / incomplete kit | One repair attempt (see [LLM provider](#llm-provider)), then a typed error; `buildKit` also self-validates before returning |
| Rate-limited / provider briefly fails | Exponential backoff on 429; a persistent failure is classified into a small stable set of error codes (`LLM_RATE_LIMITED`, `LLM_NOT_CONFIGURED`, `LLM_INVALID_OUTPUT`, `LLM_ERROR`) shared by the API and the CLI via `classifyBuildKitError`, so a failure looks the same from either entry point |
| Same description + company submitted twice | A hash of `userId + jd + companyUrl` is a unique Mongo index; a duplicate submission returns the existing kit (with `duplicate: true`) instead of spawning a second generation job |
| 1-day / 60-day schedule | See [Schedule allocation](#schedule-allocation) |

**What counts as a batch failure**: reserved for a case that produced no kit at all (a malformed input
case, or the LLM pipeline failing outright even after retries). A case that only *partially* researched
successfully — no hiring page, no public discussion, an unreachable company — is `ok`, with the gaps
recorded honestly inside the kit itself, per the brief's own FAQ ("a missing hiring page is not a
failure").

## Setup — local development

Requires Node 20+, a MongoDB connection (Atlas free tier or local), a Gemini API key, and a Tavily API
key.

```bash
git clone <this-repo>
cd ai-interview-prep-kit
npm install
cp .env.example .env
# fill in GEMINI_API_KEY, TAVILY_API_KEY, MONGODB_URI, SESSION_SECRET in .env
```

`GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com) → Get API key (free tier).
`TAVILY_API_KEY` — [tavily.com](https://tavily.com) → free tier signup.
`MONGODB_URI` — a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster's connection
string, or a local `mongodb://127.0.0.1:27017/prep-kit`.
`SESSION_SECRET` — any long random string (e.g. `openssl rand -hex 32`).

Next.js only reads env files from its own directory, not the repo root, so it needs one more file:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > apps/web/.env.local
```

Then, in two terminals:

```bash
npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

Run the automated tests (packages/schema, packages/core, apps/api):

```bash
npm run test
```

`packages/core`'s tests include a handful of live-Gemini integration tests, gated on `GEMINI_API_KEY`
being present — they're skipped automatically if it isn't set, so `npm test` still passes in a clean
environment without a key.

## The batch evaluation command

Section 9's mandatory entry point, run from the repo root against a clean install:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Reads a JSON array of `{ id, jd, company_url, days }`, runs the exact same `buildKit` pipeline the API
uses for each one, and writes `{ version, generated_at, kits: [{ id, status, kit, error }] }` to the
output file. A malformed case, or a case whose generation fails outright, is recorded as `status:
"failed"` with a structured `error`; the run continues rather than aborting. `fixtures/cases.sample.json`
is a minimal 2-case example; `fixtures/cases.batch-run.json` is a fuller 5-case example exercising
every edge case in the table above. Both point at `fixtures/acme` and `fixtures/nohiring`, which need
to be served locally to actually be fetched — any static file server rooted at `fixtures/` works, e.g.:

```bash
npx serve fixtures -l 8099
```

— or substitute your own company URLs in a copy of the cases file.

Timing, run for real against 5 cases (one normal company, one with no hiring page, one thin JD, one
unreachable company, one 1-day schedule) on `gemini-3.5-flash-lite`: **2 minutes 59 seconds**, 5/5
`ok`, every kit independently passing full schema + referential-integrity validation. Comfortably
inside the 15-minute budget, with real headroom for whatever retries a grading run's rate limits
force.

One real host-safety note for this command specifically: unlike the deployed API, the batch CLI
always passes `allowPrivateNetworks: true` to the pipeline. It's a trusted, operator-run local tool
that processes cases the operator supplies directly — including, per Appendix B's own example,
company URLs on `localhost` — not a public endpoint accepting arbitrary internet input, so the
SSRF gate that protects the deployed API doesn't apply to it.

## Deployment

<!-- TODO: fill in once deployed -->
- Frontend: `<TBD — Vercel URL>`
- API: `<TBD — Render/Railway URL>`

Environment variables for each platform are exactly the ones documented in
[Environment variables](#environment-variables) below. `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` must
point at each other's deployed origins (not `localhost`) for cookies and CORS to work — see the
architecture note in [Security](#security) about why auth is checked client-side rather than via Next
middleware: the session cookie lives on the API's own origin, so a Next server (even in production)
has no way to read it during rendering. `NEXT_PUBLIC_API_URL` is baked into the frontend's client
bundle at *build* time, not read at runtime, so it must be set in the frontend host's build-time
environment configuration, not just its runtime one.

## Testing

`npm run test` runs `packages/schema`, `packages/core`, and `apps/api`'s suites. Coverage worth
calling out specifically, since Section 14 asks for tests protecting "schedule allocation, coverage
checking, and structure validation":

- **Schedule allocation** (`packages/core/test/schedule.test.ts`): exact day-count output regardless
  of material; every must-have's question scheduled; the day-starvation edge case found by hand-tracing
  the algorithm; the 1-day-crams-everything and fewer-questions-than-days-triggers-review branches; no
  question id referenced that doesn't exist in the input.
- **Coverage checking** (`packages/core/test/coverage.test.ts`): the set-difference logic itself, plus
  `packages/core/test/build-kit.integration.test.ts`'s live end-to-end assertion that every must-have
  requirement actually has a question after the real pipeline runs.
- **Structure validation** (`packages/schema/test/validate.test.ts`): dangling ids, duplicate ids,
  schedule/day-count mismatches all correctly rejected.
- **The builder's state model** (`packages/core/test/builder-*.test.ts`,
  `apps/api/test/kit-builder.test.ts`): id sequencing never collides, `_meta` transitions are correct
  (including the pin-only-doesn't-touch-origin case), reference cleanup on delete, and — live —
  `regenerateQuestionCategory` actually preserving an edited/manual/pinned question while replacing
  the rest.
- **Auth and ownership** (`apps/api/test/auth.test.ts`): no account enumeration, session
  persistence/expiry, 404-not-403 on someone else's kit.

`apps/api`'s tests use `mongodb-memory-server` (no real database needed) and inject a fake `buildKit`
function via dependency injection (`createApp(env, { buildKitFn })`) so hitting the real HTTP routes
in tests never triggers a live Gemini call — only `packages/core`'s own gated integration tests touch
the real API, and only when `GEMINI_API_KEY` is present.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | api, cli | Gemini API key |
| `GEMINI_MODEL` | api, cli | optional model override (default `gemini-3.5-flash-lite`) |
| `TAVILY_API_KEY` | api, cli | Tavily search API key |
| `MONGODB_URI` | api | MongoDB connection string |
| `SESSION_SECRET` | api | session cookie signing secret |
| `NODE_ENV` | api, core | `production` enables the SSRF private-network gate |
| `PORT` | api | port the Express server listens on |
| `FRONTEND_URL` | api | the frontend's origin, for CORS |
| `NEXT_PUBLIC_API_URL` | web | the API's origin (baked in at build time) |

## Known limitations & trade-offs

- **Job orchestration is in-process, not a real queue.** Generation runs as a fire-and-forget async
  call within the same Node process that handled the HTTP request, with progress tracked in Mongo and
  pushed over SSE. This avoids a Redis/BullMQ dependency (another thing to deploy on a free tier) but
  means generation state is lost if the API process restarts mid-generation — a kit would be stuck in
  `generating` until manually retried. Acceptable for this scope; a real deployment at any real scale
  would want a durable job queue.
- **SSE, not WebSockets**, for progress — simpler, one-directional is all that's needed, and it
  degrades gracefully (a missed event just means a slightly stale read on reconnect, since the current
  state is always re-readable from Mongo).
- **Reordering is up/down buttons, not drag-and-drop.** A deliberate accessibility trade-off — Section
  12 explicitly requires keyboard navigation, and accessible drag-and-drop is a meaningfully larger
  lift for the same functional outcome.
- **Flashcards and requirements have no "regenerate" action**, only edit/add/delete/reorder — Section
  6's regeneration list names exactly three sections (brief, one question category, schedule), and
  building a fourth wasn't asked for.
- **The IPv6 private-range check in the SSRF guard** is a documented simplification (prefix-string
  matching for the common ranges) rather than exhaustive CIDR arithmetic — sufficient for the sites
  this project talks to, not a general-purpose network security library.
- **No email verification, password reset, or roles** — explicitly out of scope per the brief.
- **The free-tier LLM budget is real and tight** (see [LLM provider](#llm-provider)); a sustained
  burst of kit generations well beyond a 5-case batch run (e.g. rapid regeneration-button-mashing
  across many kits) will eventually hit the 500 RPD ceiling. The rate limiter and retry logic handle
  this gracefully (clear, typed errors; no crash), but it's a real ceiling and not a mistake in the
  implementation.
