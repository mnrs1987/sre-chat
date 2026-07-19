import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';
import { ROUTES } from '../../constants';
import { FloatingChat } from '../../pages/FloatingChat';

function App(props: AppRootProps) {
  return React.createElement(Routes, null,
    React.createElement(Route, { path: '/', element: React.createElement(Navigate, { to: ROUTES.FloatingChat, replace: true }) }),
    React.createElement(Route, { path: ROUTES.FloatingChat, element: React.createElement(FloatingChat, {}) }),
    React.createElement(Route, { path: '*', element: React.createElement('div', null, 'SRE Assistant') })
  );
}

export default App;
