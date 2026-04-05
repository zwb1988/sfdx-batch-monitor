# Salesforce Monitor

A Node.js web app that monitors Salesforce Batch Apex and scheduled Apex jobs using the Salesforce CLI (`sf`). It lists your authenticated orgs, lets you pick an environment, and shows live-updating tables for batch job details (progress, status, filters) and scheduled cron triggers.

## What it does

- **List orgs** — Loads environments from `sf org list` so you can choose which org to monitor.
- **Query batch jobs** — Uses `sf data query` to fetch AsyncApexJob records (BatchApex) for the selected org.
- **Scheduled Apex** — **Batch schedule** tab lists CronTrigger rows (scheduled jobs) and enriches Apex class names from AsyncApexJob where available.
- **Org limits** — **Org limits** tab calls `sf force limits api display` for the selected org and shows API limits with consumption bars; it uses the same refresh interval and status line pattern as the batch monitor.
- **Live tables** — Batch tab: Batch ID, Apex Class name, Job Type, Job Items Processed, Status, Total Job Items, **Progress** (circular % ring), Started, and Completed.
- **Filters** — Filter by status (Queued, Preparing, Processing, Completed, Failed, Aborted, Holding), optional Job ID, and search by Apex class name.
- **Auto-refresh** — Configurable refresh interval (minimum 1 second); shows “Refresh every X second(s)” and last refreshed date/time.
- **Refresh now** — Button to trigger an immediate refresh without waiting for the next interval.
- **Light / dark theme** — Theme switcher in the header; preference is saved in the browser.

All other controls (interval, Job ID, search, status filters, Refresh now) are disabled until you select an environment.

## Prerequisites

- **Node.js** 18 or newer
- **Salesforce CLI** installed and on your PATH as `sf`  
  - Install: [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli)
- At least one org authenticated (e.g. `sf org login web` or `sf login org`)

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

Then open **http://localhost:3000** in your browser (or the port shown in the console). You can override the port with the `PORT` environment variable:

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

1. **Select an environment** — Choose an org from the dropdown (populated from `sf org list`). Other controls stay disabled until you select one.
2. **Set refresh interval** — Enter the number of seconds between automatic refreshes (minimum 1).
3. **Optional filters** — Use Job ID to monitor a single job, and/or search by Apex class name. Check/uncheck statuses to filter by job status.
4. **Refresh now** — Click the ↻ button to refresh the table immediately.
5. **Theme** — Use the ☀/🌙 button in the header to switch between light and dark theme; the choice is remembered.

The table sorts by the column headers (click to toggle ascending/descending). Progress is shown as a green circular ring with a percentage when job items data is available.

## Lint

Runs ESLint on the server code and on the React app under `client/`:

```bash
npm run lint
```

## Configuration

- **Port** — `PORT` (default: 3000)
- **SF CLI** — Timeout and max buffer for `sf` commands are set in `config/constants.js` (e.g. `SF_CLI_TIMEOUT_MS`, `SF_CLI_MAX_BUFFER`)

## Tech stack

- **Backend:** Node.js, Express
- **Frontend:** React, TypeScript, Vite, Zustand; global styles under `client/src/styles/` (themes via CSS custom properties)
- **Data:** Salesforce CLI (`sf org list`, `sf data query`) with JSON output
