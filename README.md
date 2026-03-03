# Meerako Lead Generator

Meerako Lead Generator is a local-first Electron desktop CRM for B2B lead generation, outreach, and task execution.

## Tech Stack

- Electron Forge + Electron 34 + Vite + React 19 + TypeScript
- Tailwind CSS + shadcn-style UI + lucide-react
- Zustand + TanStack Query + TanStack Table + TanStack Virtual
- Recharts + date-fns + zod
- better-sqlite3 + Drizzle ORM (main process only)
- Secure IPC via preload + `contextIsolation`
- `electron-store`, `safeStorage`, `nodemailer`, `electron-log`, `papaparse`

## Project Structure

```
leadforge-pro/
├── src/
│   ├── main/
│   ├── preload.ts
│   ├── renderer/
│   └── lib/
├── db/
│   ├── schema.ts
│   └── migrations/
├── public/
├── package.json
├── electron.vite.config.ts
├── tailwind.config.ts
└── drizzle.config.ts
```

## How To Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development app:
   ```bash
   npm run dev
   ```
3. Build production package:
   ```bash
   npm run build
   ```
4. Create installers/artifacts:
   ```bash
   npm run make
   ```

## Key Runtime Notes

- On first launch, the app auto-seeds 25 realistic leads, templates, tasks, and history.
- SQLite DB lives in Electron `userData` path as `leadforge.db`.
- All DB queries happen in main process IPC handlers.
- API keys and SMTP password are encrypted with `safeStorage` before persistence in `electron-store`.

## Hunter.io Integration

1. Open `Settings -> Integrations`.
2. Paste Hunter API key.
3. Click `Test`.
4. In Find Leads enrichment flow, email verification attempts Hunter verification and falls back gracefully when unavailable.

## SMTP Enablement

1. Open `Settings -> SMTP`.
2. Fill host/port/secure/username/password/from fields.
3. Save settings.
4. Use `Send Test Email` to validate.
5. Campaign send uses these SMTP credentials via Nodemailer.

## Compliance

This tool is for internal use only. Ensure outreach and data handling comply with GDPR, CAN-SPAM, and applicable local privacy laws.
