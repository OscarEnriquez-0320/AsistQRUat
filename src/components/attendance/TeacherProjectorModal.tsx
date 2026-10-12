import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { User, TeacherCourse } from '../../types';
import { attendanceStore, DynamicSession, AttendanceRecord } from '../../services/attendanceStore';
import { supabase, syncClassSessionToSupabase } from '../../services/supabaseClient';
import { UATLogo } from '../common/UATLogo';
import { 
  X, Maximize2, Minimize2, RefreshCw, Volume2, VolumeX, 
  Clock, ShieldCheck, Copy, Check, Tv, UserCheck 
} from 'lucide-react';

interface TeacherProjectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCourse: TeacherCourse;
  currentUser: User;
  scheduleBlock: string;
}

export const TeacherProjectorModal: React.FC<TeacherProjectorModalProps> = ({
  isOpen,
  onClose,
  selectedCourse,
  currentUser,
  scheduleBlock,
}) => {
  const [activeSession, setActiveSession] = useState<DynamicSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copiedPin, setCopiedPin] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(20);
  const [liveRecords, setLiveRecords] = useState<AttendanceRecord[]>([]);
  const [latestRegistration, setLatestRegistration] = useState<AttendanceRecord | null>(null);
  const prevCountRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const refreshRecords = () => {
    const list = attendanceStore.getRecordsForCourse(selectedCourse.id);
    setLiveRecords(list);
    if (list.length > prevCountRef.current && prevCountRef.current > 0) {
      const newest = list[0];
      setLatestRegistration(newest);
      playChime();
      setTimeout(() => {
        setLatestRegistration(null);
      }, 4000);
    }
    prevCountRef.current = list.length;
  };

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  const initializeSession = async () => {
    let session = attendanceStore.getActiveSession();
    if (!session || !session.activa || session.courseId !== selectedCourse.id) {
      session = attendanceStore.startDynamicSession(
        {
          id: selectedCourse.id,
          codigo: selectedCourse.codigo,
          nombre: selectedCourse.nombre,
          grupo: selectedCourse.grupo,
          aula: selectedCourse.aula,
        },
        currentUser
      );
    }
    setActiveSession(session);
    generateQRCode(session);
    setSecondsRemaining(session.intervaloRotacionSegundos || 20);

    try {
      await syncClassSessionToSupabase({
        tokenActual: session.tokenActual,
        pinActual: session.pinActual,
        activa: true,
        sessionId: session.sessionId,
      });
    } catch (err) {
      console.warn('Advertencia al sincronizar sesión de proyector en Supabase:', err);
    }
  };

  const generateQRCode = async (session: DynamicSession) => {
    try {
      const url = await QRCode.toDataURL(session.tokenActual, {
        width: 540,
        margin: 2,
        color: {
          dark: '#020617',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error('Error al generar código QR de proyector:', err);
    }
  };

  const handleRotateToken = () => {
    const updated = attendanceStore.rotateDynamicToken();
    if (updated) {
      setActiveSession(updated);
      generateQRCode(updated);
      setSecondsRemaining(updated.intervaloRotacionSegundos || 20);
      syncClassSessionToSupabase({
        tokenActual: updated.tokenActual,
        pinActual: updated.pinActual,
        activa: true,
        sessionId: updated.sessionId,
      }).catch((err) => console.warn('Advertencia al rotar en Supabase:', err));
    }
  };

  useEffect(() => {
    if (isOpen) {
      initializeSession();
      refreshRecords();
      const unsubscribe = attendanceStore.subscribe(refreshRecords);

      const channel = supabase
        .channel(`asistencias-projector-realtime-${selectedCourse.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencias' },
          (payload) => {
            console.log('Realtime asistencia recibida en Proyector:', payload);
            refreshRecords();
            playChime();
          }
        )
        .subscribe();

      timerRef.current = window.setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            handleRotateToken();
            return 20;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        unsubscribe();
        supabase.removeChannel(channel);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, selectedCourse.id]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(console.error);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
        }).catch(console.error);
      }
    }
  };

  if (!isOpen) return null;

  const totalStudents = selectedCourse.totalAlumnos || selectedCourse.alumnos?.length || 1;
  const registeredCount = liveRecords.length;
  const progressPct = Math.min(100, Math.round((registeredCount / totalStudents) * 100));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-y-auto flex flex-col justify-between p-3 sm:p-6 text-white animate-in fade-in duration-200">
      
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
            <Tv className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                Modo Proyector · Pantalla de Aula
              </span>
              <span className="text-xs font-mono text-amber-300 font-bold">
                {selectedCourse.codigo} · Grupo {selectedCourse.grupo}
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black text-white leading-tight mt-0.5">
              {selectedCourse.nombre}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            title={soundEnabled ? 'Silenciar campanadas' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-amber-400" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-rose-900/60 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Cerrar proyector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {latestRegistration && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border-2 border-emerald-300 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 max-w-md">
          <div className="w-10 h-10 rounded-full bg-white text-emerald-800 flex items-center justify-center shrink-0 shadow-md">
            <Check className="w-6 h-6 stroke-[3.5]" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 block">
              ¡Nuevo Registro en Tiempo Real!
            </span>
            <p className="text-sm font-extrabold text-white truncate">
              {latestRegistration.nombreAlumno}
            </p>
            <p className="text-xs font-mono text-emerald-200">
              Matrícula: {latestRegistration.matricula} · {latestRegistration.hora}
            </p>
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <div className="my-auto py-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        
        {/* Columna Izquierda: QR Grande + PIN */}
        <div className="lg:col-span-7 flex flex-col items-center text-center space-y-4">
          <div className="bg-slate-900/80 border-2 border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col items-center max-w-lg w-full relative overflow-hidden">
            <div className="flex items-center justify-between w-full mb-3 px-1">
              <div className="flex items-center gap-2">
                <UATLogo size="sm" />
                <div className="text-left">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
                    Escaneo Oficial UAT
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    Apunta la cámara de tu celular
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRotateToken}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer border border-slate-700"
                title="Generar nuevo token de seguridad"
              >
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span>Rotando en {secondsRemaining}s</span>
              </button>
            </div>

            <div className="relative p-4 bg-white rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.25)] border-4 border-amber-400/80 my-2 flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Sesión ${selectedCourse.codigo}`}
                  className="w-64 h-64 sm:w-80 sm:h-80 object-contain rounded-xl"
                />
              ) : (
                <div className="w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center text-slate-900">
                  <RefreshCw className="w-10 h-10 animate-spin text-amber-500" />
                </div>
              )}
            </div>

            {/* PIN Alternativo de 6 Caracteres */}
            <div className="w-full mt-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 rounded-2xl p-4 shadow-xl border-2 border-amber-300 flex items-center justify-between">
              <div className="text-left">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 block">
                  PIN Alternativo de Respaldo:
                </span>
                <span className="text-xs font-bold text-slate-800">
                  Dictar a alumnos con cámara dañada
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest bg-slate-950 text-amber-400 px-4 py-1 rounded-xl shadow-inner border border-slate-800">
                  {activeSession?.pinActual || 'TLM492'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const pin = activeSession?.pinActual || 'TLM492';
                    navigator.clipboard?.writeText(pin);
                    setCopiedPin(true);
                    setTimeout(() => setCopiedPin(false), 2000);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-400 transition-colors cursor-pointer"
                  title="Copiar PIN"
                >
                  {copiedPin ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-3 font-medium">
              Token dinámico con sellado criptográfico institucional UAT · Rotación automática periódica.
            </p>
          </div>
        </div>

        {/* Columna Derecha: Contador de Alumnos en Tiempo Real */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Pase de Lista Activo en Aula
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> {scheduleBlock}
              </span>
            </div>

            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800/80 flex items-baseline justify-between shadow-inner">
              <div>
                <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                  Alumnos Registrados:
                </span>
                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-5xl sm:text-6xl font-black text-emerald-400 tracking-tight">
                    {registeredCount}
                  </span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-slate-500">
                    / {totalStudents}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl sm:text-4xl font-black text-amber-400 font-mono">
                  {progressPct}%
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mt-0.5">
                  Presentes
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_15px_rgba(16,185,129,0.7)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>{Math.max(0, totalStudents - registeredCount)} alumnos por registrar</span>
                <span className="font-mono text-slate-300">{selectedCourse.aula}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-72 sm:h-80">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs sm:text-sm font-extrabold text-white">
                  Feed de Asistencia en Directo ({liveRecords.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En vivo
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2">
              {liveRecords.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <UserCheck className="w-10 h-10 text-slate-700 mb-2" />
                  <p className="text-sm font-bold text-slate-400">Esperando escaneos de alumnos...</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Los nombres de los estudiantes aparecerán aquí al instante en que escaneen el código QR en pantalla.
                  </p>
                </div>
              ) : (
                liveRecords.map((rec, idx) => (
                  <div
                    key={rec.id}
                    className={`p-3 rounded-xl flex items-center justify-between text-xs transition-all ${
                      idx === 0 ? 'bg-emerald-950/40 border border-emerald-500/30 text-white' : 'hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white truncate text-sm">
                          {rec.nombreAlumno}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-1.5 py-0.2 rounded font-mono">
                            Último
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span>{rec.matricula}</span>
                        <span>·</span>
                        <span className="text-amber-300">{rec.hora}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3 stroke-[3]" />
                      Presente
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer del Proyector */}
      <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Docente: <strong>{currentUser.nombre} {currentUser.apellidos}</strong> · {selectedCourse.aula} · Sistema Institucional UAT
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
        >
          Cerrar Pantalla de Proyección
        </button>
      </div>
    </div>
  );
};
