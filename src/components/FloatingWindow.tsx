import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input } from '@grafana/ui';

interface Options {
  apiKey: string;
  aiUrl: string;
}

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height, width }) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(true);

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
          model: "gpt-4o-mini",   // or "gpt-4o"
          messages: [{ role: "user", content: input }],
          max_tokens: 200,
        }),
      });

      const data = await response.json();
      console.log("OpenAI response:", data); // Debugging

      const reply = data.choices?.[0]?.message?.content ?? "No response from AI";
      setMessages(prev => [...prev, `AI: ${reply}`]);
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
        height: expanded ? height : 50,
        background: '#1f1f1f',
        color: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'height 0.3s ease, width 0.3s ease',
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
          background: '#2a2a2a',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <strong>{expanded ? 'SRE Assistant (click to minimize)' : 'SRE Assistant (click to maximize)'}</strong>
      </div>

      {expanded && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {messages.length === 0 ? (
              <p style={{ opacity: 0.7 }}>AI insights will appear here…</p>
            ) : (
              messages.map((msg, idx) => (
                <p key={idx} style={{ margin: '4px 0' }}>{msg}</p>
              ))
            )}
          </div>

          <div
            style={{
              borderTop: '1px solid #444',
              padding: 8,
              background: '#2a2a2a',
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
            <Button onClick={handleSend}>Send</Button>
          </div>
        </>
      )}
    </div>
  );
};

