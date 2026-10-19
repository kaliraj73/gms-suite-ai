import AiLayer from './components/AiLayer.jsx';

export default function App() {
  return <main className="app-shell">
    <header className="app-header"><div className="brand-mark" aria-hidden="true">G</div><div><p className="eyebrow">GROUNDWATER MONITORING SUITE</p><h1>GMS Suite AI</h1></div><span className="starter-tag">AI Studio preview</span></header>
    <section className="intro"><h2>GMS AI Studio</h2><p>Gemini and OpenRouter chat, guided groundwater and rainfall tools, text/CSV context, and browser voice controls. Provider keys remain on the backend.</p></section>
    <AiLayer />
    <footer className="app-footer">AI tools provide analysis guidance only. Review results before using them in official GMS records; this preview does not write to DuckDB or modify master workbooks.</footer>
  </main>;
}