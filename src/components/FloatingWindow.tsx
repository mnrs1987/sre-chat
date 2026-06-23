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

    setMessages(prev => [...prev, `👤 You: ${input}`]);

    try {
      // ✅ Headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;

      if (options.customHeaders) {
        try {
          Object.assign(headers, JSON.parse(options.customHeaders));
        } catch {
          setMessages(prev => [...prev, '❌ Invalid customHeaders JSON']);
        }
      }

      const method = options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';

      // ✅ Grafana proxy call (NO CORS)
      const response = await getBackendSrv()
        .fetch({
          url: `/api/plugins/sre-assistant-plugin/resources/proxy`, // ✅ your plugin id
          method,
          headers,
          data: method === 'POST' ? { query: input } : undefined,
        })
        .toPromise();

      console.log('FULL RESPONSE:', response); // 🔍 debug

      // ✅ Safety checks
      if (!response) {
        throw new Error('No response received from API');
      }

      if (response.status !== 200) {
        setMessages(prev => [
          ...prev,
          `❌ HTTP ${response.status}`
        ]);
        return;
      }

      const data = response.data;

      // ✅ Avoid undefined issue
      if (data === undefined || data === null) {
        setMessages(prev => [...prev, '⚠️ API returned no data']);
        return;
      }

      // ✅ Print response
      if (typeof data === 'object') {
        setMessages(prev => [
          ...prev,
          `📊 ${JSON.stringify(data, null, 2)}`
        ]);
      } else {
        setMessages(prev => [...prev, `🔎 ${data}`]);
      }

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        `❌ Error: ${err.message || 'Unknown error'}`
      ]);
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
            transition: '0.3s',
            whiteSpace: 'pre-wrap',
          }}
        >
          {expanded &&
            (messages.length === 0 ? (
              <p style={{ opacity: 0.7 }}>
                Try: <b>up</b> or <b>rate(http_requests_total[5m])</b>
              </p>
            ) : (
              messages.map((msg, i) => (
                <p key={i} style={{ margin: '4px 0' }}>{msg}</p>
              ))
            ))}
        </div>

        {/* Input */}
        {expanded && (
          <div style={{ display: 'flex', gap: 8, padding: 8 }}>
            <Input
              value={input}
              onChange={e => setInput(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type query..."
              style={{ flex: 1 }}
            />
            <Button onClick={handleSend}>Send</Button>
          </div>
        )}
      </div>
    </div>
  );
};
