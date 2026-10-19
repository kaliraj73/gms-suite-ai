import AiLayer from './components/AiLayer.jsx';

export default function App() {
  return <main className="app-shell">
    <header className="app-header"><div className="brand-mark" aria-hidden="true">G</div><div><p className="eyebrow">GROUNDWATER MONITORING SUITE</p><h1>GMS Suite AI</h1></div><span className="starter-tag">AI starter</span></header>
    <section className="intro"><h2>Your AI tools layer</h2><p>A lightweight starting point for OpenRouter and Gemini integration. Provider keys remain on the backend.</p></section>
    <AiLayer />
    <footer className="app-footer">Starter scaffold — not yet the complete rainfall-monitoring application.</footer>
  </main>;
}