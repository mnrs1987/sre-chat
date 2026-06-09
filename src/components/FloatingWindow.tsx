import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input } from '@grafana/ui';

interface Options {
  apiKey: string;
  aiUrl: string;
}

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false); // minimized initially

  const handleSend = async () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, `You: ${input}`]);

    try {
      const response = await fetch(options.aiUrl || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: input }],
          max_tokens: 200,
        }),
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content ?? "No response from AI";
      setMessages(prev => [...prev, `Assistant: ${reply}`]);
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
        background: 'var(--grafana-background-primary)', // Grafana theme background
        color: 'var(--grafana-text-primary)',
        borderRadius: 8,
        border: '1px solid #d3d3d336', // subtle light border
        overflow: 'hidden',
      }}
    >
      {/* Animated inner wrapper */}
      <div
        style={{
          height: expanded ? '100%' : '40px',
          transition: 'height 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Title bar toggles expand/collapse */}
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
          <strong>{expanded ? 'SRE Assistant (minimize)' : 'SRE Assistant (maximize)'}</strong>
        </div>

        {/* Slide‑up content */}
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
                <p style={{ opacity: 0.7 }}>AI insights will appear here…</p>
              ) : (
                messages.map((msg, idx) => {
                  const isUser = msg.startsWith("You:");
                  return (
                    <p
                      key={idx}
                      style={{
                        margin: '4px 0',
                        fontWeight: isUser ? 'bold' : 'normal',
                        color: isUser ? 'var(--grafana-text-primary)' : 'var(--grafana-text-secondary)',
                        background: isUser ? 'rgba(192,192,192,0.2)' : 'transparent',
                        padding: '4px 6px',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{isUser ? '👤' : '🤖'}</span>
                      <span>{msg}</span>
                    </p>
                  );
                })
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
              placeholder="Type your question..."
              style={{ flex: 1 }}
            />
            <Button onClick={handleSend}>Ask</Button>
          </div>
        )}
      </div>
    </div>
  );
};

