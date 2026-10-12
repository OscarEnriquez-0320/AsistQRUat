import React from 'react';
import { User, UserRole } from '../../types';
import { authStore } from '../../services/authStore';
import { GraduationCap, Building2, Shield, X, ArrowLeftRight, LogOut } from 'lucide-react';

interface RoleSwitcherBannerProps {
  currentUser: User | null;
  onSwitchUser: (user: User) => void;
  onClose?: () => void;
  onLogout?: () => void;
}

export const RoleSwitcherBanner: React.FC<RoleSwitcherBannerProps> = ({
  currentUser,
  onSwitchUser,
  onClose,
  onLogout,
}) => {
  const users = authStore.getUsers();

  const handleQuickSwitch = (role: UserRole) => {
    let target = users.find(u => u.rol === role);
    if (!target) {
      if (role === 'alumno') target = users.find(u => u.identificadorInstitucional === '2243330309' || /^\d{10}$/.test(u.identificadorInstitucional));
      else if (role === 'profesor') target = users.find(u => u.identificadorInstitucional.includes('NPO') || u.correo.includes('docentes'));
      else target = users.find(u => u.identificadorInstitucional.includes('ADM') || u.correo.includes('admin'));
    }
    if (target) {
      authStore.setCurrentSession(target);
      onSwitchUser(target);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm bg-white/95 backdrop-blur-md text-slate-800 p-3.5 rounded-xl shadow-2xl border border-slate-200 text-xs animate-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-900">
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-600" />
          <span>Selector de Roles UAT</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-2 leading-snug">
        Navegación rápida entre los 3 roles institucionales UAT:
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => handleQuickSwitch('alumno')}
          className={`py-1.5 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors border cursor-pointer ${
            currentUser?.rol === 'alumno'
              ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[10px] leading-none">Alumno</span>
          <span className="text-[9px] font-mono opacity-70">2243330309</span>
        </button>
        <button
          onClick={() => handleQuickSwitch('profesor')}
          className={`py-1.5 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors border cursor-pointer ${
            currentUser?.rol === 'profesor'
              ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-[10px] leading-none">Docente</span>
          <span className="text-[9px] font-mono opacity-70">NPO-40910</span>
        </button>
        <button
          onClick={() => handleQuickSwitch('administrador')}
          className={`py-1.5 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors border cursor-pointer ${
            currentUser?.rol === 'administrador'
              ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[10px] leading-none">Admin</span>
          <span className="text-[9px] font-mono opacity-70">ADM-1001</span>
        </button>
      </div>
      {currentUser && onLogout && (
        <button
          onClick={onLogout}
          className="w-full mt-2.5 py-1.5 px-3 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-600" />
          <span>Cerrar Sesión</span>
        </button>
      )}
    </div>
  );
};
