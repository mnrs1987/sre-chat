import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { Button, Input, Spinner, Select } from '@grafana/ui';
import { getBackendSrv } from '@grafana/runtime';
import { config } from '@grafana/runtime';
import robotIcon from '../img/opening_icon.png'; // adjust filename as needed
import ReactMarkdown from 'react-markdown';

// Accessing the user details
const currentUser = config.bootData.user;
const userName = currentUser.name || currentUser.login || 'User';
// --- Types ---
interface Options {
  apiUrl: string;
  method?: string;
  tenantId?: string;
  apiKey?: string;
  customHeaders?: string;
}

interface ChatHistoryItem {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

interface ChatMessage {
  id: string;
  text: string;
  json?: any;
  time: string;
  isUser?: boolean;
  isStreaming?: boolean; // New flag to distinguish animation types
  isComplete?: boolean; // New flag
  vote?: 'like' | 'dislike' | null; // Add this line
  isError?: boolean;
}

// --- Component: Typing Animation ---
const TypingText: React.FC<{
  text?: string;
  speed?: number;
  shouldAnimate?: boolean;
  isStreaming?: boolean;
  isComplete?: boolean;
  onTypingProgress?: () => void;
}> = ({ text = '', speed = 10, shouldAnimate = true, isStreaming = false, onTypingProgress, isComplete = false }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (isStreaming || isComplete || !shouldAnimate) {
      setDisplayed(text);
      indexRef.current = text.length;
      onTypingProgress?.();
      return;
    }
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed((prev) => prev + text.charAt(indexRef.current));
        indexRef.current += 1;
        onTypingProgress?.();
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, shouldAnimate, isStreaming, speed, isComplete, onTypingProgress]);

  return (
    <div
      style={{
        margin: 0,
        fontFamily: 'inherit',
        fontSize: '13px',
        width: '100%',
        background: '#ffffff',
        color: '#000000',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #dcdcdc',
        boxSizing: 'border-box',
        lineHeight: '1.4'
      }}
    >
    <ReactMarkdown
      components={{
        p: ({ children }) => <p style={{ margin: '0 0 4px 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '0 0 4px 16px', paddingLeft: 0 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0 0 4px 16px', paddingLeft: 0 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '0 0 2px 0' }}>{children}</li>,
        // Add pre and code style rules to keep content within bounds
        pre: ({ children }) => (
          <pre style={{ maxWidth: '100%', overflowX: 'auto', background: '#1e1e1e', padding: '8px', borderRadius: '4px', margin: '6px 0' }}>
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code style={{ background: '#d3d3d3', color: '#000000', padding: '2px 4px', borderRadius: 4, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
            {children}
          </code>
        ),
      }}
      >
      {displayed}
      </ReactMarkdown>
    </div>
  );
};


// --- Main Window ---
export const FloatingWindow: React.FC<PanelProps<Options> & { setOpen: (open: boolean) => void }> = ({ options, height, setOpen }) => {

  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('aetna_sre_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const userName = config.bootData.user.name || config.bootData.user.login || 'User';
  // Capitalize first letter
  const capitalizedUser = userName.charAt(0).toUpperCase() + userName.slice(1);
  const resetChat = () => {
  const newSessionId = `session-${Date.now()}`;
  const initial = [{
      id: 'welcome-msg',
      text: `Hello ${capitalizedUser}! I'm your AETNA SRE Assistant. \nHow can I help you for metrics, logs and traces for today ?`,
      time: new Date().toLocaleTimeString(),
      isUser: false,
      isStreaming: false,
      isComplete: true,
    }];
    setMessages(initial);
    setCurrentSessionId(newSessionId);
    setShowSuggestions(true);
    localStorage.setItem('aetna_sre_persistent_messages', JSON.stringify(initial));
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('aetna_sre_persistent_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        // IMPORTANT: Add 'isComplete: true' so they don't re-type on load
        return parsed.map((m: any) => ({ ...m, isStreaming: false, isComplete: true }));
      }
    } catch (e) {
      console.error("Storage read error", e);
    }
    // ... welcome message
    return [{
        id: 'welcome-msg',
        text: `Hello ${capitalizedUser}! I'm your AETNA SRE Assistant. \nHow can I help you for metrics, logs and traces for today ?`,
        time: new Date().toLocaleTimeString(),
        isUser: false,
        isComplete: true // Welcome message should also be complete on refresh
    }];
  });

  const [currentSessionId, setCurrentSessionId] = useState(() => `session-${Date.now()}`);
  useEffect(() => {
    const nonWelcomeMessages = messages.filter((m) => m.id !== 'welcome-msg');
    if (nonWelcomeMessages.length === 0) {
      return;
    }
    const firstUserMessage = nonWelcomeMessages.find((m) => m.isUser)?.text?.trim() || 'New Chat';
    setHistory((prev) => {
      const historyItem: ChatHistoryItem = {
        id: currentSessionId,
        title: firstUserMessage.length > 40 ? `${firstUserMessage.slice(0, 40)}...` : firstUserMessage,
        messages,
        createdAt: new Date().toISOString(),
      };
      // Remove duplicates:
      // 1. same session id
      // 2. same title (optional protection if a new session repeats same first prompt)
      const filtered = prev.filter(
        (item) => item.id !== currentSessionId && item.title !== historyItem.title
      );
      const updated = [historyItem, ...filtered];
      localStorage.setItem('aetna_sre_chat_history', JSON.stringify(updated));
      return updated;
    });
  }, [messages, currentSessionId]);

  const loadHistoryChat = (item: ChatHistoryItem) => {
    setMessages(item.messages.map((m) => ({ ...m, isStreaming: false, isComplete: true })));
    setCurrentSessionId(item.id);
    setShowMenu(false);
    setShowHistory(false);
    localStorage.setItem('aetna_sre_persistent_messages', JSON.stringify(item.messages));
  };

  const actionButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s',
  };

  const menuItemStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    textAlign: 'left',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'block',
    whiteSpace: 'nowrap',
    width: '100%',
  };
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const timestamp = () => new Date().toLocaleTimeString();
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const scroll = useCallback(() => {
  if (chatRef.current) {
    // Request animation frame ensures the browser has rendered the new text chunks
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({
          top: chatRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    });
  }
}, []);

  useEffect(() => {
    if (!loading && !isTyping && messages.length > 0) {
      const messagesToSave = messages.map(m => ({ ...m, isStreaming: false }));
      // Save to localStorage
      localStorage.setItem('aetna_sre_persistent_messages', JSON.stringify(messagesToSave));
    }
    }, [loading, isTyping, messages]);


  // --- Updated handleSend in FloatingWindow ---
//   const handleSend = async (val?: string) => {
//   const query = val || input;
//   if (!query.trim() || !options.apiUrl) return;
//   setShowSuggestions(false);
//   const assistantMsgId = makeId();
//   // setMessages((p) => [...p, { id: makeId(), text: query, time: timestamp(), isUser: true }]);
//   // Inside handleSend where text/event-stream starts:
//   setMessages((p) => [...p, { id: assistantMsgId, text: '', time: '', isStreaming: true }]);
//   setLoading(true);
//   setInput('');
//
//   try {
//     const method = (options.method || 'POST').toUpperCase();
//     const headers: Record<string, string> = { 'Accept': 'text/event-stream, application/json' };
//
//     let url = options.apiUrl;
//     const fetchOpts: RequestInit = { method, headers, mode: 'cors' };
//
//     if (method === 'POST') {
//       headers['Content-Type'] = 'application/json';
//       fetchOpts.body = JSON.stringify({ query: query, use_agents: true });
//     } else {
//       const sep = url.includes('?') ? '&' : '?';
//       url = `${url}${sep}query=${encodeURIComponent(query)}&stream=true`;
//     }
//
//     const res = await fetch(url, fetchOpts);
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//
//     const contentType = res.headers.get('content-type') || '';
//
//     if (contentType.includes('text/event-stream')) {
//       const reader = res.body?.getReader();
//       if (!reader) throw new Error('ReadableStream not supported');
//
//       setMessages((p) => [...p, { id: assistantMsgId, text: '', time: timestamp(), isStreaming: true }]);
//       setLoading(true);
//       setIsTyping(true);
//       setAnimatedIds((prev) => new Set(prev).add(assistantMsgId));
//
//       const decoder = new TextDecoder();
//       let fullStitchedText = '';
//       let buffer = '';
//
//       while (true) {
//         const { done, value } = await reader.read();
//         if (done) {
//           // 1. Mark the specific message as no longer streaming and add the final timestamp
//           setMessages((prev) => prev.map((m) =>
//             m.id === assistantMsgId ? {
//               ...m,
//               isStreaming: false,
//               isComplete: true,
//               time: timestamp() // <--- Assign timestamp here once complete!
//             } : m
//           ));
//
//           // 2. Kill the global loading state
//           setLoading(false);
//
//           // 3. Ensure typing state is also cleared
//           setIsTyping(false);
//           break;
//         }
//
//         buffer += decoder.decode(value, { stream: true });
//         const lines = buffer.split('\n');
//         buffer = lines.pop() || '';
//
//         for (const line of lines) {
//           const trimmed = line.trim();
//           if (!trimmed.startsWith('data:')) continue;
//
//           const rawJson = trimmed.replace(/^data:\s*/, '');
//
//           try {
//             const json = JSON.parse(rawJson);
//             // Handle backend error event
//             if (json.type === 'error') {
//               const rawError = json?.data?.message || '';
//               let errorMessage = rawError;
//               if (rawError.includes('AADSTS7000215') || rawError.includes('invalid_client')) {
//                 errorMessage =
//                   'Authentication failed. Invalid Microsoft client secret provided. Please check the app client secret configuration.';
//               }
//               setMessages((prev) =>
//                 prev.map((msg) =>
//                   msg.id === assistantMsgId
//                     ? {
//                         ...msg,
//                         text: `Error: ${errorMessage}`,
//                         isStreaming: false,
//                         isComplete: true,
//                         isError: true,
//                       }
//                     : msg
//                 )
//               );
//               setLoading(false);
//               setIsTyping(false);
//               return;
//             }
//             // --- UPDATED FILTERING LOGIC ---
//             // Only append text if it's the specific delta content.
//             // Skip types like 'status', 'start', 'end', 'usage', etc.
//             if (json.type === 'delta' && json.data?.text) {
//               fullStitchedText += json.data.text;
//
//               // Update state without triggering the localStorage effect
//               setMessages((prev) =>
//                 prev.map((m) =>
//                   m.id === assistantMsgId ? { ...m, text: fullStitchedText, isStreaming: true } : m
//                 )
//               );
//             }
//             // If you receive text messages that don't have a 'type' field
//             else if (json.type === undefined && json.text) {
//               fullStitchedText += json.text;
//             }
//             // Explicitly ignore 'status', 'start', 'end', 'usage'
//             else if (['status', 'start', 'end', 'usage'].includes(json.type)) {
//               continue;
//             }
//             // Fallback: If you see unexpected structures, you can log them
//             // or append them as raw text only if they contain meaningful info.
//           } catch (e) {
//             // If JSON.parse fails, treat the line as raw text
//             fullStitchedText += rawJson;
//           }
//           // -------------------------------
//
//           // Update the message state
//           setMessages((prev) =>
//             prev.map((m) =>
//               m.id === assistantMsgId
//                 ? { ...m, text: fullStitchedText, isStreaming: true } // Keep isStreaming TRUE here
//                 : m
//             )
//           );
//           // scroll();
//         }
//         setTimeout(() => scroll(), 10);
//       }
//     } else {
//         // Handle standard JSON response
//         const raw = await res.text();
//         let displayOutput = raw;
//         try {
//           const parsed = JSON.parse(raw);
//           displayOutput = JSON.stringify(parsed, null, 2);
//         } catch (e) {
//           displayOutput = raw;
//         }
//
//         setLoading(false);
//         setMessages((p) => [...p, {
//           id: assistantMsgId,
//           text: displayOutput,
//           time: timestamp(), // <--- Generated here once response data is fully ready
//           isStreaming: false,
//           isComplete: true
//         }]);
//       }
//   } catch (err: any) {
//     setMessages((p) => [...p, { id: makeId(), text: `❌ Error: ${err.message}`, time: timestamp() }]);
//     setLoading(false);
//     setIsTyping(false);
//   } finally {
//     // This ensures that even if something crashes, the animations stop
//     setIsTyping(false);
//     // Don't set loading(false) here if you are handling it inside the 'done' block,
//     // but it's safe to keep it here as a backup.
//     setLoading(false);
//     scroll();
//   }
// };
// --- Updated handleSend in FloatingWindow ---
const handleSend = async (val?: string) => {
  const query = val || input;
  if (!query.trim() || !options.apiUrl) return;
  setShowSuggestions(false);

  const userMsgId = makeId();
  const assistantMsgId = makeId();
  const currentTime = timestamp(); // Get current timestamp for the user right now

  // 1. Add the user message AND the empty assistant placeholder at the same time
  setMessages((p) => [
    ...p,
    { id: userMsgId, text: query, time: currentTime, isUser: true },
    { id: assistantMsgId, text: '', time: '', isStreaming: true } // Assistant starts blank with no timestamp yet
  ]);

  setLoading(true);
  setInput('');
  setIsTyping(true);
  setAnimatedIds((prev) => new Set(prev).add(assistantMsgId));

  try {
    const method = (options.method || 'POST').toUpperCase();
    const headers: Record<string, string> = { 'Accept': 'text/event-stream, application/json' };

    let url = options.apiUrl;
    const fetchOpts: RequestInit = { method, headers, mode: 'cors' };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify({ query: query, use_agents: true });
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

      const decoder = new TextDecoder();
      let fullStitchedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 2. Stream is complete: Update text, clear streaming, and assign the final timestamp here!
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? {
              ...m,
              isStreaming: false,
              isComplete: true,
              time: timestamp() // <--- Timestamp prints only after response is complete
            } : m
          ));

          setLoading(false);
          setIsTyping(false);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const rawJson = trimmed.replace(/^data:\s*/, '');

          try {
            const json = JSON.parse(rawJson);

            if (json.type === 'error') {
              const rawError = json?.data?.message || '';
              let errorMessage = rawError;
              if (rawError.includes('AADSTS7000215') || rawError.includes('invalid_client')) {
                errorMessage =
                  'Authentication failed. Invalid Microsoft client secret provided. Please check the app client secret configuration.';
              }
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        text: `Error: ${errorMessage}`,
                        isStreaming: false,
                        isComplete: true,
                        isError: true,
                        time: timestamp() // Add timestamp on error too
                      }
                    : msg
                )
              );
              setLoading(false);
              setIsTyping(false);
              return;
            }

            if (json.type === 'delta' && json.data?.text) {
              fullStitchedText += json.data.text;
            } else if (json.type === undefined && json.text) {
              fullStitchedText += json.text;
            } else if (['status', 'start', 'end', 'usage'].includes(json.type)) {
              continue;
            }
          } catch (e) {
            fullStitchedText += rawJson;
          }

          // Update message text as chunks stream in
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, text: fullStitchedText, isStreaming: true }
                : m
            )
          );
        }
        setTimeout(() => scroll(), 10);
      }
    } else {
        // Handle standard JSON response fallback
        const raw = await res.text();
        let displayOutput = raw;
        try {
          const parsed = JSON.parse(raw);
          displayOutput = JSON.stringify(parsed, null, 2);
        } catch (e) {
          displayOutput = raw;
        }

        setLoading(false);
        setIsTyping(false);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? {
            ...m,
            text: displayOutput,
            time: timestamp(), // <--- Assign timestamp once full JSON is received
            isStreaming: false,
            isComplete: true
          } : m
        ));
      }
  } catch (err: any) {
    setMessages((prev) => prev.map((m) =>
      m.id === assistantMsgId ? {
        ...m,
        text: `❌ Error: ${err.message}`,
        time: timestamp(),
        isStreaming: false,
        isComplete: true,
        isError: true
      } : m
    ));
    setLoading(false);
    setIsTyping(false);
  } finally {
    setIsTyping(false);
    setLoading(false);
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
            .action-btn {
              background: none;
              border: none;
              cursor: pointer;
              padding: 0;
              transition: all 0.2s ease;
              filter: grayscale(1);
              opacity: 0.6;
            }
            .action-btn:hover {
              filter: grayscale(0);
              opacity: 1;
              transform: scale(1.2);
            }
            .action-btn:active {
              transform: scale(0.9);
            }
            /* Success flash animation for the copy button */
            .copy-success {
              animation: copyFlash 0.5s ease;
            }
            @keyframes copyFlash {
              0% { filter: brightness(1); }
              50% { filter: brightness(2); transform: scale(1.4); }
              100% { filter: brightness(1); }
            }
            /* Targets the plugin icon in the Grafana App/Plugin list settings */
            img[src*="sre-assistant-app/img/plugin.png"] {
              width: 70px !important;
              height: auto !important;
              max-height: 120px !important;
              transform: scale(1.7); /* Bumps the size up 20% */
            }
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
            .glow-mesh { background: linear-gradient(115deg, #ff375f, #ff9f0a, #ffd60a, #64d2ff, #5e5ce6, #bf5af2, #ff375f); background-size: 150% 150%; animation: aiShiftFast 1s linear infinite; }
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

            .chat-input-wrap input,
            .chat-input-wrap input:hover,
            .chat-input-wrap input:focus,
            .chat-input-wrap input:active {
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
            }
            .chat-input-wrap div,
            .chat-input-wrap div:hover,
            .chat-input-wrap div:focus,
            .chat-input-wrap div:active {
              box-shadow: none !important;
              border: none !important;
              outline: none !important;
            }
            /* Inside your <style> tag */
            .chat-container pre {
              max-width: 100%;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-all;
            }

            .chat-container code {
              white-space: pre-wrap;
              word-break: break-all;
            }
          `}</style>

      {(loading || isTyping) && (
        <>
          <div className="glow-mesh" style={{ position: 'absolute', inset: -1, borderRadius: 16, padding: '2.5px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' as any, zIndex: 0 }} />
          <div className="glow-mesh" style={{ position: 'absolute', inset: -5, borderRadius: 22, filter: 'blur(14px)', opacity: 0.7, zIndex: 0 }} />
        </>
      )}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16, overflow: 'visible', background: '#0e1014', border: '1px solid #736f6f' }}>
      <div style={{
        backgroundImage: 'linear-gradient(90deg, #0072f7, #0072f7)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#000',
        borderRadius: '16px 16px 0 0'
        }}>
        {/* Empty div to help center the title */}
        {/* NEW CHAT (+) - Left Aligned */}
        <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-start', position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            title="Options"
            style={{
              background: 'rgba(255,255,255)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ display: 'block', width: '14px', height: '2px', background: '#000', borderRadius: '2px' }} />
              <span style={{ display: 'block', width: '14px', height: '2px', background: '#000', borderRadius: '2px' }} />
              <span style={{ display: 'block', width: '14px', height: '2px', background: '#000', borderRadius: '2px' }} />
            </div>
          </button>

          {showMenu && (
            <div
              style={{
                position: 'absolute',
                top: '36px',
                left: 0,
                width: 'max-content',
                minWidth: '180px',
                maxWidth: '420px',
                background: '#1f232a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => {
                  resetChat();
                  setShowMenu(false);
                }}
                style={menuItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                New Chat
              </button>

              <button
                onClick={() => setShowHistory((prev) => !prev)}
                style={menuItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                History
              </button>
              {showHistory && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', maxHeight: '220px', overflowY: 'auto' }}>
                    {history.length === 0 ? (
                      <div style={{ padding: '10px 14px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                        No history yet
                      </div>
                    ) : (
                      history.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => loadHistoryChat(item)}
                          style={{
                            ...menuItemStyle,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            maxHeight: '220px',
                            overflowY: 'auto',
                            overflowX: 'auto',
                            width: 'max-content',
                            minWidth: '100%',
                            paddingLeft: '24px',
                            backgroundColor: 'black',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.color = '#FFD700';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'black';
                            e.currentTarget.style.color = 'rgba(255,255,255)';
                          }}
                          title={item.title}
                        >
                          {item.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
            </div>
          )}
        </div>

        <span style={{ fontWeight: 'bold' }}>AETNA SRE Assistant</span>
        {/* CLOSE BUTTON: Rounded on the Right (Triggers state in FloatingChat) */}
        {/* CLOSE (X) - Right Aligned */}
        <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setOpen(false)}
            title="Close"
            style={{
              background: '#FFFFFF',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>✕</span>
          </button>
        </div>
        </div>

        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => {
          const isUser = !!m.isUser;

          const shouldRender = isUser || m.id === 'welcome-msg' || m.text.length > 0;
          if (!shouldRender) {
            return null;
          }
          if (m.isError) {
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: 'center',
                  maxWidth: '85%',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    background: '#ffe5e5',
                    color: '#b00020',
                    border: '1px solid #ffb3b3',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(255,0,0,0.12)',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
                    Error
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start', // Pushes user right, bot left
              maxWidth: '90%',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start', // Aligns inner elements right or left
            }}>
              <div style={{
                display: 'flex',
                gap: 10,
                flexDirection: isUser ? 'row-reverse' : 'row', // Flips icon position for user vs bot
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: '4px 0',
                color: isUser ? '#ffffff' : '#e0e0e0',
                width: '100%'
              }}>
                {/* Icon Column */}
                <div style={{ flexShrink: 0, marginTop: 4 }}>
                  {isUser ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  ) : (
                    <img
                      src={robotIcon}
                      alt="Aetna Robot Icon"
                      style={{ width: '50px', height: '50px', objectFit: 'contain', display: 'block' }}
                    />
                  )}
                </div>

                {/* Text Column */}
                <div style={{ flex: 1, minWidth: 0, textAlign: isUser ? 'right' : 'left' }}>
                  <div style={{ fontSize: '0.7em', fontWeight: 'bold', marginBottom: 4, opacity: 0.7, letterSpacing: '0.5px' }}>
                    {isUser ? 'YOU' : 'AETNA ASSISTANT'}
                  </div>

                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', textAlign: 'left' }}>
                      <TypingText
                        key={m.id}
                        text={m.text}
                        shouldAnimate={!m.isUser && m.id !== 'welcome-msg'}
                        onTypingProgress={scroll}
                        isStreaming={m.isStreaming}
                        isComplete={m.isComplete}
                      />
                    </div>
                  </div>
                  {m.id === 'welcome-msg' && showSuggestions && (
                    <div style={{ marginTop: 12, textAlign: 'left' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.75)',
                          marginBottom: 8
                        }}
                      >
                        Suggestions
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8
                        }}
                      >
                        {[
                          'Why is the alert firing? What is the remediation?',
                          'Which POD is causing high CPU?',
                          'Show all prod logs',
                          'What caused CPU spike yesterday?',
                          'Have we seen this issue before?'
                        ].map((s, i) => (
                          <Button
                            key={i}
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSend(s)}
                            style={{ borderRadius: 8, backgroundColor: '#FFFFFF', color: '#000000' }}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Action Bar & Timestamp Wrapper */}
                  <div style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    borderTop: !isUser && !m.isStreaming && m.id !== 'welcome-msg' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    paddingTop: !isUser && !m.isStreaming && m.id !== 'welcome-msg' ? '6px' : '0'
                  }}>
                    {!isUser && !m.isStreaming && m.id !== 'welcome-msg' ? (
                      <div style={{ display: 'flex', gap: 14 }}>
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          navigator.clipboard.writeText(m.text);
                          const btn = e.currentTarget;
                          btn.classList.add('copy-success');
                          setTimeout(() => btn.classList.remove('copy-success'), 500);
                        }}
                        title="Copy response"
                      >
                        📋
                      </button>
                      <button
                        className="action-btn"
                        style={{
                          filter: m.vote === 'like' ? 'grayscale(0)' : 'grayscale(1)',
                          opacity: m.vote === 'like' ? 1 : 0.6,
                          transform: m.vote === 'like' ? 'scale(1.2)' : 'scale(1)'
                        }}
                        onClick={() => {
                          setMessages(prev => prev.map(msg =>
                            msg.id === m.id ? { ...msg, vote: msg.vote === 'like' ? null : 'like' } : msg
                          ));
                        }}
                        title="Good Response"
                      >
                        👍
                      </button>
                      <button
                        className="action-btn"
                        style={{
                          filter: m.vote === 'dislike' ? 'grayscale(0)' : 'grayscale(1)',
                          opacity: m.vote === 'dislike' ? 1 : 0.6,
                          transform: m.vote === 'dislike' ? 'scale(1.2)' : 'scale(1)'
                        }}
                        onClick={() => {
                          setMessages(prev => prev.map(msg =>
                            msg.id === m.id ? { ...msg, vote: msg.vote === 'dislike' ? null : 'dislike' } : msg
                          ));
                        }}
                        title="Bad Response"
                      >
                        👎
                      </button>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div style={{
                      fontSize: '10px',
                      color: '#aaa',
                      fontWeight: 'bolder'
                    }}>
                      {m.time}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
          {/* This block is now visually at the top ONLY while waiting for the first word */}
          {loading && messages[messages.length - 1]?.text === '' && (
            <div style={{
              color: '#FFD700',
              fontSize: '13px',
              paddingLeft: 10,
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <div className="thinking-ring" />
              <span className="thinking-text-gradient">Assistant is thinking...</span>
            </div>
          )}
        </div>

        <div style={{ padding: 16, background: '#0e1014', borderRadius: '0 0 16px 16px' }}>
          <div className="input-yellow-mesh" style={{ borderRadius: 12, padding: '2px' }}>
            <div className="chat-input-wrap" style={{ background: '#0e1014', borderRadius: 10, display: 'flex', gap: 8, padding: '4px 8px', position: 'relative', overflow: 'visible'}}>
            <Input value={input} onChange={(e) => setInput(e.currentTarget.value)} placeholder="Type a query..." onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSend();
                  }
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  background: 'transparent'
                }}
                />

              <Button onClick={() => handleSend()} style={{ background: 'linear-gradient(90deg, #0072f7, #0072f7)', color: '#000', fontWeight: 'bold' }}>Ask</Button>
            </div>
          </div>
          <div style={{
            textAlign: 'center',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
            fontStyle: 'italic',
            marginTop: '10px'
          }}>
            AETNA SRE Assistant is an AI and may make mistakes.
          </div>
        </div>
      </div>
    </div>
  );
};

export function FloatingChat() {
  const [open, setOpen] = useState(() => {
      const savedState = localStorage.getItem('aetna_sre_window_open');
      return savedState === 'true'; // Convert string to boolean
    });
    // For Position
  const [pos, setPos] = useState(() => {
    const savedPos = localStorage.getItem('aetna_sre_window_pos');
    return savedPos ? JSON.parse(savedPos) : { x: 30, y: 30 };
  });
  // For Size
  const [size, setSize] = useState(() => {
    const savedSize = localStorage.getItem('aetna_sre_window_size');
    return savedSize ? JSON.parse(savedSize) : { width: 700, height: 650 };
  });


  const [isDrag, setIsDrag] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const [dynOpts, setDynOpts] = useState<Options | null>(null);

  useEffect(() => {
    getBackendSrv().get(`/api/plugins/sre-assistant-app/settings`)
      .then(res => setDynOpts(res.jsonData))
      .catch(() => setDynOpts({ apiUrl: '' } as Options));
  }, []);

  useEffect(() => {
    localStorage.setItem('aetna_sre_window_open', open.toString());
  }, [open]);
  // Add effects to save them
  useEffect(() => {
    localStorage.setItem('aetna_sre_window_pos', JSON.stringify(pos));
  }, [pos]);
  useEffect(() => {
    localStorage.setItem('aetna_sre_window_size', JSON.stringify(size));
  }, [size]);

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

  const [isHovered, setIsHovered] = useState(false); // 1. Add this state
  if (!dynOpts) return null;

  return (
    <>
      {/* The Button */}
      <div
        onMouseDown={e => { startRef.current = { x: e.clientX, y: e.clientY }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }}
        onClick={() => !isDrag && setOpen(!open)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ position: 'fixed', right: pos.x, bottom: pos.y, width: 60, height: 60, zIndex: 10001, cursor: isDrag ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
      >
      {/* 3. The Tooltip Element */}
      {isHovered && !open && !isDrag && (
        <div style={{
          position: 'absolute',
          top: '-45px', // Positioned above the button
          right: '20%',
          backgroundColor: '#16181d',
          color: '#FFFFFF',
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          border: '1px solid #2096ef',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          Aetna SRE Assistant
          {/* Small triangle arrow at the bottom of tooltip */}
        </div>
        )}
        <img
          src={robotIcon}
          alt="Robot Icon"
          style={{ width: 130, height: 120 }}
        />
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
          borderRadius: '2px 0 0 0',
          filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))' // Adds contrast against dark backgrounds
        }} />
        </div>
        {dynOpts.apiUrl ? (
          <FloatingWindow height={size.height} options={dynOpts} setOpen={setOpen} width={size.width} data={{} as any} timeRange={{} as any} timeZone="browser" optionsStyle={{} as any} renderToken={0} id={1} title="" eventBus={{} as any} fieldConfig={{} as any} onChangeTimeRange={() => {}} onFieldConfigChange={() => {}} onOptionsChange={() => {}} replaceVariables={s => s} transparent={false} />
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
