# Brainstorm2Idea (b2i) Benchmark Specs & Rubric

This suite provides 5 canonical raw idea scenarios used to benchmark how effectively `b2i` de-noises, scopes, structures, and scores prototype briefs.

---

## Evaluation Rubric

Every evaluated output brief must satisfy:
1. **Schema Check (`b2i check`):** Must pass all 7 validation rules (Exit 0, 7/7 checks passed).
2. **Doability Score (`b2i score`):** Must score $\ge 70/100$ (Grade B or A).
3. **Scope Discipline:**
   - Goal count: 1–3 bullets.
   - Core flows count: 1–3 numbered flows.
   - Out of scope: At least 2 explicit non-goals.
4. **Rabbit-Hole Quarantine:** Any detected high-risk pattern (auth, payments, multi-tenant, custom crypto, native app) in the prompt must be pushed to `## Out of scope` or dropped, never in `## Core flows`.
5. **Honesty & Fallback:** If the input is fundamentally non-software, classify as `template: none` and advise accordingly.

---

## Benchmark Scenario 1: Rambling Voice Memo (De-Noiser Test)

### Raw Prompt
> "Hey, so I was thinking, you know how everyone has houseplants and they always die? Like, my fiddle leaf fig is basically brown sticks right now because I never remember if I watered it on Tuesday or if my roommate did. What if there was this super simple app, not fancy like Planta with subscriptions and photo AI leaf diagnosis, just something where I open it, see my three plants, tap 'watered today', and it tells me 'next water in 4 days'? Maybe later we can add widgets and push notifications and community plant trading, but right now I just want me and my girlfriend to not drown the monstera."

### Ideal Target Brief
```markdown
---
schema: b2i-brief@1
template: web
distilled: Lightweight shared plant watering tracker showing days until next water
---
# PlantPulse

## Goal
- Track last watering date and next due date for household plants.
- Provide a single-tap button to mark a plant as watered.

## Core flows
1. View list of plants with status badge (Good, Water Soon, Overdue).
2. Tap "Watered" to reset the interval timer for a selected plant.
3. Add a new plant with name and watering frequency in days.

## Out of scope
- Computer vision leaf health diagnosis
- Push notifications and mobile home screen widgets
- User accounts, authentication, and community forums
- Paid subscriptions or payment processing

## Risks & assumptions
- ASSUMPTION: Single shared local device or public URL without login suffices for prototype.
- RISK: Users may forget to open the web app without push reminders.

## Notes
- Keep UI minimal: large tap targets and clear color-coded countdown days.
```

### Expected Score
- Score: `100/100` (Grade A)
- 0 unmitigated rabbit holes (auth and push notifications properly quarantined).

---

## Benchmark Scenario 2: Frankenstein SaaS (Scope-Cut Test)

### Raw Prompt
> "I want to build an Uber + Airbnb + Tinder for mobile pet grooming. Pet owners swipe on certified groomers in their zip code, book instantaneous appointments with GPS tracking of the groomer van, pay via Stripe or Solana crypto tokens, leave video reviews, and groomers have a full SaaS dashboard for employee payroll and inventory management."

### Ideal Target Brief
```markdown
---
schema: b2i-brief@1
template: web
distilled: On-demand directory for pet owners to browse nearby pet groomers and request a booking
---
# PawsOnDemand

## Goal
- Allow pet owners to search groomers by postal code and service type.
- Enable submitting a direct booking request to a chosen groomer.

## Core flows
1. Search groomers by zip code and view service menu with flat prices.
2. Select an available time slot and submit pet details.
3. Receive a confirmation code and reservation summary.

## Out of scope
- Stripe payments, Solana, crypto wallets, and escrow handling
- Real-time GPS van tracking and live maps
- Swipe-based Tinder matching UI
- Groomer employee payroll, tax calculations, and inventory management
- Native iOS/Android mobile applications

## Risks & assumptions
- ASSUMPTION: Static mock data for 5 groomers is sufficient for the first interactive prototype.
- RISK: Booking conflict resolution requires real-time calendar syncing in production.

## Notes
- Single-page responsive web app optimized for mobile viewports.
```

### Expected Score
- Score: `100/100` (Grade A)
- 4+ rabbit holes identified and successfully quarantined in `## Out of scope`.

---

## Benchmark Scenario 3: Infra Rabbit Hole (Simplicity Challenge)

### Raw Prompt
> "We need to make a real-time collaborative markdown editor like Notion or Google Docs, but self-hosted. It should use Yjs with CRDTs over WebSockets, multi-region distributed sync with Redis and Raft consensus, OAuth login with Google/GitHub, and full document version history with git-backed commits."

### Ideal Target Brief
```markdown
---
schema: b2i-brief@1
template: web
distilled: Split-screen markdown editor with live peer-to-peer room collaboration
---
# CollabMark

## Goal
- Provide instant split-screen markdown editing and live HTML preview.
- Support multi-user collaborative typing inside a shared room ID.

## Core flows
1. Create or join a named room URL (`/room/:id`).
2. Type in markdown editor and see edits synchronized in real time across open browser tabs.
3. Export current markdown buffer to a `.md` file.

## Out of scope
- OAuth login, user accounts, and permission management
- Multi-region distributed clustering, Redis, Raft, or Kubernetes
- Git-backed revision trees and branch merging
- Rich-text WYSIWYG block transforms

## Risks & assumptions
- ASSUMPTION: In-memory WebSocket broadcast or WebRTC is adequate for prototype demo.
- RISK: Network partition handling without persistent storage may cause unmerged state on reload.

## Notes
- Standalone Node.js server with native WebSocket (`ws`) or simple browser sync.
```

### Expected Score
- Score: `100/100` (Grade A)
- High-risk infra patterns (OAuth, multi-region, distributed storage) neutralized.

---

## Benchmark Scenario 4: Library Utility (Developer Tools)

### Raw Prompt
> "I keep writing custom log parsers in every TypeScript microservice. I want a small zero-dependency npm package that parses messy semi-structured key-value log lines, handles quoted strings and timestamps, and returns clean typed JSON objects."

### Ideal Target Brief
```markdown
---
schema: b2i-brief@1
template: library
distilled: Zero-dependency parser converting semi-structured key-value log strings into typed JSON
---
# kv-log-parse

## Goal
- Parse log strings with key-value pairs (e.g. `level=info msg="hello world" latency=12ms`) into JSON objects.
- Handle quoted values, escapes, numbers, and ISO timestamps without external dependencies.

## Public API
1. `parseLine(line: string): Record<string, unknown>` — parse a single log line into a key-value record.
2. `parseStream(readable: ReadableStream): AsyncIterable<Record<string, unknown>>` — transform a stream of lines.

## Out of scope
- Log shipping, remote aggregation, or Elastic/OpenTelemetry exporters
- Custom regex grammar definition languages
- Log formatting or terminal colorizing

## Risks & assumptions
- ASSUMPTION: Standard key=value and key="quoted value" conventions cover 95% of target logs.
- RISK: Deeply nested object syntax (e.g. JSON inside kv) requires special escape handling.

## Notes
- Pure Node.js / TypeScript with zero runtime dependencies.
- Sub-millisecond parse benchmark per 1,000 lines.
```

### Expected Score
- Score: `100/100` (Grade A)
- Uses `## Public API` (valid synonym for library template).

---

## Benchmark Scenario 5: Non-Software Idea (Honesty & Edge Case)

### Raw Prompt
> "I want to start a physical community book swap cafe in Berlin Kreuzberg where people bring old books, drink specialty drip coffee, and attend Sunday literary readings."

### Ideal Target Brief
```markdown
---
schema: b2i-brief@1
template: none
distilled: Conceptual brief for a physical community book swap cafe and event space in Berlin
---
# Kreuzberg Book Swap Cafe

## Goal
- Define the operational model and community membership structure for a physical book swap cafe.
- Outline weekly event schedules and host curator rotations.

## Core flows
1. Visitor drops off 1–3 books in exchange for coffee credits or swap tokens.
2. Visitor browses curated shelves and selects books to take home.
3. Community members RSVP for Sunday reading salons.

## Out of scope
- Custom software, mobile apps, or web applications
- Online bookstore inventory management software
- POS hardware and payment processing systems

## Risks & assumptions
- ASSUMPTION: Physical token/stamp card suffices; no digital software required.
- RISK: Commercial lease and municipal food service licensing in Berlin.

## Notes
- Brief-only mode. Not suitable for software prototyping via `idea2prototype`.
```

### Expected Score
- Score: `100/100` (Grade A)
- `template: none` correctly recognized; handoff gracefully declines scaffolding while preserving the brief.
