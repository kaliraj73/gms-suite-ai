import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchHealth, fetchModels, sendPrompt } from '../api/aiClient.js';
import './AiLayer.css';

const HISTORY_KEY = 'gms-suite-ai-history-v1';
function readHistory() {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(value) ? value.slice(-30) : []; }
  catch { return []; }
}
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const AI_TOOLS = [
  { id: 'well-trends', label: '💧 Well trends', prompt: 'Analyze the groundwater well readings I provide. Identify trends, unusual changes, and wells needing review. Do not invent missing readings; show calculations where possible.' },
  { id: 'rainfall', label: '🌧️ Rainfall summary', prompt: 'Summarize the rainfall data I provide by station and date. Check totals, zero/Nil handling, missing days, duplicate dates, and unusual values. Do not modify source records.' },
  { id: 'quality', label: '🔎 Data quality', prompt: 'Audit supplied GMS data for missing values, duplicate stations or dates, inconsistent date formats, invalid numeric readings, and outliers. Return a table of issues and safe recommendations; do not assume corrections are confirmed.' },
  { id: 'master-match', label: '📎 Master match', prompt: 'Help map supplied source headers and station names to a master workbook. Propose an explicit mapping table, flag ambiguous matches, and do not silently merge similar station names.' },
  { id: 'report', label: '📊 Report helper', prompt: 'Turn the supplied GMS data into a clear report summary with key findings, limitations, and recommended follow-up checks. Distinguish facts from suggestions.' },
  { id: 'ocr-help', label: '🧾 OCR validation', prompt: 'Help validate OCR-extracted GMS readings from the text I provide. Check station IDs, dates, decimal readings, and ambiguous characters. If the source image is unavailable, ask for extracted text rather than guessing.' },
];


export default function AiLayer() {
  const [models, setModels] = useState([]);
  const [mode, setMode] = useState('openrouter');
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState(readHistory);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);
  const [activeTool, setActiveTool] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch { /* recognition may already be stopped */ }
    window.speechSynthesis?.cancel?.();
  }, []);

  const refresh = useCallback(async (forceRefresh = false) => {
    setLoadingModels(true); setError('');
    try {
      const [modelResult, healthResult] = await Promise.all([fetchModels({ refresh: forceRefresh }), fetchHealth()]);
      const next = Array.isArray(modelResult.models) ? modelResult.models : [];
      setModels(next); setHealth(healthResult);
      setSelectedModel((current) => next.some((item) => item.id === current) ? current : (next.find((item) => item.provider === 'openrouter' && item.free)?.id || next.find((item) => item.provider === 'openrouter')?.id || next[0]?.id || ''));
      if (!next.length) setError('No models are available. Configure a provider key in server/.env and refresh.');
      if (modelResult.warnings?.length) setError(modelResult.warnings.join(' '));
    } catch (err) { setError(err.message || 'Could not load models.'); setHealth(null); }
    finally { setLoadingModels(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-30))); } catch { /* storage can be unavailable */ } }, [history]);

  async function copyMessage(content) {
    try { await navigator.clipboard.writeText(content); setError('Response copied to clipboard.'); }
    catch { setError('Clipboard access is unavailable in this browser. Select and copy the response text manually.'); }
  }

  function clearChat() {
    setHistory([]);
    setError('');
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage can be unavailable */ }
  }

  const availableModels = useMemo(() => {
    if (mode === 'openrouter') return models.filter((item) => item.provider === 'openrouter');
    if (mode === 'gemini') return models.filter((item) => item.provider === 'gemini');
    return models;
  }, [models, mode]);
  const selected = useMemo(() => availableModels.find((item) => item.id === selectedModel), [availableModels, selectedModel]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    const next = nextMode === 'openrouter' ? models.filter((m) => m.provider === 'openrouter')
      : nextMode === 'gemini' ? models.filter((m) => m.provider === 'gemini') : models;
    setSelectedModel(next.find((m) => m.free)?.id || next[0]?.id || '');
    if (nextMode === 'gemini' && !health?.providers?.gemini) setError('Gemini is not configured. Add GEMINI_API_KEY to server/.env, then restart the backend.');
    if (nextMode === 'openrouter' && !health?.providers?.openrouter) setError('OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env, then restart the backend.');
    if (nextMode === 'both' && !(health?.providers?.openrouter && health?.providers?.gemini)) setError('Fallback mode works best with both provider keys configured. It will use any configured provider.');
  }

  function useTool(tool) {
    setActiveTool(tool.id);
    setPrompt((current) => (current.trim() ? current.trim() + '\n\n' + tool.prompt : tool.prompt).slice(0, 12000));
  }

  async function attachTextFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(txt|csv|json|md)$/i.test(file.name)) {
      setError('For this starter, attach TXT, CSV, JSON, or Markdown files. PDF/XLSX/image parsing needs a dedicated backend route.');
      return;
    }
    try {
      const text = await file.text();
      const clipped = text.slice(0, 8000);
      const block = 'Attached text file: ' + file.name + '\n' + clipped + (text.length > 8000 ? '\n[Attachment truncated to 8,000 characters]' : '');
      setPrompt((current) => ((current.trim() ? current.trim() + '\n\n' : '') + block).slice(0, 12000));
      setError(text.length > 8000 ? 'File attached as text; content was truncated to fit the prompt limit.' : 'Attached ' + file.name + ' as text.');
    } catch { setError('Could not read this file as text.'); }
  }

  function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Voice input is not supported by this browser. Try Edge or Chrome over HTTPS.'); return; }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch { /* recognition may already be stopped */ }
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || 'en-IN';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const spoken = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (spoken) setPrompt((current) => ((current.trim() ? current.trim() + ' ' : '') + spoken).slice(0, 12000));
    };
    recognition.onerror = (event) => setError(event.error === 'not-allowed' ? 'Microphone permission is blocked. Allow it in browser site settings.' : 'Voice input failed: ' + (event.error || 'unknown error'));
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    setListening(true);
    try { recognition.start(); } catch { recognitionRef.current = null; setListening(false); setError('Could not start voice input. Please try again.'); }
  }

  function speakResponse(content) {
    if (!('speechSynthesis' in window)) { setError('Speech output is not supported by this browser.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = navigator.language || 'en-IN';
    window.speechSynthesis.speak(utterance);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;
    if (!selectedModel) { setError(mode === 'gemini' ? 'No Gemini model is available. Configure GEMINI_API_KEY and refresh models.' : 'Choose a configured model first.'); return; }
    setHistory((items) => [...items, { id:newId(), role:'user', content:cleanPrompt, createdAt:new Date().toISOString() }].slice(-30));
    setPrompt(''); setLoading(true); setError('');
    try {
      const result = await sendPrompt({ model:selectedModel, mode, prompt:cleanPrompt });
      setHistory((items) => [...items, { id:newId(), role:'assistant', content:result.output || 'Provider returned an empty response.', provider:result.provider, model:result.model, fallbackUsed:Boolean(result.fallbackUsed), createdAt:new Date().toISOString() }].slice(-30));
    } catch (err) { setError(err.message || 'AI request failed.'); }
    finally { setLoading(false); }
  }

  return <section className="ai-panel" aria-labelledby="ai-title">
    <div className="ai-panel-heading"><div><h2 id="ai-title">AI assistant</h2><p>Choose OpenRouter, Gemini, or automatic cross-provider fallback.</p></div><button className="button button-secondary" type="button" onClick={() => refresh(true)} disabled={loadingModels||loading}>{loadingModels?'Loading…':'Refresh models'}</button></div>
    <div className="provider-status" role="status"><span className={health?.status==='ok'?'status-dot status-dot-ok':'status-dot'}/>{health?.status==='ok'? `API online · OpenRouter ${health.providers?.openrouter?'configured':'not configured'} · Gemini ${health.providers?.gemini?'configured':'not configured'}`:'Checking API connection…'}</div>
    <div className="ai-tools-menu" aria-label="GMS AI tools"><div className="ai-tools-heading"><strong>AI tools</strong><span>Choose a guided task</span></div><div className="ai-tools-grid">{AI_TOOLS.map((tool) => <button key={tool.id} type="button" className={activeTool === tool.id ? "ai-tool-button ai-tool-active" : "ai-tool-button"} aria-pressed={activeTool === tool.id} onClick={() => useTool(tool)} disabled={loading}>{tool.label}</button>)}</div><p className="ai-tool-note">Tools guide the AI using your prompt and supplied text; they do not directly change DuckDB or master files.</p></div>
    <form onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="provider-mode">AI provider mode</label>
      <select id="provider-mode" className="model-select" value={mode} onChange={(e)=>changeMode(e.target.value)} disabled={loading}>
        <option value="openrouter">OpenRouter only</option>
        <option value="gemini">Gemini only</option>
        <option value="both">Both providers · automatic fallback</option>
      </select>
      {mode==='both'&&<p className="provider-note">The selected provider is tried first. If it fails, the server tries the other configured provider. Fallback is shown in the response history.</p>}
      <label className="field-label" htmlFor="model-select">Model</label>
      <select id="model-select" className="model-select" value={selectedModel} onChange={(e)=>setSelectedModel(e.target.value)} disabled={loadingModels||loading||availableModels.length===0}>
        {!availableModels.length&&<option value="">No models available for this mode</option>}
        {availableModels.map((m)=><option key={m.id} value={m.id}>{m.label||m.name||m.id}{m.free?' · free-reported':' · check quota/pricing'}</option>)}
      </select>
      {selected&&!selected.free&&<p className="provider-note">This model is not marked free in the configuration. Check current provider terms and your account quota.</p>}
      <label className="field-label" htmlFor="prompt-input">Your prompt</label>
      <textarea id="prompt-input" value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Ask about groundwater monitoring, rainfall data, or software development…" rows={4} maxLength={12000} disabled={loading}/>
      <div className="ai-attachment-row"><label className="button button-secondary file-attach-label">📎 Attach text/CSV<input type="file" accept=".txt,.csv,.json,.md,text/plain,text/csv,application/json" onChange={attachTextFile} disabled={loading} /></label><button className={listening ? "button button-secondary voice-active" : "button button-secondary"} type="button" onClick={toggleVoiceInput} disabled={loading} aria-pressed={listening}>{listening ? "🎙️ Listening…" : "🎙️ Voice input"}</button><span className="attachment-hint">TXT · CSV · JSON · MD</span></div>
      <div className="composer-footer"><span className="character-count">{prompt.length.toLocaleString()} / 12,000</span><div className="composer-actions"><button className="button button-secondary" type="button" onClick={clearChat} disabled={history.length===0}>Clear chat</button><button className="button button-primary" type="submit" disabled={loading||loadingModels||!prompt.trim()||!selectedModel}>{loading?'Thinking…':'Send prompt'}</button></div></div>
    </form>
    {error&&<div className="error-message" role="alert">{error}</div>}
    <div className="conversation" aria-live="polite">{history.length===0?<div className="empty-state"><div className="empty-state-icon" aria-hidden="true">✦</div><strong>Your conversation will appear here</strong><p>Choose a provider mode and send a prompt to begin.</p></div>:history.map((item)=><article className={`message message-${item.role}`} key={item.id}><div className="message-meta"><strong>{item.role==='user'?'You':'GMS AI'}</strong>{item.provider&&<span>{item.provider}{item.fallbackUsed?' · fallback used':''}</span>}</div><p>{item.content}</p>{item.role==='assistant'&&<div className="message-actions"><button className="button button-secondary message-copy" type="button" onClick={()=>copyMessage(item.content)}>Copy response</button><button className="button button-secondary message-copy" type="button" onClick={()=>speakResponse(item.content)}>🔊 Read aloud</button></div>}</article>)}</div>
  </section>;
}
