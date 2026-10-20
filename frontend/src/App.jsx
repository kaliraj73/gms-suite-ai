import AiLayer from './components/AiLayer.jsx';

// Default to the user's current Cloud Shell dashboard. Override at build time for another deployment.
const configuredDashboardUrl = import.meta.env.VITE_GMS_SUITE_URL?.trim()
  || 'https://8001-cs-989819987085-default.cs-asia-southeast1-bool.cloudshell.dev/';
function getDashboardUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().replace(/\/$/, '') : '';
  } catch { return ''; }
}

export default function App() {
  const dashboardUrl = getDashboardUrl(configuredDashboardUrl);
  return <main className="app-shell">
    <header className="app-header"><div className="brand-mark" aria-hidden="true">G</div><div><p className="eyebrow">GROUNDWATER MONITORING SUITE</p><h1>GMS Suite</h1></div><span className="starter-tag">AI Studio + Dashboard</span></header>
    <section className="intro"><h2>One workspace for GMS</h2><p>Open the existing GMS Suite data tools and use the Gemini/OpenRouter AI Studio alongside them. The dashboard runs as a separate service so its existing OCR, Excel/PDF processing, and report workflows are preserved.</p></section>
    <section className="dashboard-connection" aria-labelledby="dashboard-title">
      <div className="dashboard-copy"><div className="dashboard-icon" aria-hidden="true">▦</div><div><h2 id="dashboard-title">GMS Suite dashboard</h2><p>Screenshot Extractor · Weather Monthly Summary · FORMAT-II Dashboard</p></div></div>
      {dashboardUrl
        ? <a className="button button-primary dashboard-open" href={dashboardUrl} target="_blank" rel="noopener noreferrer">Open GMS dashboard ↗</a>
        : <div className="dashboard-setup" role="status"><strong>Dashboard URL not configured</strong><span>Set <code>VITE_GMS_SUITE_URL</code> to the dashboard's Cloud Shell Web Preview URL and restart the frontend.</span></div>}
    </section>
    <AiLayer />
    <footer className="app-footer">AI tools provide analysis guidance only. Review results before using them in official records. This AI preview does not directly write to DuckDB or modify master workbooks. The dashboard is linked as a separate service; its database and uploaded files stay outside this Git repository.</footer>
  </main>;
}
