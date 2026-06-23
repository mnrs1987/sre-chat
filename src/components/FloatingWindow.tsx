import React, { useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input } from '@grafana/ui';
import { getBackendSrv } from '@grafana/runtime';

interface Options {
  apiUrl: string;
  method?: string;
  tenantId?: string;
  apiKey?: string;
  customHeaders?: string;
}

export const FloatingWindow: React.FC<PanelProps<Options>> = ({ options, height }) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    setMessages(prev => [...prev, `You: ${input}`]);

    try {
      // ✅ Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;

      if (options.customHeaders) {
        try {
          Object.assign(headers, JSON.parse(options.customHeaders));
        } catch {
          setMessages(prev => [...prev, '❌ Error: Invalid customHeaders JSON']);
        }
      }

      const method = options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';

      // ✅ Use Grafana backend proxy (IMPORTANT)
      const response = await getBackendSrv()
        .fetch({
          url: `/api/plugins/sre-assistant-plugin/resources/proxy`, // 🔴 replace YOUR_PLUGIN_ID
          method: method,
          headers,
          data: method === 'POST' ? { query: input } : undefined,
        })
        .toPromise();

      if (!response || response.status !== 200) {
        setMessages(prev => [
          ...prev,
          `❌ Error: HTTP ${response?.status || 'unknown'}`
        ]);
        return;
      }

      const data = response.data;

      if (typeof data === 'object') {
        setMessages(prev => [
          ...prev,
          `📊 Parsed: ${JSON.stringify(data, null, 2)}`
        ]);
      } else {
        setMessages(prev => [...prev, `🔎 Raw: ${data}`]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, `❌ Error: ${err.message}`]);
    }

    setInput('');
  };

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
            {expanded ? 'SRE Assistant (minimize)' : 'SRE Assistant (maximize)'}
          </strong>
        </div>

        {/* Chat area */}
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
          {expanded &&
            (messages.length === 0 ? (
              <p style={{ opacity: 0.7 }}>
                Enter a query (e.g., <b>up</b>,{' '}
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
                      background: isUser ? 'rgba(192,192,192,0.2)' : 'transparent',
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
            ))}
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
              onChange={e => setInput(e.currentTarget.value)}
              placeholder="Type a query..."
              style={{ flex: 1 }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <Button onClick={handleSend}>Send</Button>
          </div>
        )}
      </div>
    </div>
  );
};
