import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHealth, fetchModels, sendPrompt } from '../api/aiClient.js';
import './AiLayer.css';

const HISTORY_KEY = 'gms-suite-ai-history-v1';
function readHistory() {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(value) ? value.slice(-30) : []; }
  catch { return []; }
}
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export default function AiLayer() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState(readHistory);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);

  const refresh = useCallback(async () => {
    setLoadingModels(true); setError('');
    try {
      const [modelResult, healthResult] = await Promise.all([fetchModels(), fetchHealth()]);
      const next = Array.isArray(modelResult.models) ? modelResult.models : [];
      setModels(next); setHealth(healthResult);
      setSelectedModel((current) => next.some((item) => item.id === current) ? current : (next.find((item) => item.free)?.id || next[0]?.id || ''));
      if (!next.length) setError('No models are available. Configure a provider key in server/.env and refresh.');
      if (modelResult.warnings?.length) setError(modelResult.warnings.join(' '));
    } catch (err) { setError(err.message || 'Could not load models.'); setHealth(null); }
    finally { setLoadingModels(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-30))); } catch { /* storage can be unavailable */ } }, [history]);
  const selected = useMemo(() => models.find((item) => item.id === selectedModel), [models, selectedModel]);

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;
    if (!selectedModel) { setError('Choose a configured model first.'); return; }
    setHistory((items) => [...items, { id:newId(), role:'user', content:cleanPrompt, createdAt:new Date().toISOString() }].slice(-30));
    setPrompt(''); setLoading(true); setError('');
    try {
      const result = await sendPrompt({ model:selectedModel, prompt:cleanPrompt });
      setHistory((items) => [...items, { id:newId(), role:'assistant', content:result.output || 'Provider returned an empty response.', provider:result.provider, model:result.model, fallbackUsed:Boolean(result.fallbackUsed), createdAt:new Date().toISOString() }].slice(-30));
    } catch (err) { setError(err.message || 'AI request failed.'); }
    finally { setLoading(false); }
  }

  return <section className="ai-panel" aria-labelledby="ai-title">
    <div className="ai-panel-heading"><div><h2 id="ai-title">AI assistant</h2><p>Use configured OpenRouter models or optional Gemini models.</p></div><button className="button button-secondary" type="button" onClick={refresh} disabled={loadingModels||loading}>{loadingModels?'Loading…':'Refresh models'}</button></div>
    <div className="provider-status" role="status"><span className={health?.status==='ok'?'status-dot status-dot-ok':'status-dot'}/>{health?.status==='ok'? `API online · OpenRouter ${health.providers?.openrouter?'configured':'not configured'} · Gemini ${health.providers?.gemini?'configured':'not configured'}`:'Checking API connection…'}</div>
    <form onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="model-select">Model</label>
      <select id="model-select" className="model-select" value={selectedModel} onChange={(e)=>setSelectedModel(e.target.value)} disabled={loadingModels||loading||models.length===0}>
        {!models.length&&<option value="">No models available</option>}
        {models.map((m)=><option key={m.id} value={m.id}>{m.label||m.name||m.id}{m.free?' · free-reported':' · check quota/pricing'}</option>)}
      </select>
      {selected&&!selected.free&&<p className="provider-note">This model is not marked free in the configuration. Check current provider terms and your account quota.</p>}
      <label className="field-label" htmlFor="prompt-input">Your prompt</label>
      <textarea id="prompt-input" value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Ask about groundwater monitoring, rainfall data, or software development…" rows={4} maxLength={12000} disabled={loading}/>
      <div className="composer-footer"><span className="character-count">{prompt.length.toLocaleString()} / 12,000</span><div className="composer-actions"><button className="button button-secondary" type="button" onClick={()=>{setHistory([]);setError('');}} disabled={loading&&history.length===0}>Clear history</button><button className="button button-primary" type="submit" disabled={loading||loadingModels||!prompt.trim()||!selectedModel}>{loading?'Thinking…':'Send prompt'}</button></div></div>
    </form>
    {error&&<div className="error-message" role="alert">{error}</div>}
    <div className="conversation" aria-live="polite">{history.length===0?<div className="empty-state"><div className="empty-state-icon" aria-hidden="true">✦</div><strong>Your conversation will appear here</strong><p>Choose a model and send a prompt to begin.</p></div>:history.map((item)=><article className={`message message-${item.role}`} key={item.id}><div className="message-meta"><strong>{item.role==='user'?'You':'GMS AI'}</strong>{item.provider&&<span>{item.provider}{item.fallbackUsed?' · fallback used':''}</span>}</div><p>{item.content}</p></article>)}</div>
  </section>;
}