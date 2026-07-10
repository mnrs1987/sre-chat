import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input, Spinner, Select } from '@grafana/ui';
import { getBackendSrv } from '@grafana/runtime';

// --- Types ---
interface Options {
  apiUrl: string;
  method?: string;
  tenantId?: string;
  apiKey?: string;
  customHeaders?: string;
}

interface ChatMessage {
  id: string;
  text: string;
  json?: any;
  time: string;
  isUser?: boolean;
}

// --- Component: Typing Animation ---
const TypingText: React.FC<{
  text?: string;
  speed?: number;
  shouldAnimate?: boolean;
  onTypingProgress?: () => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
}> = ({ text = '', speed = 6, shouldAnimate = true, onTypingProgress, onTypingStart, onTypingEnd }) => {
  const [displayed, setDisplayed] = useState(shouldAnimate ? '' : text);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (!text) { setDisplayed(''); hasCompletedRef.current = false; return; }
    if (!shouldAnimate || hasCompletedRef.current) { setDisplayed(text); return; }

    setDisplayed('');
    onTypingStart?.();
    let i = 0;
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        hasCompletedRef.current = true;
        onTypingEnd?.();
        return;
      }
      setDisplayed((prev) => prev + text.charAt(i));
      i++;
      onTypingProgress?.();
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, shouldAnimate, onTypingStart, onTypingEnd, onTypingProgress]);

  return <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>{displayed}</pre>;
};

// --- Component: Main Assistant Window ---
export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());

  const chatRef = useRef<HTMLDivElement | null>(null);
  const timestamp = () => new Date().toLocaleTimeString();
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const scroll = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, []);

  const handleSend = async (val?: string) => {
    const query = val || input;
    if (!query.trim() || !options.apiUrl) return;

    const assistantMsgId = makeId();
    setMessages((p) => [...p, { id: makeId(), text: query, time: timestamp(), isUser: true }]);
    setLoading(true);
    setInput('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;
      if (options.customHeaders) {
        try { Object.assign(headers, JSON.parse(options.customHeaders)); } catch (e) {}
      }

      const method = (options.method || 'POST').toUpperCase();
      let url = options.apiUrl;
      const fetchOpts: RequestInit = { method, headers };

      if (method === 'POST') {
        fetchOpts.body = JSON.stringify({ query, model: selectedModel, stream: true });
      } else {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}query=${encodeURIComponent(query)}&model=${encodeURIComponent(selectedModel)}&stream=true`;
      }

      const res = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      if (reader) {
        // STREAMING MODE
        setMessages((p) => [...p, { id: assistantMsgId, text: '', time: timestamp(), isUser: false }]);
        setLoading(false);
        setIsTyping(true);
        setAnimatedIds((prev) => new Set(prev).add(assistantMsgId)); // Bypass TypingText for live stream

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, text: assistantText } : m)));
          scroll();
        }
      } else {
        // SINGLE RESPONSE MODE
        const raw = await res.text();
        setMessages((p) => [...p, { id: assistantMsgId, text: raw, time: timestamp(), isUser: false }]);
      }
    } catch (err: any) {
      setMessages((p) => [...p, { id: makeId(), text: `❌ Error: ${err.message}`, time: timestamp() }]);
    } finally {
      setLoading(false);
      setIsTyping(false);
      scroll();
    }
  };

  const modelOptions = [
    { label: 'GPT-4', value: 'gpt-4' },
    { label: 'GPT-3.5', value: 'gpt-3.5' },
    { label: 'Claude', value: 'claude' },
  ];

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height, borderRadius: 16 }}>
      <style>{`
        @keyframes aiShiftFast { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .glow-mesh { background: linear-gradient(115deg, #ff375f, #ff9f0a, #ffd60a, #64d2ff, #5e5ce6, #bf5af2, #ff375f); background-size: 150% 150%; animation: aiShiftFast 2.5s linear infinite; }
        .input-yellow-mesh { background: linear-gradient(90deg, #FFD700, #FF8C00, #FFE066, #FF9500, #FFD700); background-size: 200% auto; animation: aiShiftFast 2s linear infinite; }
        .p-select-menu, .css-1h9z7xy-menu { z-index: 99999 !important; }
      `}</style>

      {(loading || isTyping) && (
        <>
          <div className="glow-mesh" style={{ position: 'absolute', inset: -1, borderRadius: 16, padding: '2.5px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' as any, zIndex: 0 }} />
          <div className="glow-mesh" style={{ position: 'absolute', inset: -5, borderRadius: 22, filter: 'blur(14px)', opacity: 0.7, zIndex: 0 }} />
        </>
      )}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16, overflow: 'visible', background: '#0e1014', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)', padding: 10, textAlign: 'center', fontWeight: 'bold', color: '#000', borderRadius: '16px 16px 0 0' }}>
          AETNA SRE Assistant
        </div>

        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m) => {
            const isUser = !!m.isUser;
            return (
              <div key={m.id} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 16, background: isUser ? 'linear-gradient(135deg, #FFD700, #FF8C00)' : 'rgba(255,255,255,0.06)', color: isUser ? '#000' : '#e0e0e0', boxShadow: isUser ? '0 4px 12px rgba(255,165,0,0.25)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7em', fontWeight: 'bold', marginBottom: 4 }}>{isUser ? 'YOU' : 'ASSISTANT'}</div>
                    <TypingText
                      text={m.text}
                      shouldAnimate={!isUser && !animatedIds.has(m.id)}
                      onTypingProgress={scroll}
                      onTypingStart={() => setIsTyping(true)}
                      onTypingEnd={() => { setIsTyping(false); setAnimatedIds(p => new Set(p).add(m.id)); }}
                    />
                    <div style={{ fontSize: '0.6em', opacity: 0.8, marginTop: 4, textAlign: 'right', color: isUser ? '#000000' : '#FFD700' }}>{m.time}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {loading && <div style={{ color: '#FFD700', fontSize: '12px', paddingLeft: 10 }}><Spinner size={14} /> thinking...</div>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, background: '#16181d', borderTop: '1px solid #222', justifyContent: 'center' }}>
          {['Last 24h Logs', 'Critical Alerts', 'Memory Issues'].map((s, i) => (
            <Button key={i} variant="secondary" size="sm" onClick={() => handleSend(s)} style={{ borderRadius: 8 }}>{s}</Button>
          ))}
        </div>

        <div style={{ padding: 16, background: '#0e1014', borderRadius: '0 0 16px 16px' }}>
          <div className="input-yellow-mesh" style={{ borderRadius: 12, padding: '2px' }}>
            <div style={{ background: '#0e1014', borderRadius: 10, display: 'flex', gap: 8, padding: '4px 8px', position: 'relative' }}>
              <Input value={input} onChange={e => setInput(e.currentTarget.value)} placeholder="Type a query..." style={{ background: 'transparent', border: 'none', color: '#fff', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <Select
                width={14}
                options={modelOptions}
                value={modelOptions.find(o => o.value === selectedModel)}
                onChange={v => setSelectedModel(v.value!)}
                menuPlacement="top"
              />
              <Button onClick={() => handleSend()} style={{ background: 'linear-gradient(90deg, #FFD700, #FF8C00)', color: '#000', fontWeight: 'bold' }}>Ask</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 30, y: 30 });
  const [isDrag, setIsDrag] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const [dynOpts, setDynOpts] = useState<Options | null>(null);

  useEffect(() => {
    getBackendSrv().get(`/api/plugins/cvs-sample-app/settings`)
      .then(res => setDynOpts(res.jsonData))
      .catch(() => setDynOpts({ apiUrl: '' } as Options));
  }, []);

  const onMove = useCallback((e: MouseEvent) => {
    const dx = startRef.current.x - e.clientX;
    const dy = startRef.current.y - e.clientY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) setIsDrag(true);
    setPos(p => ({ x: p.x + dx, y: p.y + dy }));
    startRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onUp = useCallback(() => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    setTimeout(() => setIsDrag(false), 50);
  }, [onMove]);

  if (!dynOpts) return null;

  return (
    <>
      <div
        onMouseDown={e => { startRef.current = { x: e.clientX, y: e.clientY }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }}
        onClick={() => !isDrag && setOpen(!open)}
        style={{ position: 'fixed', right: pos.x, bottom: pos.y, width: 74, height: 74, borderRadius: '50%', zIndex: 10001, cursor: isDrag ? 'grabbing' : 'grab', background: 'linear-gradient(135deg, #FFD700, #FF8C00)', boxShadow: '0 8px 32px rgba(255,165,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
      >
        {open ? <span style={{ fontSize: 24, fontWeight: 'bold', color: '#000' }}>✕</span> : <span style={{ fontSize: 32 }}>🤖</span>}
      </div>

      {open && (
        <div style={{ position: 'fixed', right: pos.x, bottom: pos.y + 90, width: '460px', height: '650px', zIndex: 10000 }}>
          {dynOpts.apiUrl ? (
            <FloatingWindow height={650} options={dynOpts} width={460} data={{} as any} timeRange={{} as any} timeZone="browser" optionsStyle={{} as any} renderToken={0} id={1} title="" eventBus={{} as any} fieldConfig={{} as any} onChangeTimeRange={() => {}} onFieldConfigChange={() => {}} onOptionsChange={() => {}} replaceVariables={s => s} transparent={false} />
          ) : (
            <div style={{ background: '#1c1e24', color: '#fff', padding: 20, borderRadius: 16, border: '1px solid #444', height: '100%' }}>
              <h3>Settings Required</h3>
              <p>Configure the API URL in the plugin settings page.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
