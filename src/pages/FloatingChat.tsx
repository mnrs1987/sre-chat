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
  isStreaming?: boolean; // New flag to distinguish animation types
}

// --- Component: Typing Animation ---
const TypingText: React.FC<{
  text?: string;
  speed?: number;
  shouldAnimate?: boolean;
  onTypingProgress?: () => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
}> = ({ text = '', speed = 10, shouldAnimate = true, onTypingProgress, onTypingStart, onTypingEnd }) => {
  const [displayed, setDisplayed] = useState(shouldAnimate ? '' : text);

  useEffect(() => {
    // If we shouldn't animate, just show text immediately
    if (!shouldAnimate) {
      setDisplayed(text);
      return;
    }

    setDisplayed('');
    onTypingStart?.();

    let i = 0;
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        onTypingEnd?.();
        return;
      }
      // Use functional update to ensure we always have the latest string
      setDisplayed((prev) => prev + text.charAt(i));
      i++;
      onTypingProgress?.();
    }, speed);

    return () => clearInterval(interval);
  }, [text, shouldAnimate]); // Re-run if text changes or animation is toggled

  return (
    <pre style={{
      whiteSpace: 'pre-wrap',
      margin: 0,
      fontFamily: 'inherit',
      lineHeight: 1.5,
      fontSize: '13px'
    }}>
      {displayed}
    </pre>
  );
};

// --- Main Window ---
export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  // Initialize state with a welcome message from the assistant
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      text: "Hello! I'm your AETNA SRE Assistant. How can I help you with your metrices, logs, or traces today?",
      time: new Date().toLocaleTimeString(),
      isUser: false,
    }
  ]);

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

  // --- Updated handleSend in FloatingWindow ---
  const handleSend = async (val?: string) => {
  const query = val || input;
  if (!query.trim() || !options.apiUrl) return;

  const assistantMsgId = makeId();
  setMessages((p) => [...p, { id: makeId(), text: query, time: timestamp(), isUser: true }]);
  setLoading(true);
  setInput('');

  try {
    const method = (options.method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
    };

    let url = options.apiUrl;
    const fetchOpts: RequestInit = { method, headers, mode: 'cors' };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify({
        query: query,
        session_id: `sess-${Date.now()}`,
      });
    } else {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}query=${encodeURIComponent(query)}&stream=true`;
    }

    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';

    // --- DECIDE HANDLING BEFORE LOCKING THE STREAM ---
    if (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')) {
      // 1. Handling Streaming
      const reader = res.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      setMessages((p) => [...p, { id: assistantMsgId, text: '', time: timestamp(), isStreaming: true }]);
      setLoading(false);
      setAnimatedIds((prev) => new Set(prev).add(assistantMsgId));

      const decoder = new TextDecoder();
      let fullStitchedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            if (json.type === 'delta' && json.data?.text) {
              fullStitchedText += json.data.text;
              setMessages((prev) => prev.map((m) =>
                m.id === assistantMsgId ? { ...m, text: fullStitchedText } : m
              ));
              scroll();
            }
          } catch (e) {
            fullStitchedText += trimmed; // Fallback for raw text lines
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, text: fullStitchedText } : m
            ));
          }
        }
      }
    } else {
      // 2. Handling Single Response (JSON/Text)
      // Stream is NOT locked because getReader() wasn't called yet
      const raw = await res.text();
      let displayOutput = raw;

      try {
        const parsed = JSON.parse(raw);
        displayOutput = JSON.stringify(parsed, null, 2);
      } catch (e) {}

      setLoading(false);
      setMessages((p) => [...p, {
        id: assistantMsgId,
        text: displayOutput,
        time: timestamp(),
        isStreaming: false
      }]);
    }
  } catch (err: any) {
    setMessages((p) => [...p, { id: makeId(), text: `❌ Error: ${err.message}`, time: timestamp() }]);
    setLoading(false);
  } finally {
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
        .p-select-menu, .css-1h9z7xy-menu { z-index: 10010 !important; }

        @keyframes rotateRainbow {
          0% { transform: rotate(0deg); filter: hue-rotate(0deg); }
          100% { transform: rotate(360deg); filter: hue-rotate(360deg); }
        }
        .thinking-ring {
          width: 18px;
          height: 18px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top: 3px solid #FFD700;
          border-right: 3px solid #FF375F;
          border-radius: 50%;
          animation: rotateRainbow 1s linear infinite;
          display: inline-block;
          vertical-align: middle;
          margin-right: 8px;
        }

        @keyframes thinkingGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .thinking-text-gradient {
          background: linear-gradient(90deg, #FFD700, #FF375F, #bf5af2, #64d2ff, #FFD700);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: thinkingGradient 3s linear infinite;
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        /* Animation for the chat window container */
        .chat-container {
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Bouncy fluid effect */
          transform-origin: bottom right;
          opacity: 0;
          transform: scale(0.8) translateY(40px);
          pointer-events: none;
        }
        .chat-container-open {
          opacity: 1;
          transform: scale(1) translateY(0);
          pointer-events: auto;
        }
        /* Rotation and scaling for the button icon */
        .button-icon {
          transition: transform 0.3s ease;
        }
        .button-open {
          transform: rotate(90deg) scale(0.8);
        }
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
            <div key={m.id} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              marginBottom: '8px'
            }}>
              <div style={{
                display: 'flex',
                gap: 10,
                padding: '12px 16px',
                /* THE KEY CHANGE: Asymmetrical border radius */
                borderRadius: isUser ? '20px 20px 0px 20px' : '0px 20px 20px 20px',
                background: isUser ? 'linear-gradient(135deg, #FFD700, #FF8C00)' : 'rgba(255,255,255,0.08)',
                color: isUser ? '#000' : '#e0e0e0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)'
              }}>
                {/* Icon Column */}
                <div style={{ flexShrink: 0, marginTop: 4 }}>
                  {isUser ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  ) : (
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#5e5ce6" fillOpacity="0.3" stroke="#5e5ce6" strokeWidth="1" />
                      <circle cx="12" cy="12" r="6" fill="#bf5af2" />
                      <path d="M12 9v6M9 12h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="2" fill="#ffd60a" />
                      <path d="M17 7l2-2M7 17l-2 2" stroke="#64d2ff" strokeWidth="2" />
                    </svg>
                  )}
                </div>
                {/* Text Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.65em', fontWeight: 'bold', marginBottom: 4, opacity: 0.7, letterSpacing: '0.5px' }}>
                    {isUser ? 'YOU' : 'AETNA ASSISTANT'}
                  </div>

                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {m.isStreaming ? (
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{m.text}</pre>
                    ) : (
                      <TypingText
                        text={m.text}
                        shouldAnimate={!isUser && !animatedIds.has(m.id)}
                        onTypingProgress={scroll}
                        onTypingStart={() => setIsTyping(true)}
                        onTypingEnd={() => { setIsTyping(false); setAnimatedIds(p => new Set(p).add(m.id!)); }}
                      />
                    )}
                  </div>

                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: 6, textAlign: 'right' }}>
                    {m.time}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
          {loading && (
            <div style={{ color: '#FFD700', fontSize: '13px', paddingLeft: 10, display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div className="thinking-ring" />
              <span className="thinking-text-gradient">
                Assistant is thinking...
              </span>
            </div>
          )}
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
    getBackendSrv().get(`/api/plugins/sre-assistant-app/settings`)
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
      {/* The Button */}
      <div
        onMouseDown={e => { startRef.current = { x: e.clientX, y: e.clientY }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }}
        onClick={() => !isDrag && setOpen(!open)}
        style={{ position: 'fixed', right: pos.x, bottom: pos.y, width: 74, height: 74, borderRadius: '50%', zIndex: 10001, cursor: isDrag ? 'grabbing' : 'grab', background: 'linear-gradient(135deg, #FFD700, #FF8C00)', boxShadow: '0 8px 32px rgba(255,165,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
      >
        <div className={`button-icon ${open ? 'button-open' : ''}`}>
          {open ? (
            <span style={{ fontSize: 24, fontWeight: 'bold', color: '#000' }}>✕</span>
          ) : (
            /* Your Cyber-Orb SVG */
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
               <circle cx="12" cy="12" r="10" fill="#5e5ce6" fillOpacity="0.3" stroke="#5e5ce6" strokeWidth="1.5" />
               <circle cx="12" cy="12" r="6" fill="#bf5af2" />
               <path d="M12 9v6M9 12h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
               <circle cx="12" cy="12" r="1.5" fill="#ffd60a" />
               <path d="M17 7l1.5-1.5M7 17l-1.5 1.5" stroke="#64d2ff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* The Chat Window Wrapper */}
      <div
        className={`chat-container ${open ? 'chat-container-open' : ''}`}
        style={{ position: 'fixed', right: pos.x, bottom: pos.y + 90, width: '462px', height: '650px', zIndex: 10000 }}
      >
        {dynOpts.apiUrl ? (
          <FloatingWindow height={650} options={dynOpts} width={462} data={{} as any} timeRange={{} as any} timeZone="browser" optionsStyle={{} as any} renderToken={0} id={1} title="" eventBus={{} as any} fieldConfig={{} as any} onChangeTimeRange={() => {}} onFieldConfigChange={() => {}} onOptionsChange={() => {}} replaceVariables={s => s} transparent={false} />
        ) : (
          <div style={{ background: '#1c1e24', color: '#fff', padding: 20, borderRadius: 16, border: '1px solid #444', height: '100%' }}>
            <h3>Settings Required</h3>
            <p>Configure the API URL in the plugin settings page.</p>
          </div>
        )}
      </div>
    </>
  );
}
