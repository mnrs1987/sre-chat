import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input, Spinner, Select } from '@grafana/ui';

interface Options {
  apiUrl: string;
  method?: string;
  tenantId?: string;
  apiKey?: string;
  customHeaders?: string;
}

interface ChatMessage {
  text: string;
  json?: any;
  time: string;
}

// TypingText component
const TypingText: React.FC<{ text?: string; speed?: number }> = ({ text = '', speed = 10 }) => {
  const [displayed, setDisplayed] = React.useState('');

  React.useEffect(() => {
    if (!text) return;
    setDisplayed(''); // reset before animating
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(prev => prev + text[i]);
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
      {displayed}
    </pre>
  );
};

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [expanded, setExpanded] = useState(true);

  const timestamp = () => new Date().toLocaleTimeString();

  const handleSend = async (preset?: string) => {
    const query = preset || input;
    if (!query.trim()) return;
    setMessages(prev => [...prev, { text: `You: ${query}`, time: timestamp() }]);
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;
      if (options.customHeaders) {
        try {
          Object.assign(headers, JSON.parse(options.customHeaders));
        } catch {
          setMessages(prev => [...prev, { text: '❌ Error: Invalid customHeaders JSON', time: timestamp() }]);
        }
      }

      const method = options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';
      const url = options.apiUrl;

      const response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify({ query, model: selectedModel }) : undefined,
      });

      if (!response.ok) {
        setMessages(prev => [...prev, { text: `❌ Error: HTTP ${response.status} - ${response.statusText}`, time: timestamp() }]);
        setLoading(false);
        return;
      }

      const rawText = await response.text();
      try {
        const parsed = JSON.parse(rawText);
        setMessages(prev => [...prev, { text: 'Assistant:', json: parsed, time: timestamp() }]);
      } catch {
        setMessages(prev => [...prev, { text: `🔎 Raw: ${rawText}`, time: timestamp() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { text: `❌ Error: ${err.message}`, time: timestamp() }]);
    }

    setLoading(false);
    setInput('');
  };

  const suggestions = [
    'Test',
    'Last 1 days issues in logs',
    'Traces issues for last 30 days',
    'All issues for today',
    'Get memory issues',
    'Critical alerts for last 2 hours'
  ];

  const modelOptions = [
    { label: 'GPT‑4', value: 'gpt-4' },
    { label: 'GPT‑3.5', value: 'gpt-3.5' },
    { label: 'Claude', value: 'claude' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        height,
        background: 'var(--grafana-background-primary)',
        color: 'var(--grafana-text-primary)',
        borderRadius: 8,
        border: '1px solid #d3d3d336',
        overflow: 'hidden',
      }}
    >
      {/* Title bar with glow */}
      <div
        style={{
          backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
          boxShadow: '0 0 12px rgba(255, 165, 0, 0.8)',
          borderBottom: '1px solid #d3d3d336',
          padding: 8,
          cursor: 'pointer',
          textAlign: 'center',
          fontWeight: 'bold',
          color: '#000',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'AETNA SRE Assistant' : 'AETNA SRE Assistant'}
      </div>

      {expanded && (
        <>
        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {messages.map((msg, idx) => {
            const isUser = msg.text.startsWith('You:');
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                {/* Bubble with icon inside, top-left aligned */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',   // ✅ icon + text aligned top
                    gap: 8,
                    width: isUser ? 'auto' : '100%',
                    maxWidth: isUser ? '70%' : '100%',
                    padding: '10px 14px',
                    borderRadius: isUser ? 18 : 10,
                    background: isUser
                      ? 'linear-gradient(90deg, #FFD700, #FF8C00)'
                      : 'var(--grafana-background-secondary)',
                    color: isUser ? '#000' : 'var(--grafana-text-primary)',
                    boxShadow: isUser
                      ? '0 0 8px rgba(255,165,0,0.6)'
                      : 'inset 0 0 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Icon inside bubble */}
                  <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                    {isUser ? (
                      <svg xmlns="http://www.w3.org/2000/svg"
                           viewBox="0 0 24 24"
                           fill="currentColor"
                           width="20" height="20"
                           style={{ color: '#000' }}>
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg"
                           viewBox="0 0 24 24"
                           fill="currentColor"
                           width="20" height="20"
                           style={{ color: '#FF8C00' }}>
                        <path d="M12 2a2 2 0 012 2v1h2a2 2 0 012 2v2h1a2 2 0 012 2v7a2 2 0 01-2 2h-2v1a2 2 0 01-2 2h-8a2 2 0 01-2-2v-1H5a2 2 0 01-2-2v-7a2 2 0 012-2h1V7a2 2 0 012-2h2V4a2 2 0 012-2zm-4 9a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z"/>
                      </svg>
                    )}
                  </div>

                  {/* Text + JSON */}
                  <div style={{ flex: 1 }}>
                  <p style={{ margin: 0 }}>
                   {isUser ? (
                     <>
                       <span style={{ fontWeight: 'bold' }}>You:</span>{' '}
                       {msg.text.replace(/^You:\s*/, '')}
                     </>
                   ) : (
                     <>
                       <span style={{ fontWeight: 'bold' }}>Assistant:</span>{' '}
                       {msg.json ? (
                         <TypingText text={JSON.stringify(msg.json, null, 2)} speed={5} />
                       ) : msg.text ? (
                         <TypingText text={msg.text} speed={5} />
                       ) : ''}
                     </>
                   )}
                 </p>
                  <span style={{
                      display: 'block',
                      marginTop: 4,
                      fontSize: '0.85em',
                      color: isUser ? '#000' : '#FFD700', // ✅ black for user, gold for assistant
                      fontWeight: 500,
                      textAlign: isUser ? 'right' : 'left', // ✅ align right for user, left for AI
                    }}
                  >
                    {msg.time}
                  </span>


                  </div>
                </div>
              </div>
            );
          })}

          {/* Spinner + thinking text */}
          {loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                marginLeft: 4,
                color: 'var(--grafana-text-primary)',
              }}
            >
              <Spinner size={16} />
              <span>thinking...</span>
            </div>
          )}
        </div>

          {/* Suggestions row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              padding: 8,
              borderTop: '1px solid #444',
              background: 'var(--grafana-background-secondary)',
            }}
          >
            {suggestions.map((s, idx) => (
              <Button key={idx} variant="secondary" onClick={() => handleSend(s)}>
                {s}
              </Button>
            ))}
          </div>

          {/* Input + dropdown + Ask button */}
          <div
            style={{
              padding: 8,
              background: 'var(--grafana-background-secondary)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            {/* bubble-style glow input */}
            <div
              style={{
                flex: 1,
                borderRadius: 10,
                padding: 2,
                backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
                boxShadow: '0 0 12px rgba(255, 165, 0, 0.8)',
              }}
            >
              <Input
                value={input}
                onChange={e => setInput(e.currentTarget.value)}
                placeholder="Type a query..."
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--grafana-background-primary)',
                  color: 'var(--grafana-text-primary)',
                  padding: '8px 12px',
                  boxShadow: 'inset 0 0 6px rgba(255, 215, 0, 0.3)', // ✅ bubble inset
                }}
                onFocus={e => (e.currentTarget.style.boxShadow = 'inset 0 0 8px rgba(255, 165, 0, 0.6)')}
                onBlur={e => (e.currentTarget.style.boxShadow = 'inset 0 0 6px rgba(255, 215, 0, 0.3)')}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
            </div>

            <Select
              options={modelOptions}
              value={modelOptions.find(m => m.value === selectedModel)}
              onChange={v => setSelectedModel(v.value!)}
              width={20}
            />

            {/* glowing Ask button */}
            <div
              style={{
                borderRadius: 10,
                padding: 2,
                backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
                boxShadow: '0 0 12px rgba(255, 165, 0, 0.8)',
              }}
            >
              <Button
                onClick={() => handleSend()}
                style={{
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--grafana-background-primary)',
                  color: 'var(--grafana-text-primary)',
                  padding: '6px 16px',
                  fontWeight: 'bold',
                }}
              >
                Ask
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
