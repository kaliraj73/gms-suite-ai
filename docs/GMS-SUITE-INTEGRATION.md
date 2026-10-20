# Connect the GMS Suite dashboard to GMS AI Studio

The AI Studio includes a dashboard launcher that opens the existing GMS Suite service in a separate tab. By default, it points to the current Cloud Shell dashboard URL supplied for this integration:

`https://8001-cs-989819987085-default.cs-asia-southeast1-bool.cloudshell.dev/`

Override this public URL at frontend build time by setting `VITE_GMS_SUITE_URL` if the dashboard is redeployed or its Cloud Shell URL changes. The dashboard URL is not a secret; never put API keys in a `VITE_*` variable.

## Architecture and safety

This integration keeps the React/Vite AI Studio and the existing GMS Suite dashboard as separate services. The AI Studio provides a launch card; dashboard screenshot OCR, weather summary, FORMAT-II, Excel/PDF processing, and reports continue to run in the dashboard service.

Do not commit API keys, `.env`, DuckDB/database files, private screenshots, uploads, generated exports, or private workbooks. The dashboard's runtime data remains outside this Git repository.

## Ports

- AI API: port 8000
- GMS dashboard: port 8001
- Vite frontend: usually port 5173 in development

## Run in Android Cloud Shell

Run the AI API from the repository root:

```bash
cd server
npm install
cp .env.example .env
# Add provider keys locally to server/.env; never commit this file.
npm start
```

Run the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Run the dashboard from the trusted uploaded ZIP in a separate runtime directory:

```bash
mkdir -p ~/gms-suite-runtime
unzip -o ~/gms-suite.zip -d ~/gms-suite-runtime
cd ~/gms-suite-runtime/gms-suite
PORT=8001 ./start.sh
```

If the dashboard uses OCR/PDF/legacy MDB features, install only the system dependencies required by those features and verify the project's setup instructions.

## Validation

- Open the AI Studio frontend and click **Open GMS dashboard**.
- Verify the dashboard's existing tools, uploads, OCR, exports, and persistence with non-sensitive sample data.
- Confirm `GET /api/ai/health` exposes only provider configuration status, not credentials.
- Run `npm run build` in `frontend` and `npm test` in `server`.

## Integration boundary

The launcher connects the user experience only. It does not proxy dashboard APIs or give the AI direct access to DuckDB/workbooks. AI tool buttons create guided prompts and do not execute database mutations. PDF/XLSX parsing and image OCR are not implemented by the AI frontend. A future data-aware integration should add authenticated, validated, read-only APIs and audit logging rather than exposing database files or upload directories to the browser.
