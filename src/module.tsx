import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { Suspense, lazy } from 'react';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigProps } from './components/AppConfig/AppConfig';
import { FloatingChat } from './pages/FloatingChat'; // ← your component

console.log('[SRE Plugin] module loaded');

try {
  const el = document.createElement('div');
  el.id = 'sre-assistant-app';
  document.body.appendChild(el);

  ReactDOM.createRoot(el).render(
    React.createElement(FloatingChat, {})  // ← no JSX needed here
  );

  console.log('[SRE Plugin] FloatingChat mounted');
} catch (e) {
  console.error('[SRE Plugin] mount failed', e);
}

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
