import React, { useCallback, useEffect, useRef, useState } from 'react';
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

    if (!shouldAnimate) {
      setDisplayed(text);
      hasCompletedRef.current = true;
      return;
    }

    if (hasCompletedRef.current) {
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
  }, [text, speed, shouldAnimate]);

  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        margin: 0,
        fontFamily: 'inherit',
        lineHeight: 1.5,
      }}
    >
      {displayed}
    </pre>
  );
};

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

  const handleTypingProgress = useCallback(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  const handleTypingStart = useCallback(() => {
    setIsTyping(true);
  }, []);

  const handleTypingEnd = useCallback((messageId?: string) => {
    setIsTyping(false);

    if (messageId) {
      setAnimatedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, loading, scrollToBottom]);

  const handleSend = async (preset?: string) => {
    const query = preset || input;
    if (!query.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        text: query,
        time: timestamp(),
        isUser: true,
      },
    ]);

    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.tenantId) headers['X-Scope-OrgID'] = options.tenantId;
      if (options.apiKey) headers['Authorization'] = options.apiKey;

      if (options.customHeaders) {
        try {
          Object.assign(headers, JSON.parse(options.customHeaders));
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              text: '❌ Error: Invalid customHeaders JSON',
              time: timestamp(),
              isUser: false,
            },
          ]);
          setLoading(false);
          return;
        }
      }

      const method = options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';
      let url = options.apiUrl;

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (method === 'POST') {
        fetchOptions.body = JSON.stringify({ query, model: selectedModel });
      } else {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}query=${encodeURIComponent(query)}&model=${encodeURIComponent(selectedModel)}`;
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            text: `❌ Error: HTTP ${response.status} - ${response.statusText}`,
            time: timestamp(),
            isUser: false,
          },
        ]);
        setLoading(false);
        return;
      }

      const rawText = await response.text();

      try {
        const parsed = JSON.parse(rawText);
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            text: 'Assistant response',
            json: parsed,
            time: timestamp(),
            isUser: false,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            text: `🔎 Raw: ${rawText}`,
            time: timestamp(),
            isUser: false,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          text: `❌ Error: ${String(err)}`,
          time: timestamp(),
          isUser: false,
        },
      ]);
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
    'Critical alerts for last 2 hours',
  ];

  const modelOptions = [
    { label: 'GPT-4', value: 'gpt-4' },
    { label: 'GPT-3.5', value: 'gpt-3.5' },
    { label: 'Claude', value: 'claude' },
  ];

  const panelGlowActive = loading || isTyping;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height,
        borderRadius: 16,
        overflow: 'visible',
      }}
    >
      <style>
        {`
          @keyframes aiBorderShift {
            0% {
              background-position: 0% 50%;
            }
            25% {
              background-position: 100% 50%;
            }
            50% {
              background-position: 100% 100%;
            }
            75% {
              background-position: 0% 100%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
        `}
      </style>

      {panelGlowActive && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              padding: '1.5px',
              background:
                'linear-gradient(115deg, #ff375f, #ff9f0a, #ffd60a, #64d2ff, #5e5ce6, #bf5af2, #ff375f)',
              backgroundSize: '300% 300%',
              animation: 'aiBorderShift 5s linear infinite',
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude' as any,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          <div
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: 18,
              padding: '1.5px',
              background:
                'linear-gradient(115deg, rgba(255,55,95,0.7), rgba(255,159,10,0.7), rgba(255,214,10,0.65), rgba(100,210,255,0.7), rgba(94,92,230,0.7), rgba(191,90,242,0.7), rgba(255,55,95,0.7))',
              backgroundSize: '300% 300%',
              animation: 'aiBorderShift 5s linear infinite',
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude' as any,
              filter: 'blur(10px)',
              opacity: 0.9,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        </>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'var(--grafana-background-primary)',
          border: '1px solid rgba(255,255,255,0.05)',
          color: 'var(--grafana-text-primary)',
        }}
      >
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
          AETNA SRE Assistant
        </div>

        {expanded && (
          <>
            <div
              ref={chatContainerRef}
              style={{ flex: 1, overflowY: 'auto', padding: 12 }}
            >
              {messages.map((msg) => {
                const isUser = !!msg.isUser;
                const contentText = msg.json ? JSON.stringify(msg.json, null, 2) : msg.text;
                const shouldAnimate = !isUser && !animatedMessageIds.has(msg.id);

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
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
                      <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                        {isUser ? (
                          <svg
                            xmlns="[w3.org](http://www.w3.org/2000/svg)"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            width="20"
                            height="20"
                            style={{ color: '#000' }}
                          >
                            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="[w3.org](http://www.w3.org/2000/svg)"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            width="20"
                            height="20"
                            style={{ color: '#FF8C00' }}
                          >
                            <path d="M12 2a2 2 0 012 2v1h2a2 2 0 012 2v2h1a2 2 0 012 2v7a2 2 0 01-2 2h-2v1a2 2 0 01-2 2h-8a2 2 0 01-2-2v-1H5a2 2 0 01-2-2v-7a2 2 0 012-2h1V7a2 2 0 012-2h2V4a2 2 0 012-2zm-4 9a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" />
                          </svg>
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0 }}>
                          {isUser ? (
                            <>
                              <span style={{ fontWeight: 'bold' }}>You:</span>{' '}
                              {msg.text}
                            </>
                          ) : (
                            <>
                              <span style={{ fontWeight: 'bold' }}>Assistant:</span>{' '}
                              <TypingText
                                text={contentText}
                                speed={6}
                                shouldAnimate={shouldAnimate}
                                onTypingProgress={handleTypingProgress}
                                onTypingStart={handleTypingStart}
                                onTypingEnd={() => handleTypingEnd(msg.id)}
                              />
                            </>
                          )}
                        </p>

                        <span
                          style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: '0.85em',
                            color: isUser ? '#000' : '#FFD700',
                            fontWeight: 500,
                            textAlign: isUser ? 'right' : 'left',
                          }}
                        >
                          {msg.time}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

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
                <Button
                  key={idx}
                  variant="secondary"
                  onClick={() => handleSend(s)}
                  style={{
                    borderRadius: 10,
                    border: '1px solid #5a4a00',
                    background: 'var(--grafana-background-primary)',
                    color: 'white',
                    padding: '6px 12px',
                    boxShadow: 'none',
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>

            <div
              style={{
                padding: 8,
                background: 'var(--grafana-background-secondary)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  flex: 1,
                  borderRadius: 12,
                  padding: 2,
                  backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
                  boxShadow: '0 0 10px rgba(255, 200, 0, 0.20), 0 0 18px rgba(255, 140, 0, 0.12)',
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.currentTarget.value)}
                  placeholder="Type a query..."
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: 'none',
                    background: '#111217',
                    color: 'var(--grafana-text-primary)',
                    padding: '8px 12px',
                    boxShadow: 'inset 0 0 10px rgba(255, 215, 0, 0.12)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = 'inset 0 0 14px rgba(255, 180, 0, 0.22)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = 'inset 0 0 10px rgba(255, 215, 0, 0.12)';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend();
                  }}
                />
              </div>

              <Select
                options={modelOptions}
                value={modelOptions.find((m) => m.value === selectedModel)}
                onChange={(v) => setSelectedModel(v.value!)}
                width={20}
              />

              <div
                style={{
                  borderRadius: 10,
                  padding: 2,
                  backgroundImage: 'linear-gradient(90deg, #FFD700, #FF8C00)',
                  boxShadow: '0 0 12px rgba(255, 165, 0, 0.35)',
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
    </div>
  );
};
