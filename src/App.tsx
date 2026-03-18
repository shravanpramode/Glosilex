/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CredentialsModal } from './components/CredentialsModal';
import { Landing } from './pages/Landing';
import { Ask } from './pages/Ask';
import { Classify } from './pages/Classify';
import { Icp } from './pages/Icp';
import { Contracts } from './pages/Contracts';
import { Report } from './pages/Report';
import { hasCredentials } from './utils/session';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(hasCredentials());
  }, []);

  const handleCredentialsComplete = () => {
    setIsAuthenticated(true);
  };

  return (
    <Router>
      <div className="flex flex-col min-h-screen font-sans bg-slate-50 text-slate-900">
        {!isAuthenticated && <CredentialsModal onComplete={handleCredentialsComplete} />}
        
        <Header />
        
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/ask" element={isAuthenticated ? <Ask /> : <Navigate to="/" />} />
            <Route path="/classify" element={isAuthenticated ? <Classify /> : <Navigate to="/" />} />
            <Route path="/icp" element={isAuthenticated ? <Icp /> : <Navigate to="/" />} />
            <Route path="/contracts" element={isAuthenticated ? <Contracts /> : <Navigate to="/" />} />
            <Route path="/report" element={isAuthenticated ? <Report /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}
