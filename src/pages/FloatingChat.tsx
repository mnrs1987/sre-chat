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
// --- Updated TypingText ---
const TypingText: React.FC<{
  text?: string;
  speed?: number;
  shouldAnimate?: boolean;
  onTypingProgress?: () => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
}> = ({ text = '', speed = 10, shouldAnimate = true, onTypingProgress, onTypingStart, onTypingEnd }) => {
  // Use a key-based re-render so that when 'text' changes, the animation resets
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
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
      setDisplayed((prev) => prev + text.charAt(i));
      i++;
      onTypingProgress?.();
    }, speed);

    return () => clearInterval(interval);
  }, [text, shouldAnimate]); // Only re-run when text or animation status changes

  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '13px' }}>
      {displayed}
    </pre>
  );
};

// --- Main Window ---
export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {

    const resetChat = () => {
    setMessages([
      {
        id: 'welcome-msg',
        text: "Hi! I'm your AETNA SRE Assistant. \nHow can I help you with your metrices, logs, or traces today?",
        time: new Date().toLocaleTimeString(),
        isUser: false,
      }
    ]);
  };
  // Initialize state with a welcome message from the assistant
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      text: "Hi! I'm your AETNA SRE Assistant. \nHow can I help you with your metrices, logs, or traces today?",
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
    const headers: Record<string, string> = { 'Accept': 'text/event-stream, application/json' };

    let url = options.apiUrl;
    const fetchOpts: RequestInit = { method, headers, mode: 'cors' };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify({ query: query, session_id: `sess-${Date.now()}` });
    } else {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}query=${encodeURIComponent(query)}&stream=true`;
    }

    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
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
          if (!trimmed.startsWith('data:')) continue;

          const rawJson = trimmed.replace(/^data:\s*/, '');

          try {
            const json = JSON.parse(rawJson);

            // --- UPDATED FILTERING LOGIC ---
            // Only append text if it's the specific delta content.
            // Skip types like 'status', 'start', 'end', 'usage', etc.
            if (json.type === 'delta' && json.data?.text) {
              fullStitchedText += json.data.text;
            }
            // If you receive text messages that don't have a 'type' field
            else if (json.type === undefined && json.text) {
              fullStitchedText += json.text;
            }
            // Explicitly ignore 'status', 'start', 'end', 'usage'
            else if (['status', 'start', 'end', 'usage'].includes(json.type)) {
              continue;
            }
            // Fallback: If you see unexpected structures, you can log them
            // or append them as raw text only if they contain meaningful info.
          } catch (e) {
            // If JSON.parse fails, treat the line as raw text
            fullStitchedText += rawJson;
          }
          // -------------------------------

          // Update the message state
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, text: fullStitchedText } : m
          ));
          scroll();
        }
      }
    } else {
        // Handle standard JSON response
        const raw = await res.text();
        let displayOutput = raw;
        try {
          const parsed = JSON.parse(raw);
          // This creates the clean, indented JSON format
          displayOutput = JSON.stringify(parsed, null, 2);
        } catch (e) {
          displayOutput = raw; // Keep original if not JSON
        }

        setLoading(false);
        setMessages((p) => [...p, { id: assistantMsgId, text: displayOutput, time: timestamp(), isStreaming: false }]);
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

        /* This targets the portal created by menuShouldPortal */
        div[class*="-MenuPortal"] {
          z-index: 100002 !important;
        }
        /* Ensure the assistant window doesn't trap the menu */
        .chat-container {
          overflow: visible !important;
        }

        /* Force the portal to sit above your window */
        .grafana-portal-container {
          z-index: 100001 !important;
        }
        /* Ensure the select container itself isn't hiding overflow */
        .input-yellow-mesh, .input-yellow-mesh > div {
          overflow: visible !important;
        }
        @keyframes aiShiftFast { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .glow-mesh { background: linear-gradient(115deg, #ff375f, #ff9f0a, #ffd60a, #64d2ff, #5e5ce6, #bf5af2, #ff375f); background-size: 150% 150%; animation: aiShiftFast 2.5s linear infinite; }
        .input-yellow-mesh { background: linear-gradient(90deg, #FFD700, #FF8C00, #FFE066, #FF9500, #FFD700); background-size: 200% auto; animation: aiShiftFast 2s linear infinite; }
        .p-select-menu, .css-1h9z7xy-menu .select-menu-container{ z-index: 99999 !important; }

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
      <div style={{
        backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#000',
        borderRadius: '16px 16px 0 0'
        }}>
        {/* Empty div to help center the title */}
        <div style={{ width: 24 }} />

        <span style={{ fontWeight: 'bold' }}>AETNA SRE Assistant</span>
        <button
          onClick={resetChat}
          title="New Chat"
          style={{
            background: 'rgba(0,0,0,0.1)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
        >
          {/* Simple "Plus" or "Refresh" Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
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
                     <span style={{ fontSize: 24 }}>🤖</span>
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
                        key={m.id}
                        text={m.text}
                        // Only animate if it's an assistant message
                        shouldAnimate={!m.isUser}
                        onTypingProgress={scroll}
                        onTypingStart={() => setIsTyping(true)}
                        onTypingEnd={() => setIsTyping(false)}
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
          {['Why is the alert firing? What is the remeditation?', 'Which POD is causing high CPU?', 'Show all prod logs', 'What caused CPU spike yesterday?', 'Have we seen this issue before?'].map((s, i) => (
            <Button key={i} variant="secondary" size="sm" onClick={() => handleSend(s)} style={{ borderRadius: 8 }}>{s}</Button>
          ))}
        </div>

        <div style={{ padding: 16, background: '#0e1014', borderRadius: '0 0 16px 16px' }}>
          <div className="input-yellow-mesh" style={{ borderRadius: 12, padding: '2px' }}>
            <div style={{ background: '#0e1014', borderRadius: 10, display: 'flex', gap: 8, padding: '4px 8px', position: 'relative', overflow: 'visible' }}>
              <Input value={input} onChange={e => setInput(e.currentTarget.value)} placeholder="Type a query..." style={{ background: 'transparent', border: 'none', color: '#fff', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <Select
                // This overrides the internal width logic
                styles={{
                  container: (base) => ({
                    ...base,
                    width: '180px', // Set to any pixel value or '100%'
                    minWidth: '150px'
                  }),
                  menu: (base) => ({
                    ...base,
                    width: '200px', // You can make the dropdown menu wider than the box itself
                  })
                }}
                options={modelOptions}
                value={modelOptions.find(o => o.value === selectedModel)}
                onChange={v => setSelectedModel(v.value!)}
                menuPlacement="bottom"
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
  const [size, setSize] = useState({ width: 700, height: 650 }); // Default size
  const [isDrag, setIsDrag] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
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

  const onResize = useCallback((e: MouseEvent) => {
    e.preventDefault();

    const dx = startRef.current.x - e.clientX;
    const dy = startRef.current.y - e.clientY;
    setSize(prev => {
      const newWidth = prev.width + dx;
      const newHeight = prev.height + dy;
      return {
        // SET MINIMUMS HERE (e.g., 350px width, 400px height)
        width: newWidth < 350 ? 350 : newWidth,
        height: newHeight < 400 ? 400 : newHeight
      };
    });
    startRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onUpResize = useCallback(() => {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', onUpResize);
    setIsResizing(false);
  }, [onResize]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', onUpResize);
  };

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
          {open ? <span style={{ fontSize: 24, fontWeight: 'bold', color: '#000' }}>✕</span> : <span style={{ fontSize: 32 }}>🤖</span>}
        </div>
      </div>

      {/* The Chat Window Wrapper */}
      <div
        className={`chat-container ${open ? 'chat-container-open' : ''}`}
        style={{
          position: 'fixed',
          right: pos.x,
          bottom: pos.y + 90,
          width: size.width,
          height: size.height,
          zIndex: 10000,
          /*
             Logic:
             1. If resizing: 'none' (instant response)
             2. If opening/closing: 'all 0.4s ...' (bouncy animation)
          */
          transition: isResizing
            ? 'none'
            : 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), width 0.2s ease, height 0.2s ease',

          /* Ensure the window is always visible during the transition */
          visibility: open || isResizing ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          overflow: 'visible'
        }}
      >
        {/* The Resize Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            startRef.current = { x: e.clientX, y: e.clientY };

            const onMove = (me: MouseEvent) => {
              const dx = startRef.current.x - me.clientX;
              const dy = startRef.current.y - me.clientY;

              setSize(prev => ({
                width: Math.max(350, prev.width + dx),  // Minimum Width 350px
                height: Math.max(400, prev.height + dy) // Minimum Height 400px
              }));
              startRef.current = { x: me.clientX, y: me.clientY };
            };
            const onUp = () => {
              setIsResizing(false);
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
          style={{
            position: 'absolute',
            top: -3,      // Offset out from the container
            left: -3,     // Offset out from the container
            width: 24,
            height: 24,
            cursor: 'nwse-resize',
            zIndex: 10006,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start'
            // position: 'absolute',
            // top: -12,             // Moved further out
            // left: -12,            // Moved further out
            // width: 32,
            // height: 32,
            // cursor: 'nwse-resize',
            // zIndex: 10006,
            // display: 'flex',
            // alignItems: 'center',
            // justifyContent: 'center',
            // background: '#16181d', // Match your panel background
            // borderRadius: '50%',
            // border: '2px solid #FFD700',
            // boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)', // Subtle glow
            // transition: 'transform 0.2s ease',
          }}
          // Slight hover effect to show it's interactive
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
        {/* Visual "Handle" Icon */}
        {/* The Visual Bracket */}
        <div style={{
          width: 14,
          height: 14,
          borderTop: '3px solid #FFD700',
          borderLeft: '3px solid #FFD700',
          borderRadius: '2px 0 0 0',
          filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))' // Adds contrast against dark backgrounds
        }} />
        </div>
        {dynOpts.apiUrl ? (
          <FloatingWindow height={size.height} options={dynOpts} width={size.width} data={{} as any} timeRange={{} as any} timeZone="browser" optionsStyle={{} as any} renderToken={0} id={1} title="" eventBus={{} as any} fieldConfig={{} as any} onChangeTimeRange={() => {}} onFieldConfigChange={() => {}} onOptionsChange={() => {}} replaceVariables={s => s} transparent={false} />
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
