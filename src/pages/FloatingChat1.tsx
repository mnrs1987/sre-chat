import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input, Spinner, Select } from '@grafana/ui';

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

interface TypingTextProps {
  text?: string;
  speed?: number;
  shouldAnimate?: boolean;
  onTypingProgress?: () => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
}

// --- Sub-Component: Typing Animation ---

const TypingText: React.FC<TypingTextProps> = ({
  text = '',
  speed = 10,
  shouldAnimate = true,
  onTypingProgress,
  onTypingStart,
  onTypingEnd,
}) => {
  const [displayed, setDisplayed] = useState(shouldAnimate ? '' : text);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      hasCompletedRef.current = false;
      return;
    }
    if (!shouldAnimate || hasCompletedRef.current) {
      setDisplayed(text);
      return;
    }

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

  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>
      {displayed}
    </pre>
  );
};

// --- Main Chat Logic Panel ---

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [expanded, setExpanded] = useState(true);
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set());

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const timestamp = () => new Date().toLocaleTimeString();
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const scrollToBottom = useCallback((smooth = false) => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const handleTypingProgress = useCallback(() => scrollToBottom(false), [scrollToBottom]);
  const handleTypingStart = useCallback(() => setIsTyping(true), []);
  const handleTypingEnd = useCallback((messageId: string) => {
    setIsTyping(false);
    setAnimatedMessageIds((prev) => new Set(prev).add(messageId));
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, loading, scrollToBottom]);

  const handleSend = async (preset?: string) => {
    const query = preset || input;
    if (!query.trim()) return;

    setMessages((prev) => [...prev, { id: makeId(), text: query, time: timestamp(), isUser: true }]);
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;
      if (options.customHeaders) {
        try { Object.assign(headers, JSON.parse(options.customHeaders)); }
        catch { throw new Error('Invalid customHeaders JSON'); }
      }

      const method = options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';
      let url = options.apiUrl;
      const fetchOptions: RequestInit = { method, headers };

      if (method === 'POST') {
        fetchOptions.body = JSON.stringify({ query, model: selectedModel });
      } else {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}query=${encodeURIComponent(query)}&model=${encodeURIComponent(selectedModel)}`;
      }

      const response = await fetch(url, fetchOptions);
      const rawText = await response.text();

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${rawText}`);

      try {
        const parsed = JSON.parse(rawText);
        setMessages((prev) => [...prev, { id: makeId(), text: 'Assistant response', json: parsed, time: timestamp(), isUser: false }]);
      } catch {
        setMessages((prev) => [...prev, { id: makeId(), text: rawText, time: timestamp(), isUser: false }]);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: makeId(), text: `❌ ${err.message}`, time: timestamp(), isUser: false }]);
    }
    setLoading(false);
    setInput('');
  };

  const suggestions = ['Last 1 days issues', 'All issues for today', 'Critical alerts'];
  const modelOptions = [
    { label: 'GPT-4', value: 'gpt-4' },
    { label: 'GPT-3.5', value: 'gpt-3.5' },
    { label: 'Claude', value: 'claude' },
  ];

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height, borderRadius: 16 }}>
      <style>{`@keyframes aiBorderShift { 0% { background-position: 0% 50%; } 100% { background-position: 0% 50%; } 25% { background-position: 100% 50%; } 50% { background-position: 100% 100%; } 75% { background-position: 0% 100%; } }`}</style>

      {(loading || isTyping) && (
        <div style={{
          position: 'absolute', inset: -2, borderRadius: 18, padding: '1.5px',
          background: 'linear-gradient(115deg, #ff375f, #ff9f0a, #ffd60a, #64d2ff, #5e5ce6, #bf5af2, #ff375f)',
          backgroundSize: '300% 300%', animation: 'aiBorderShift 5s linear infinite',
          filter: 'blur(8px)', opacity: 0.7, pointerEvents: 'none', zIndex: 0
        }} />
      )}

      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%',
        borderRadius: 16, overflow: 'hidden', background: '#181b1f', border: '1px solid #333', color: '#d8d9da'
      }}>
        <div style={{ backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)', padding: 10, cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', color: '#000' }} onClick={() => setExpanded(!expanded)}>
          AETNA SRE Assistant
        </div>

        {expanded && (
          <>
            <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    maxWidth: '85%', padding: '10px 14px', borderRadius: 10,
                    background: msg.isUser ? 'linear-gradient(90deg, #FFD700, #FF8C00)' : '#22252b',
                    color: msg.isUser ? '#000' : '#d8d9da',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8em', marginBottom: 4 }}>{msg.isUser ? 'YOU' : 'ASSISTANT'}</div>
                    <TypingText
                      text={msg.json ? JSON.stringify(msg.json, null, 2) : msg.text}
                      shouldAnimate={!msg.isUser && !animatedMessageIds.has(msg.id)}
                      onTypingProgress={handleTypingProgress}
                      onTypingEnd={() => handleTypingEnd(msg.id)}
                    />
                    <div style={{ fontSize: '0.7em', marginTop: 4, opacity: 0.7 }}>{msg.time}</div>
                  </div>
                </div>
              ))}
              {loading && <div style={{ padding: 8 }}><Spinner size={16} /> thinking...</div>}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: '#22252b' }}>
              {suggestions.map((s, i) => (
                <Button key={i} variant="secondary" size="sm" onClick={() => handleSend(s)} style={{ borderRadius: 10 }}>{s}</Button>
              ))}
            </div>

            <div style={{ padding: 8, background: '#181b1f', display: 'flex', gap: 8 }}>
              <Input value={input} onChange={(e) => setInput(e.currentTarget.value)} placeholder="Ask a query..." onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
              <Select width={12} options={modelOptions} value={modelOptions.find(m => m.value === selectedModel)} onChange={v => setSelectedModel(v.value!)} />
              <Button onClick={() => handleSend()} style={{ background: 'linear-gradient(90deg, #FFD700, #FF8C00)', color: '#000' }}>Ask</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- Exported Floating Toggle Component ---

export function FloatingChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', right: '30px', bottom: '30px', width: '60px', height: '60px',
          borderRadius: '50%', zIndex: 9999, fontSize: '25px', cursor: 'pointer',
          background: 'linear-gradient(90deg, #FFD700, #FF8C00)', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
        }}
      >
        {open ? '✖' : '🤖'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: '30px', bottom: '100px', width: '420px', height: '600px',
          background: '#181B1F', borderRadius: '16px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          <FloatingWindow
            height={600}
            options={{
              apiUrl: '[your-api-url.com](https://your-api-url.com/api)', // REPLACE WITH REAL URL
              method: 'POST',
            }}
            // Mocking required Grafana PanelProps
            data={{} as any}
            timeRange={{} as any}
            timeZone="browser"
            optionsStyle={{} as any}
            renderToken={0}
            width={420}
            id={1}
            title=""
            eventBus={{} as any}
            fieldConfig={{} as any}
            onChangeTimeRange={() => {}}
            onFieldConfigChange={() => {}}
            onOptionsChange={() => {}}
            replaceVariables={(s: string) => s}
            transparent={false}
          />
        </div>
      )}
    </>
  );
}
