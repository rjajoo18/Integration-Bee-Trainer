# Integration Bee Trainer

**Competitive real-time integral battles — train fast, rank up, dominate.**

---

## Overview

Integration Bee Trainer is a full-stack multiplayer web application where players compete head-to-head in timed integral-solving duels. Inspired by AoPS FTW-style competitive math gameplay, it delivers a structured, ranked experience — from room creation and matchmaking through timed problem-solving rounds, to Elo rating updates after every match.

The project is built as a production-quality application: real authentication, a PostgreSQL-backed room and match lifecycle, per-player state management, and a clean competitive UI designed around speed and clarity.

---

## Key Features

- **Real-time multiplayer battles** — create or join rooms, ready up, and compete in timed 1v1 (or multi-player) integral duels
- **Structured match lifecycle** — rooms → lobby → ready state → match start → scored rounds → finish, all enforced server-side
- **Elo rating system** — Chess-style competitive ranking that updates after every match
- **Difficulty-filtered problems** — five difficulty tiers; hosts configure the room before play starts
- **Configurable room settings** — time per problem, max players, optional password-protected private rooms
- **Secure authentication** — email/password auth with email verification and optional two-factor authentication (2FA)
- **LaTeX problem rendering** — integrals rendered with KaTeX for clean, readable math display
- **Answer equivalence checking** — algebraically equivalent answers are accepted correctly
- **Responsive competitive UI** — dark-themed, minimal, focused on fast interaction under time pressure

---

## Screenshots

> _Screenshots / demo GIF coming soon._

| Lobby | Room | Battle |
|-------|------|--------|
| ![Lobby](./docs/screenshots/lobby.png) | ![Room](./docs/screenshots/room.png) | ![Battle](./docs/screenshots/battle.png) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Language** | TypeScript |
| **Database** | PostgreSQL via `pg` connection pool |
| **Auth** | NextAuth.js — credentials + Google OAuth, email verification, 2FA |
| **Math Rendering** | KaTeX via `react-katex` |
| **Styling** | Tailwind CSS |
| **Real-time** | Polling (800ms match state, 1500ms room state) |
| **Deployment** | Vercel (frontend) + managed PostgreSQL |

---

## How It Works

```
Player creates a room
  └─ Configures difficulty, time limit, max players, optional password

Players join the room lobby
  └─ Each player toggles ready state
  └─ Host starts the match when all players are ready

Match begins
  └─ Players receive the same integral problem simultaneously
  └─ Per-round timer counts down
  └─ Answers are submitted and checked for equivalence server-side
  └─ Wrong answers lock out the player for that round
  └─ First to N correct answers wins

Match ends
  └─ Elo ratings update based on result
  └─ Match history recorded
```

---

## Architecture

```
src/
├── app/
│   ├── battle/                    # Battle lobby + room list page
│   │   ├── room/[roomId]/         # Room lobby (pre-match)
│   │   └── match/[matchId]/       # Active battle screen
│   └── api/
│       ├── battle/
│       │   ├── rooms/             # GET list, POST create
│       │   │   └── [roomId]/
│       │   │       ├── join/      # POST join room
│       │   │       ├── leave/     # POST leave (host → deletes room)
│       │   │       ├── ready/     # POST toggle ready state
│       │   │       └── start/     # POST start match (host only)
│       │   └── matches/
│       │       └── [matchId]/
│       │           ├── route.ts   # GET match state + phase advance
│       │           ├── submit/    # POST answer submission
│       │           └── next/      # POST advance to next problem (host)
│       ├── auth/                  # NextAuth + email verification + 2FA
│       └── register/              # Account creation
├── lib/
│   ├── db.ts                      # PostgreSQL pool
│   ├── auth.ts                    # Session + requireUserId()
│   └── battle/
│       ├── answer.ts              # answersEquivalent() — equivalence checking
│       └── password.ts            # Room password hashing
```

**Key design decisions:**

- **Server-authoritative match state** — all phase transitions (in_game → cooldown → finished) happen server-side on the GET `/matches/[matchId]` route, preventing client-side cheating or desync
- **Polling over WebSockets** — chosen for deployment simplicity and reliability; 800ms intervals are imperceptible at human reaction speeds for this use case
- **Wrong-answer lockout** — tracked in `battle_problem_results` at the DB level; clients cannot re-attempt a round they've already failed
- **Host-owns-room invariant** — when the host leaves, the room and any active match are deleted atomically, preventing orphaned sessions

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone https://github.com/your-username/integration-bee-trainer.git
cd integration-bee-trainer
npm install
```

### Database Setup

Run the schema migrations against your PostgreSQL instance:

```bash
psql -U your_user -d your_db -f schema.sql
```

### Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/integration_bee

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email / SMTP (for verification emails and 2FA)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@yourdomain.com
```

> If SMTP is not configured in development, verification codes are logged to the server console automatically.

---

## Future Improvements

- **WebSocket-based real-time** — replace polling with persistent connections for instant state sync
- **Tournament bracket mode** — structured multi-round elimination tournaments
- **Problem set authoring** — allow admins or community members to contribute new integrals
- **Spectator mode** — watch ongoing matches live
- **Match replay** — step-by-step review of a completed match
- **Mobile-optimized input** — better math input experience on touch devices
- **Public leaderboards** — global and friend-filtered Elo rankings

---

## Why This Project Is Interesting

Most "real-time multiplayer" side projects are todo lists with a WebSocket bolted on. This one is different:

**Domain complexity.** Competitive math battles require answer equivalence checking — `sin²x + cos²x` and `1` are the same answer. Handling this correctly at scale is a non-trivial engineering problem.

**Full match lifecycle.** The system enforces a complete state machine: room creation → lobby → ready gate → match phases → cooldown → scoring → Elo update. Every transition is server-authoritative and idempotent.

**Security-conscious design.** Wrong-answer lockouts are enforced at the database level, not the client. Room passwords are bcrypt-hashed. Auth tokens are SHA-256 hashed in storage. Rate limiting is applied to sensitive endpoints.

**Production patterns throughout.** Connection pooling, atomic transactions for match state transitions, proper error boundaries, and clean separation between UI and API layer — the kind of decisions that matter in a real codebase.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
