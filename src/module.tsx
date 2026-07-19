import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { Suspense, lazy } from 'react';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigProps } from './components/AppConfig/AppConfig';
import { FloatingChat } from './pages/FloatingChat';

function mountChatbot() {
  if (document.getElementById('sre-assistant-app')) { return; }
  try {
    const el = document.createElement('div');
    el.id = 'sre-assistant-app';
    document.body.appendChild(el);
    ReactDOM.createRoot(el).render(React.createElement(FloatingChat, {}));
  } catch (e) {
    console.error('[SRE Plugin] mount failed', e);
  }
}

// Mount on load
mountChatbot();

// Re-mount on SPA navigation using native History API
const _pushState = window.history.pushState.bind(window.history);
window.history.pushState = function() {
  _pushState.apply(window.history, arguments as any);
  mountChatbot();
};

const _replaceState = window.history.replaceState.bind(window.history);
window.history.replaceState = function() {
  _replaceState.apply(window.history, arguments as any);
  mountChatbot();
};

window.addEventListener('popstate', mountChatbot);

const LazyApp = lazy(() => import('./components/App/App'));
const LazyAppConfig = lazy(() => import('./components/AppConfig/AppConfig'));

const App = (props: AppRootProps) =>
  React.createElement(
    Suspense,
    { fallback: React.createElement(LoadingPlaceholder, { text: '' }) },
    React.createElement(LazyApp, props)
  );

const AppConfig = (props: AppConfigProps) =>
  React.createElement(
    Suspense,
    { fallback: React.createElement(LoadingPlaceholder, { text: '' }) },
    React.createElement(LazyAppConfig, props)
  );

export const plugin = new AppPlugin<{}>().setRootPage(App).addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
