import React from 'react';
import { User } from '../../types';
import { LogOut, User as UserIcon, Shield, QrCode, Calendar, HelpCircle } from 'lucide-react';

interface TopNavbarProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDemoSwitcher?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onLogout,
  onOpenDemoSwitcher,
}) => {
  const getNavLinks = () => {
    if (!currentUser) {
      return [];
    }
    if (currentUser.rol === 'alumno') {
      return [
        { id: 'resumen', label: 'Resumen Académico' },
        { id: 'asistencia-qr', label: 'Asistencia por QR' },
        { id: 'materias', label: 'Mis Materias' },
        { id: 'credencial', label: 'Credencial Digital' },
        { id: 'seguridad', label: 'Mi Seguridad' },
      ];
    }
    if (currentUser.rol === 'profesor') {
      return [
        { id: 'grupos', label: 'Mis Grupos' },
        { id: 'asistencia-qr', label: 'Pase de Lista (QR)' },
        { id: 'calificaciones', label: 'Evaluaciones' },
        { id: 'credencial', label: 'Credencial Docente' },
        { id: 'seguridad', label: 'Mi Seguridad' },
      ];
    }
    // Administrador
    return [
      { id: 'usuarios', label: 'Directorio de Usuarios' },
      { id: 'asistencia-qr', label: 'Monitoreo QR' },
      { id: 'auditoria', label: 'Bitácora de Accesos' },
      { id: 'metricas', label: 'Estadísticas' },
      { id: 'seguridad', label: 'Configuración' },
    ];
  };

  const navLinks = getNavLinks();

  const getRoleDisplayName = (rol: User['rol']) => {
    switch (rol) {
      case 'alumno':
        return 'Portal de Alumno';
      case 'profesor':
        return 'Portal de Docente';
      case 'administrador':
        return 'Control Escolar (Admin)';
      default:
        return 'Portal Institucional';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 w-full shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4.25rem] py-2.5 gap-4">
          
          {/* Zona Izquierda: Identidad Institucional FIT UAT */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab(navLinks[0]?.id || 'inicio')}
              className="flex items-center gap-3 text-left focus:outline-none group select-none cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-12 h-10 sm:h-11 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center p-1 shrink-0">
                  <img
                    src="/images/logo-uat.png"
                    alt="Universidad Autónoma de Tamaulipas"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="w-12 h-10 sm:h-11 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center p-1 shrink-0">
                  <img
                    src="/images/logo-fit.png"
                    alt="Facultad de Ingeniería Tampico"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-[11px] sm:text-xs font-black tracking-wider text-[#14234B] uppercase block leading-tight truncate">
                  UAT · Facultad de Ingeniería Tampico
                </span>
                <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors flex items-center gap-1.5 leading-snug mt-0.5">
                  <span>Asistencia por QR</span>
                  {currentUser && (
                    <span className="text-[10px] font-semibold text-slate-400 hidden sm:inline">
                      / {getRoleDisplayName(currentUser.rol)}
                    </span>
                  )}
                </span>
              </div>
            </button>
          </div>

          {/* Zona Central: Enlaces para usuario autenticado */}
          {currentUser && navLinks.length > 0 && (
            <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2 text-xs font-semibold text-slate-600 shrink-0">
              {navLinks.map((link) => {
                const isActive = activeTab === link.id;
                const isQR = link.id === 'asistencia-qr';
                return (
                  <button
                    key={link.id}
                    onClick={() => setActiveTab(link.id)}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'text-slate-900 font-bold bg-slate-100 shadow-2xs ring-1 ring-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {isQR && <QrCode className={`w-3.5 h-3.5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />}
                    <span>{link.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Zona Derecha */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end text-right">
                  <span className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.nombre} {currentUser.apellidos.split(' ')[0]}
                  </span>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <span className="tabular-nums text-slate-700 font-semibold">{currentUser.identificadorInstitucional}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize font-sans text-amber-700 font-bold">{currentUser.rol}</span>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 overflow-hidden shrink-0">
                  {currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.nombre}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-slate-500" />
                  )}
                </div>

                {onOpenDemoSwitcher && (
                  <button
                    onClick={onOpenDemoSwitcher}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                    title="Selector de Roles UAT"
                  >
                    <Shield className="w-4 h-4 text-amber-600" />
                  </button>
                )}

                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 hover:border-rose-400 rounded-xl transition-all whitespace-nowrap shadow-2xs cursor-pointer active:scale-95"
                  title="Cerrar sesión institucional UAT"
                >
                  <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-extrabold">Cerrar Sesión</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 sm:gap-4">
                <a
                  href="mailto:soporte@uat.edu.mx"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#14234B] hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Mesa de Ayuda</span>
                </a>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Ciclo Escolar 2026-2</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {currentUser && navLinks.length > 0 && (
          <div className="flex lg:hidden items-center overflow-x-auto py-2.5 border-t border-slate-100 gap-2 text-xs font-medium text-slate-600 no-scrollbar">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => setActiveTab(link.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === link.id
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={onLogout}
              className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 shrink-0 ml-auto cursor-pointer"
              title="Cerrar sesión institucional UAT"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
