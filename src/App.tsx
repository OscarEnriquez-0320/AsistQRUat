/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types';
import { authStore } from './services/authStore';
import { TopNavbar } from './components/layout/TopNavbar';
import { AuthView } from './components/auth/AuthView';
import { StudentDashboard } from './components/dashboard/StudentDashboard';
import { TeacherDashboard } from './components/dashboard/TeacherDashboard';
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [showRoleSwitcher, setShowRoleSwitcher] = useState<boolean>(true);

  // Initialize session and sync with Supabase on mount
  useEffect(() => {
    // Sincronizar usuarios desde Supabase en segundo plano
    authStore.syncWithSupabase().catch(err => {
      console.warn('Aviso de carga de usuarios en Supabase:', err);
    });
    const session = authStore.getCurrentSession();
    if (session) {
      setCurrentUser(session);
      setDefaultTabForRole(session.rol);
    }
  }, []);

  const setDefaultTabForRole = (role: User['rol']) => {
    switch (role) {
      case 'alumno':
        setActiveTab('resumen');
        break;
      case 'profesor':
        setActiveTab('grupos');
        break;
      case 'administrador':
        setActiveTab('usuarios');
        break;
      default:
        setActiveTab('inicio');
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setDefaultTabForRole(user.rol);
  };

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
    setActiveTab('inicio');
  };

  const handleUserUpdate = (updated: User) => {
    setCurrentUser(updated);
    authStore.setCurrentSession(updated);
  };

  const handleSwitchUser = (user: User) => {
    setCurrentUser(user);
    setDefaultTabForRole(user.rol);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased overflow-x-hidden">
      {/* Top Navigation Bar with UAT Branding and Asistencia por QR */}
      <TopNavbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onOpenDemoSwitcher={() => setShowRoleSwitcher(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {!currentUser ? (
          <AuthView onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
            {currentUser.rol === 'alumno' && (
              <StudentDashboard
                user={currentUser}
                activeTab={activeTab}
                onUserUpdate={handleUserUpdate}
                onLogout={handleLogout}
              />
            )}
            {currentUser.rol === 'profesor' && (
              <TeacherDashboard
                user={currentUser}
                activeTab={activeTab}
                onUserUpdate={handleUserUpdate}
                onLogout={handleLogout}
              />
            )}
            {currentUser.rol === 'administrador' && (
              <AdminDashboard
                user={currentUser}
                activeTab={activeTab}
                onUserUpdate={handleUserUpdate}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
      </main>

      {/* Quick Role Switcher */}
      {showRoleSwitcher && (
        <RoleSwitcherBanner
          currentUser={currentUser}
          onSwitchUser={handleSwitchUser}
          onClose={() => setShowRoleSwitcher(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Footer UAT */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-amber-700">UAT</span>
            <span>·</span>
            <span className="font-semibold text-slate-800">Universidad Autónoma de Tamaulipas</span>
            <span>·</span>
            <span>Asistencia por QR</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Dirección de Servicios Escolares</span>
            <span>·</span>
            <span>Soporte: soporte@uat.edu.mx</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
