import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input } from '@grafana/ui';

interface Options {
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
      // ✅ Default fallback URL
      const baseUrl =
        options.mimirUrl ||
        'http://localhost:9009/prometheus/api/v1/query';

      // ✅ MUST pass query via URL (NOT body)
      const url = `${baseUrl}?query=${encodeURIComponent(input)}`;

      console.log('Calling Mimir:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.tenantId && {
            'X-Scope-OrgID': options.tenantId, // ✅ Tenant header
          }),
        },
      });

      // ✅ Handle HTTP errors
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      const results = data?.data?.result ?? [];

      let reply = '';

      if (data.status === 'success') {
        if (results.length === 0) {
          reply = '✅ Query successful, but no data returned';
        } else {
          reply = results
            .map((r: any) => {
              const metric = Object.entries(r.metric || {})
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');

              const value = r.value ? r.value[1] : 'N/A';

              return `[${metric}] = ${value}`;
            })
            .join('\n');
        }
      } else {
        reply = `❌ Error: ${data.error || 'Unknown error'}`;
      }

      setMessages(prev => [...prev, `Mimir: ${reply}`]);
    } catch (err: any) {
      setMessages(prev => [...prev, `Error: ${err.message}`]);
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
        {/* Header */}
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
          <strong>
            {expanded
              ? 'Mimir Assistant (minimize)'
              : 'Mimir Assistant (maximize)'}
          </strong>
        </div>

        {/* Chat Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: expanded ? 12 : 0,
            opacity: expanded ? 1 : 0,
            transition: 'opacity 0.3s ease, padding 0.3s ease',
            whiteSpace: 'pre-wrap',
          }}
        >
          {expanded && (
            <>
              {messages.length === 0 ? (
                <p style={{ opacity: 0.7 }}>
                  Enter a PromQL query (e.g., <b>up</b>,{' '}
                  <b>rate(http_requests_total[5m])</b>)
                </p>
              ) : (
                messages.map((msg, idx) => {
                  const isUser = msg.startsWith('You:');
                  return (
                    <p
                      key={idx}
                      style={{
                        margin: '4px 0',
                        fontWeight: isUser ? 'bold' : 'normal',
                        color: isUser
                          ? 'var(--grafana-text-primary)'
                          : 'var(--grafana-text-secondary)',
                        background: isUser
                          ? 'rgba(192,192,192,0.2)'
                          : 'transparent',
                        padding: '4px 6px',
                        borderRadius: 4,
                        display: 'flex',
                        gap: 6,
                      }}
                    >
                      <span>{isUser ? '👤' : '📊'}</span>
                      <span>{msg}</span>
                    </p>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Input */}
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
