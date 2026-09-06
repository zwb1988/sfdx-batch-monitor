# Salesforce Monitor

A Node.js web app for Salesforce org monitoring and Data Cloud CSV ingest. Monitoring tools use the Salesforce CLI (`sf`) against orgs you already authenticated. Data Cloud CSV ingest uses a connected app (client-credentials flow) and talks to Data Cloud APIs from this local server.

The UI is a sidebar of tools under **Monitoring** and **Data Cloud**, with live-updating tables, charts, and a light/dark theme.

## What it does

### Monitoring (Salesforce CLI)

Pick an authenticated org in the **Environment** dropdown. Until an org is selected, monitoring controls stay disabled.

- **Batch monitor** — Queries `AsyncApexJob` (Batch Apex) via `sf data query`. Columns include Batch ID, Apex class, job type, items processed, status, total items, progress ring, started, and completed. Filter by status, optional Job ID, and Apex class search. Auto-refresh uses the interval in the header. Export the current table as CSV.
- **Batch schedule** — Lists `CronTrigger` scheduled jobs and enriches Apex class names from `AsyncApexJob` where available. Search by name or Apex class. Export as CSV. Does not use the global refresh interval.
- **Batch analysis** — On demand (`Analyze Batches`), exports all matching `AsyncApexJob` rows with Bulk API 2.0 (`sf data export bulk` to a temp CSV) and charts them locally: daily volume, day/hour heatmap, hourly starts, concurrency, and an execution timeline. Salesforce often retains only recent history. This tool does not use the global polling interval or status line.
- **Org limits** — Runs `sf force limits api display` and shows API limits with consumption bars. Uses the same refresh interval and status line as batch monitor.
- **Org objects** — Lists org sObjects with cached record counts (Salesforce updates those counts on its own schedule; they may be missing or stale). Search by API name, filter by type, and optionally fetch a live `COUNT()` for a row. Does not use the global refresh interval.

Click a batch or schedule row for a detail modal. Click column headers to sort.

### Data Cloud

- **CSV ingest** — Connect with a connected app’s client ID/secret (OAuth client credentials). Credentials go only to this local server and are not stored in the browser or project files. Choose an Ingestion API connector and object, pick upsert or delete, upload one or more CSV files, run the job, and watch job status until it completes.

CSV ingest does not use the org dropdown; it is a separate Data Cloud connection.

### Shared UI

- **Sidebar** — Categories and tools (Monitoring vs Data Cloud).
- **Auto-refresh** — Configurable interval (minimum 1 second) for batch monitor and org limits; last refreshed time is shown in the status line.
- **Refresh now** — Immediate refresh on tools that poll or load on demand.
- **Light / dark theme** — Header switcher; preference is saved in the browser.

## Prerequisites

- **Node.js** 18 or newer (20+ recommended)
- **Salesforce CLI** installed and on your PATH as `sf`  
  - Install: [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli)
- For **Monitoring**: at least one org authenticated (e.g. `sf org login web`)
- For **CSV ingest**: a Data Cloud connected app that allows the client-credentials flow, plus Ingestion API connectors/objects already set up in the org

## Setup

Install dependencies (root `postinstall` also installs `client/`):

```bash
npm install
```

## Run (production)

Build the React UI into `dist/` (ignored by git), then start the server:

```bash
npm run build
npm start
```

Then open **http://localhost:3000** in the browser (or the port shown in the console). Override the port with `PORT`:

```bash
PORT=4000 npm start
```

## Run (development)

Run the Express API and the Vite dev server together (API on port 3000 by default, UI on **http://localhost:5173** with `/api` proxied to Express):

```bash
npm run dev
```

Open **http://localhost:5173** so API calls go through the Vite proxy. Ensure nothing else is using port 3000, or adjust the proxy target in `client/vite.config.ts`.

## Usage

1. Choose a category and tool in the sidebar.
2. For Monitoring tools, select an **Environment**. Set the refresh interval where it appears (batch monitor and org limits).
3. Use tool-specific filters, search, refresh, and CSV export as needed.
4. For **Batch analysis**, click **Analyze Batches** after selecting an org (the bulk export can take a while on large history).
5. For **CSV ingest**, connect with login URL / client ID / client secret, then select connector, object, operation, and CSV files.
6. Toggle theme with the ☀/🌙 button in the header.

## Lint

Runs ESLint on the server code and on the React app under `client/`:

```bash
npm run lint
```

## Configuration

- **Port** — `PORT` (default: 3000)
- **SF CLI and Data Cloud** — Timeouts, SOQL limits, bulk-export caps, and CSV upload limits are in `config/constants.js` (e.g. `SF_CLI_TIMEOUT_MS`, `SF_CLI_MAX_BUFFER`, `BATCH_ANALYSIS_MAX_TOTAL_ROWS`, `DATA_CLOUD_MAX_CSV_BYTES`)

## Tech stack

- **Backend:** Node.js, Express; Salesforce CLI for monitoring; Data Cloud Connect/Ingest APIs for CSV ingest
- **Frontend:** React, TypeScript, Vite, Zustand, ECharts; global styles under `client/src/styles/` (themes via CSS custom properties)
- **Data:** `sf org list`, `sf data query`, `sf data export bulk`, `sf force limits api display`, plus Data Cloud ingest job APIs
