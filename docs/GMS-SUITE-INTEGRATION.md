# Connect the GMS Suite dashboard to GMS AI Studio

This integration keeps the current React/Express AI Studio and the uploaded Flask/FastAPI GMS Suite dashboard as separate services. The AI Studio shows a dashboard launch card; the dashboard's existing screenshot OCR, weather-summary, and FORMAT-II workflows remain in their own runtime. No database or user uploads are copied into Git.

## 1. Keep the repository clean

Do not commit any of the following from the v4.1 ZIP or Cloud Shell runtime:

- `.env` or API keys
- `gms.duckdb` / other database files
- `uploads/`, private screenshots, generated exports, or user workbooks
- local virtual environments, caches, or dependency folders

Use the repository's `server/.env.example` as the key-name reference; put real provider keys only in the local `server/.env` or a deployment secret store.

## 2. Start the AI Studio services

From the repository root in Cloud Shell:

```bash
cd server
npm install
cp .env.example .env
# Add provider keys locally to server/.env; do not commit this file.
npm start
```

In another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

The AI API uses port 8000 by default; the Vite frontend usually uses port 5173.

## 3. Start the GMS Suite dashboard separately

Upload the trusted `gms-suite.zip` archive to your Cloud Shell home directory. Then run:

```bash
mkdir -p ~/gms-suite-runtime
unzip -o ~/gms-suite.zip -d ~/gms-suite-runtime
cd ~/gms-suite-runtime/gms-suite
PORT=8001 ./start.sh
```

Install system dependencies if the tools you need require them:

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr mdbtools libreoffice poppler-utils
```

The dashboard is intentionally assigned port 8001 so it does not collide with the AI API on port 8000. Its runtime folder and generated data remain outside the Git repository.

## 4. Link the dashboard in AI Studio

Open Cloud Shell Web Preview for port 8001 and copy the exact URL it provides. In the repository's `frontend` directory, create a local `.env.local` file:

```bash
cd ~/gms-suite-ai/frontend
printf 'VITE_GMS_SUITE_URL=%s\n' 'PASTE_THE_EXACT_PORT_8001_WEB_PREVIEW_URL_HERE' > .env.local
```

Replace the placeholder with the actual URL from Cloud Shell Web Preview. Then stop and restart the Vite frontend. The dashboard launch card will open that URL in a separate tab. `VITE_GMS_SUITE_URL` is a public URL, not a secret; never put API keys in a `VITE_*` variable.

For a production deployment, set `VITE_GMS_SUITE_URL` to the deployed dashboard's HTTPS URL at frontend build time. Deploy the dashboard separately with its required Python/system packages, persistent storage policy, and access controls.

## 5. Verify

- Open the AI Studio frontend and confirm the dashboard card shows the configured URL.
- Open the dashboard in a new tab and test each existing tool independently.
- Confirm `GET /api/ai/health` still reports provider configuration without exposing secrets.
- Run `cd frontend && npm run build` and `cd server && npm test`.
- Test upload, OCR, export, and data persistence with non-sensitive sample data before using official records.

## Current integration boundary

The launch card connects the user experience, but it does not proxy dashboard APIs or grant the AI access to DuckDB/workbooks. The AI tools still work from prompts and text attachments. A future data-aware integration should add explicit read-only dashboard API endpoints, authentication, schema validation, and audit logging before allowing AI analysis of stored records. Do not expose DuckDB or upload directories directly to the browser.
