import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';
import { ROUTES } from '../../constants';
import { FloatingChat } from '../../pages/FloatingChat';

function App(props: AppRootProps) {
  return (
    <Routes>
      <Route path={ROUTES.FloatingChat} element={<FloatingChat />} />
    </Routes>
  );
}

export default App;
