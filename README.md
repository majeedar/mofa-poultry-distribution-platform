# PIRCMES — Poultry Industry Revitalization Central Monitoring & Evaluation System
**Feed Ghana Programme · Ministry of Food and Agriculture (MoFA)**

---

## Quick Start — Docker (recommended)

The entire backend stack runs in containers. Only Docker Desktop is required — no local Node.js or PostgreSQL installation needed.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- (Mobile) Android device or emulator + Expo Go app

### 1. Start all services

```bash
docker compose up --build -d
```

This starts three containers:
- **postgres** — PostgreSQL 16, schema auto-applied on first run
- **server** — Express API + Socket.io on port 3000
- **web** — Nginx serving the built React dashboard on port 80

### 2. Seed demo data (once, after first start)

```bash
docker compose --profile seed run --rm seed
```

### 3. Open the dashboard

```
http://localhost
```

API is available at `http://localhost:3000`.

### Useful commands

```bash
# View running containers
docker compose ps

# Follow server logs
docker compose logs -f server

# Stop all containers
docker compose down

# Full reset — wipe database and uploads
docker compose down -v
docker compose up --build -d
docker compose --profile seed run --rm seed
```

---

## Quick Start — Local (without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 16 running locally
- (Mobile) Android device or emulator + Expo Go app

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE pircmes;"
psql -U postgres -d pircmes -f server/src/db/schema.sql
node server/src/db/seed.js
```

### 2. API Server

```bash
cd server
npm install
npm start            # → http://localhost:3000
```

### 3. Web Dashboard

```bash
cd web
npm install
npm run dev          # → http://localhost:5173
```

### 4. Login

| Role              | Email                         | Password   |
|-------------------|-------------------------------|------------|
| National Admin    | admin@pircmes.gov.gh          | Demo2026!  |
| National Officer  | coordinator@pircmes.gov.gh    | Demo2026!  |
| Regional Officer  | regional@pircmes.gov.gh       | Demo2026!  |
| District Officer  | district@pircmes.gov.gh       | Demo2026!  |
| Distributor       | dist1@pircmes.gov.gh          | Demo2026!  |
| Service Provider  | sp1@pircmes.gov.gh            | Demo2026!  |
| AEA               | aea1@pircmes.gov.gh           | Demo2026!  |
| Farmer            | f1@pircmes.gov.gh             | Demo2026!  |

---

## Demo: USSD + SMS Simulator

1. Login to web dashboard as **National Admin** or **National Officer**
2. Navigate to **Demo Simulator**
3. Dial `*714#` in the phone UI
4. Enter farmer ID (e.g. `F006`, `F007`, `F008` — household farmers without tablets)
5. Follow the prompts to submit a daily entry
6. Watch the SMS confirmation appear in real-time in the SMS Inbox panel

---

## Mobile Apps (Expo)

Four separate apps, each with its own `app.json` and entry point. All share
dependencies from `mobile/node_modules`.

### Prerequisites
- [Expo Go](https://expo.dev/go) installed on your Android device or emulator
- Node.js 20+

### Run an app

```bash
# Install dependencies once (already done if you cloned this repo)
cd mobile && npm install

# Start the app you want (cd into the specific app directory)
cd mobile/apps/aea          && npx expo start
cd mobile/apps/farm         && npx expo start
cd mobile/apps/distributor  && npx expo start
cd mobile/apps/service-provider && npx expo start
```

Scan the QR code in the terminal with Expo Go on your device.

### API URL

| Device type | URL in `mobile/shared/api.js` |
|-------------|-------------------------------|
| Android emulator | `http://10.0.2.2:3001` ← already set |
| Physical device (same WiFi) | Change to your machine's LAN IP, e.g. `http://192.168.1.100:3001` |

### Demo logins for each app

| App | Email | Password |
|-----|-------|----------|
| Distributor | dist1@pircmes.gov.gh | Demo2026! |
| Service Provider | sp1@pircmes.gov.gh | Demo2026! |
| Farm | f1@pircmes.gov.gh | Demo2026! |
| AEA | aea1@pircmes.gov.gh | Demo2026! |

---

## Architecture

```
┌──────────────────┐   REST + Socket.io   ┌────────────────────────┐
│  Web Dashboard   │◄────────────────────►│  Express API           │
│  React 18 + Vite │                      │  Node.js 20 · Port 3000│
│  Tailwind CSS    │                      │  PostgreSQL 16         │
└──────────────────┘                      └────────────────────────┘
                                                    ▲
                                          REST + SQLite offline sync
                                                    │
          ┌─────────────────────────────────────────┘
          │
   ┌──────┴──────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ Distributor │   │   SP App     │   │   Farm App   │   │   AEA App    │
   │  Expo App   │   │  Expo App    │   │  Expo App    │   │  Expo App    │
   └─────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

---

## Key Features

- **Ghana Card** (`GHA-XXXXXXXXX-X`) as sole universal identifier — prevents double registration
- **Three-level barcode system**: Batch → Allocation (SP) → Farmer Delivery
- **Registration approval workflow**: AEA registers farmers → National Admin approves
- **Excel bulk upload** at national level for distributors, SPs, AEAs, and oversight members
- **Audit trail**: every database mutation logged with actor, old values, new values
- **USSD + SMS demo simulator**: built-in, zero external dependencies (Socket.io)
- **Mock OCR**: mortality photos analysed with ±10% variance simulation
- **Geofenced farm visits**: AEA must be within 50m of farm GPS coordinates
- **Offline-first mobile**: SQLite write-first, background sync every 30s

---

## Environment Variables

Edit `server/.env` before starting:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pircmes
JWT_SECRET=pircmes-demo-secret-2026
PORT=3000
```

Edit `web/.env` before starting:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```
