import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input } from '@grafana/ui';

interface Options {
  apiKey: string;
  mimirUrl: string;
  tenantId: string;
}

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, `You: ${input}`]);

    try {
      const response = await fetch(options.mimirUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}),
          ...(options.tenantId ? { 'X-Scope-OrgID': options.tenantId } : {}),
        },
        body: JSON.stringify({ query: input }),
      });

      const data = await response.json();
      const result = data?.data?.result ?? [];

      const reply = result.length > 0
        ? JSON.stringify(result, null, 2)
        : "No data returned from Mimir";

      setMessages(prev => [...prev, `Mimir: ${reply}`]);
    } catch (err) {
      setMessages(prev => [...prev, `Error: ${err}`]);
    }

    setInput('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        height: height,
        background: 'var(--grafana-background-primary)',
        color: 'var(--grafana-text-primary)',
        borderRadius: 8,
        border: '1px solid #d3d3d336',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: expanded ? '100%' : '40px',
          transition: 'height 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 8,
            cursor: 'pointer',
            background: 'var(--grafana-background-secondary)',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <strong>{expanded ? 'Mimir Assistant (minimize)' : 'Mimir Assistant (maximize)'}</strong>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: expanded ? 12 : 0,
            opacity: expanded ? 1 : 0,
            transition: 'opacity 0.3s ease, padding 0.3s ease',
          }}
        >
          {expanded && (
            <>
              {messages.length === 0 ? (
                <p style={{ opacity: 0.7 }}>Mimir query results will appear here…</p>
              ) : (
                messages.map((msg, idx) => (
                  <pre
                    key={idx}
                    style={{
                      margin: '4px 0',
                      fontWeight: msg.startsWith("You:") ? 'bold' : 'normal',
                      color: msg.startsWith("You:") ? 'var(--grafana-text-primary)' : 'var(--grafana-text-secondary)',
                      background: msg.startsWith("You:") ? 'rgba(192,192,192,0.2)' : 'transparent',
                      padding: '4px 6px',
                      borderRadius: 4,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg}
                  </pre>
                ))
              )}
            </>
          )}
        </div>

        {expanded && (
          <div
            style={{
              borderTop: '1px solid var(--grafana-background-secondary)',
              padding: 8,
              background: 'var(--grafana-background-secondary)',
              display: 'flex',
              gap: 8,
            }}
          >
            <Input
              value={input}
              onChange={e => setInput(e.currentTarget.value)}
              placeholder="Type a PromQL query..."
              style={{ flex: 1 }}
            />
            <Button onClick={handleSend}>Run</Button>
          </div>
        )}
      </div>
    </div>
  );
};
