import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { TeacherCourse } from '../../types';
import { attendanceStore, AttendanceRecord } from '../../services/attendanceStore';
import { supabase, fetchActiveSessionFromSupabase, ensureUserInSupabase } from '../../services/supabaseClient';
import { decodeQrFromImageFile } from '../../utils/qrDecoder';
import {
  Camera, CameraOff, X, CheckCircle2, AlertCircle,
  Volume2, VolumeX, RefreshCw, UserCheck,
  Zap, Search, ShieldCheck, Upload, ArrowRight, Check,
  Loader2, Download, Clock, Calendar,
  FileSpreadsheet, UserX
} from 'lucide-react';

interface TeacherQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCourse: TeacherCourse;
  allCourses?: TeacherCourse[];
  initialSchedule?: string;
  onCourseChange?: (courseId: string) => void;
  onScheduleChange?: (schedule: string) => void;
}

const SCHEDULE_BLOCKS = [
  '07:00 AM - 09:00 AM',
  '09:00 AM - 11:00 AM',
  '11:00 AM - 01:00 PM',
  '01:00 PM - 03:00 PM',
  '03:00 PM - 05:00 PM',
  '05:00 PM - 07:00 PM',
];

export const TeacherQRScannerModal: React.FC<TeacherQRScannerModalProps> = ({
  isOpen,
  onClose,
  selectedCourse,
  allCourses = [],
  initialSchedule = '07:00 AM - 09:00 AM',
  onCourseChange,
  onScheduleChange,
}) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCooldownActive = useRef(false);
  const cooldownTimerRef = useRef<number | null>(null);

  const [activeCourseId, setActiveCourseId] = useState<string>(selectedCourse.id);
  const [activeSchedule, setActiveSchedule] = useState<string>(initialSchedule);
  const [scanMode, setScanMode] = useState<'single' | 'continuous'>('continuous');
  const scanModeRef = useRef<'single' | 'continuous'>('continuous');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isDecodingFile, setIsDecodingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string>('');

  const [showSuccessScreen, setShowSuccessScreen] = useState<boolean>(false);
  const [successData, setSuccessData] = useState<{
    studentName: string;
    matricula: string;
    hora: string;
    materia: string;
    grupo: string;
  } | null>(null);

  const [sequentialToast, setSequentialToast] = useState<{
    studentName: string;
    matricula: string;
    hora: string;
    mensaje?: string;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [scanWarningToast, setScanWarningToast] = useState<string | null>(null);
  const scanToastTimerRef = useRef<number | null>(null);

  const [lastScannedResult, setLastScannedResult] = useState<{
    success: boolean;
    isDuplicate: boolean;
    studentName: string;
    matricula: string;
    hora: string;
    message: string;
  } | null>(null);

  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const [sessionLogs, setSessionLogs] = useState<AttendanceRecord[]>([]);
  const [manualInput, setManualInput] = useState<string>('');
  const [manualError, setManualError] = useState<string>('');

  const [showSummaryScreen, setShowSummaryScreen] = useState<boolean>(false);
  const [summaryFilter, setSummaryFilter] = useState<'todos' | 'presentes' | 'ausentes'>('todos');
  const [confirmSaveSuccess, setConfirmSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    setActiveCourseId(selectedCourse.id);
  }, [selectedCourse.id]);

  useEffect(() => {
    if (initialSchedule) {
      setActiveSchedule(initialSchedule);
    }
  }, [initialSchedule]);

  const currentCourse = (allCourses && allCourses.find(c => c.id === activeCourseId)) || selectedCourse;

  const refreshLogs = () => {
    const list = attendanceStore.getRecordsForCourse(currentCourse.id);
    setSessionLogs(list);
  };

  useEffect(() => {
    if (isOpen) {
      refreshLogs();
      const unsubscribe = attendanceStore.subscribe(refreshLogs);

      const channel = supabase
        .channel(`asistencias-teacher-scanner-${currentCourse.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencias' },
          (payload) => {
            console.log('Realtime asistencia en TeacherQRScannerModal:', payload);
            refreshLogs();
          }
        )
        .subscribe();

      return () => {
        unsubscribe();
        supabase.removeChannel(channel);
        stopCamera();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        if (scanToastTimerRef.current) clearTimeout(scanToastTimerRef.current);
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        isCooldownActive.current = false;
      };
    } else {
      stopCamera();
      setShowSuccessScreen(false);
      setShowSummaryScreen(false);
      setScanWarningToast(null);
      setConfirmSaveSuccess(false);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      isCooldownActive.current = false;
    }
  }, [isOpen, currentCourse.id]);

  const stopCamera = async () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    isCooldownActive.current = false;
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error al detener cámara:', err);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async (overrideFacing?: 'environment' | 'user') => {
    try {
      setCameraError('');
      setFileError('');
      const targetFacing = overrideFacing || facingMode;

      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch { }
        html5QrCodeRef.current = null;
      }

      const html5QrCode = new Html5Qrcode("reader-container");
      html5QrCodeRef.current = html5QrCode;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdgePercentage = 0.75;
        const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
        return { width: qrboxSize, height: qrboxSize };
      };

      const cameraConstraints: MediaTrackConstraints = {
        facingMode: targetFacing,
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
      };

      const config = {
        fps: 20,
        qrbox: qrboxFunction,
        aspectRatio: 1.0,
        disableFlip: false,
        videoConstraints: cameraConstraints,
      };

      try {
        await html5QrCode.start(
          cameraConstraints,
          config,
          (decodedText) => handleSuccessScan(decodedText),
          () => { }
        );
      } catch (advancedConstraintErr) {
        console.warn("Reintentando cámara con configuración básica:", advancedConstraintErr);
        await html5QrCode.start(
          { facingMode: targetFacing },
          {
            fps: 20,
            qrbox: qrboxFunction,
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => handleSuccessScan(decodedText),
          () => { }
        );
      }
      setCameraActive(true);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const msg = errObj?.message || String(err);
      console.error("Error al iniciar cámara:", err);
      setCameraActive(false);
      setCameraError(msg);
    }
  };

  const handleSuccessScan = async (decodedText: string) => {
    if (isCooldownActive.current) {
      return;
    }
    isCooldownActive.current = true;

    console.log("QR Detectado:", decodedText);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch { }
    }

    const wasRegistered = await handleCodeScanned(decodedText);

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }

    if (scanModeRef.current === 'single' && wasRegistered) {
      await stopCamera();
      window.setTimeout(onClose, 1800);
    } else {
      cooldownTimerRef.current = window.setTimeout(() => {
        isCooldownActive.current = false;
      }, 3000);
    }
  };

  const toggleFacingMode = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraActive) {
      await stopCamera();
      setTimeout(() => {
        startCamera(nextMode);
      }, 150);
    }
  };

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch { }
  };

  const handleCodeScanned = async (rawCode: string, isFromUpload = false): Promise<boolean> => {
    const now = Date.now();
    if (!isFromUpload && lastScannedCodeRef.current.code === rawCode && now - lastScannedCodeRef.current.time < 2000) {
      return false;
    }
    lastScannedCodeRef.current = { code: rawCode, time: now };

    const parsed = attendanceStore.parseStudentQR(rawCode);
    let matriculaFinal = parsed?.matricula;

    if (!matriculaFinal) {
      const match = rawCode.match(/\d{8,10}/);
      if (match) {
        matriculaFinal = match[0];
      } else {
        const anyDigitsMatch = rawCode.match(/\d{5,12}/);
        if (anyDigitsMatch) {
          matriculaFinal = anyDigitsMatch[0];
        } else if (/^\d+$/.test(rawCode.trim())) {
          matriculaFinal = rawCode.trim();
        }
      }
    }

    if (!matriculaFinal) {
      const errorMsg = "QR Detectado pero no es una matrícula válida: " + rawCode;
      console.warn(errorMsg);
      setScanWarningToast(errorMsg);
      if (scanToastTimerRef.current) clearTimeout(scanToastTimerRef.current);
      scanToastTimerRef.current = window.setTimeout(() => {
        setScanWarningToast(null);
      }, 4000);
      setLastScannedResult({
        success: false,
        isDuplicate: false,
        studentName: 'Código no reconocido',
        matricula: rawCode.slice(0, 15),
        hora: new Date().toLocaleTimeString('es-MX'),
        message: errorMsg,
      });
      return false;
    }

    setScanWarningToast(null);
    return processMatricula(matriculaFinal, false);
  };

  const processMatricula = async (matricula: string, forceFresh = false): Promise<boolean> => {
    const res = attendanceStore.recordStudentEntryByTeacher({
      matricula,
      courseId: currentCourse.id,
      codigoMateria: currentCourse.codigo,
      nombreMateria: currentCourse.nombre,
      grupo: currentCourse.grupo,
      forceFresh,
    });

    const horaReg = res.record?.hora || new Date().toLocaleTimeString('es-MX');
    const studentName = res.studentName || `Alumno ${matricula}`;

    setLastScannedResult({
      success: res.success,
      isDuplicate: res.isDuplicate,
      studentName,
      matricula,
      hora: horaReg,
      message: res.message,
    });

    try {
      const activeSbSession = await fetchActiveSessionFromSupabase();
      if (activeSbSession) {
        await ensureUserInSupabase({
          matricula,
          nombre: studentName,
          rol: 'alumno',
        });
        await supabase.from('asistencias').insert({
          sesion_id: activeSbSession.id,
          alumno_matricula: matricula,
          estatus: 'presente',
        });
      }
    } catch (e) {
      console.warn('Advertencia al registrar asistencia docente en Supabase:', e);
    }

    if (res.success) {
      playBeep();
      if (cameraActive && scanModeRef.current === 'continuous') {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setSequentialToast({
          studentName,
          matricula,
          hora: horaReg,
          mensaje: 'Alumno registrado. Siguiente...',
        });
        toastTimerRef.current = window.setTimeout(() => {
          setSequentialToast(null);
        }, 3000);
      } else {
        setSuccessData({
          studentName,
          matricula,
          hora: horaReg,
          materia: currentCourse.nombre,
          grupo: currentCourse.grupo,
        });
        setShowSuccessScreen(true);
      }
    }
    refreshLogs();
    return res.success;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    setIsDecodingFile(true);
    try {
      const decodedData = await decodeQrFromImageFile(file);
      if (!decodedData) {
        setFileError('No se detectó un código QR legible en la imagen seleccionada.');
        setIsDecodingFile(false);
        return;
      }
      await handleCodeScanned(decodedData, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la imagen seleccionada.';
      setFileError(msg);
    } finally {
      setIsDecodingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    if (!manualInput.trim()) return;
    processMatricula(manualInput.trim());
    setManualInput('');
  };

  const enrolledStudents = currentCourse.alumnos || [];
  const totalStudents = currentCourse.totalAlumnos || enrolledStudents.length || 1;
  const registeredCount = sessionLogs.length;
  const progressPct = Math.min(100, Math.round((registeredCount / totalStudents) * 100));

  const presentList = sessionLogs.map((log) => ({
    matricula: log.matricula,
    nombre: log.nombreAlumno,
    hora: log.hora,
    carrera: log.carrera,
    estatus: 'Presente' as const,
  }));

  const presentMatriculas = new Set(sessionLogs.map((s) => s.matricula.trim().toLowerCase()));
  const absentList = enrolledStudents
    .filter((al) => !presentMatriculas.has(al.matricula.trim().toLowerCase()))
    .map((al) => ({
      matricula: al.matricula,
      nombre: al.nombre,
      hora: '—',
      carrera: currentCourse.carrera,
      estatus: 'Falta' as const,
    }));

  const allSummaryList = [
    ...presentList.map((p) => ({ ...p, isPresent: true })),
    ...absentList.map((a) => ({ ...a, isPresent: false })),
  ];

  const filteredSummaryList = allSummaryList.filter((item) => {
    if (summaryFilter === 'presentes') return item.isPresent;
    if (summaryFilter === 'ausentes') return !item.isPresent;
    return true;
  });

  const handleDownloadCSV = () => {
    const todayStr = new Date().toLocaleDateString('es-MX');
    const headers = [
      'Matrícula',
      'Nombre del Alumno',
      'Materia',
      'Código',
      'Grupo',
      'Bloque de Horario',
      'Fecha',
      'Hora de Registro',
      'Estatus Oficial',
    ];
    const rows = [
      ...presentList.map((p) => [
        `"${p.matricula}"`,
        `"${p.nombre}"`,
        `"${currentCourse.nombre}"`,
        `"${currentCourse.codigo}"`,
        `"${currentCourse.grupo}"`,
        `"${activeSchedule}"`,
        `"${todayStr}"`,
        `"${p.hora}"`,
        `"Asistencia (Presente)"`,
      ]),
      ...absentList.map((a) => [
        `"${a.matricula}"`,
        `"${a.nombre}"`,
        `"${currentCourse.nombre}"`,
        `"${currentCourse.codigo}"`,
        `"${currentCourse.grupo}"`,
        `"${activeSchedule}"`,
        `"${todayStr}"`,
        `"Sin registro"`,
        `"Falta (Ausente)"`,
      ]),
    ];
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeDate = todayStr.replace(/\//g, '-');
    link.download = `Reporte_Asistencia_${currentCourse.codigo}_${currentCourse.grupo}_${safeDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmRegistration = () => {
    setConfirmSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1800);
  };

  const handleOpenSummary = () => {
    stopCamera();
    setShowSummaryScreen(true);
    setConfirmSaveSuccess(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[94vh]">

        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              {showSummaryScreen ? <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> : <Camera className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded">
                  {showSummaryScreen ? 'Resumen Oficial de Asistencia' : 'Lector Rápido UAT'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {currentCourse.codigo} · {currentCourse.grupo}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-0.5 leading-snug">
                {showSummaryScreen ? 'Acta Oficial de Asistencia de la Clase' : 'Escanear Credencial de Alumno en Aula'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showSummaryScreen && (
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                title={soundEnabled ? 'Silenciar confirmaciones' : 'Activar sonido'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showSummaryScreen ? (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
            <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded">
                    {currentCourse.codigo} · Grupo {currentCourse.grupo}
                  </span>
                  <span className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-amber-400" /> {activeSchedule}
                  </span>
                </div>
                <h3 className="text-lg font-black text-white">{currentCourse.nombre}</h3>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{currentCourse.aula}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-emerald-500/15 border border-emerald-400/40 rounded-xl px-4 py-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-300 block">Presentes</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">{presentList.length}</span>
                </div>
                <div className="bg-rose-500/15 border border-rose-400/40 rounded-xl px-4 py-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-rose-300 block">Faltas</span>
                  <span className="text-2xl font-black text-rose-400 font-mono">{absentList.length}</span>
                </div>
              </div>
            </div>

            {confirmSaveSuccess && (
              <div className="p-4 bg-emerald-500/20 border-2 border-emerald-500 rounded-2xl text-emerald-900 flex items-center gap-3 animate-in fade-in duration-300 shadow-md">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-emerald-950">
                    ¡Acta de Asistencias Confirmada y Guardada Exitosamente!
                  </h4>
                  <p className="text-xs text-emerald-800">
                    El registro oficial ha sido archivado en el sistema de la UAT.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSummaryFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${summaryFilter === 'todos'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  Todos ({allSummaryList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryFilter('presentes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${summaryFilter === 'presentes'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Presentes ({presentList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryFilter('ausentes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${summaryFilter === 'ausentes'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Faltas ({absentList.length})</span>
                </button>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Porcentaje de Asistencia: <strong className="text-slate-900 font-mono">{progressPct}%</strong>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[11px] border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3">Matrícula UAT</th>
                      <th className="px-4 py-3">Nombre del Alumno</th>
                      <th className="px-4 py-3 text-center">Hora de Registro</th>
                      <th className="px-4 py-3 text-center">Estatus Oficial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSummaryList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          No hay registros en esta categoría
                        </td>
                      </tr>
                    ) : (
                      filteredSummaryList.map((item) => (
                        <tr key={item.matricula} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {item.matricula}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {item.nombre}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-slate-600 whitespace-nowrap">
                            {item.hora}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {item.isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                Asistencia
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <X className="w-3.5 h-3.5 stroke-[3]" />
                                Falta
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowSummaryScreen(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span>Volver al Escáner</span>
              </button>
              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>Descargar Reporte (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRegistration}
                  disabled={confirmSaveSuccess}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>{confirmSaveSuccess ? 'Guardado Exitosamente' : 'Confirmar Registro'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
                    Materia y Grupo:
                  </label>
                  {allCourses && allCourses.length > 1 ? (
                    <select
                      value={activeCourseId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setActiveCourseId(newId);
                        if (onCourseChange) onCourseChange(newId);
                      }}
                      className="text-xs font-bold bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    >
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} · {c.nombre} ({c.grupo})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-extrabold text-slate-900 block truncate">
                      {currentCourse.nombre} ({currentCourse.codigo} · {currentCourse.grupo})
                    </span>
                  )}
                </div>
                <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
                    Bloque de Horario:
                  </label>
                  <select
                    value={activeSchedule}
                    onChange={(e) => {
                      const newSched = e.target.value;
                      setActiveSchedule(newSched);
                      if (onScheduleChange) onScheduleChange(newSched);
                    }}
                    className="text-xs font-bold font-mono bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    {SCHEDULE_BLOCKS.map((bloque) => (
                      <option key={bloque} value={bloque}>
                        {bloque}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{currentCourse.aula}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 flex flex-col space-y-4">
                <div className="bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl border border-slate-800 shadow-md">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs sm:text-sm font-extrabold text-white">
                        Alumnos Registrados: <strong className="text-emerald-400 font-mono text-base">{registeredCount}</strong> / <span className="text-slate-400 font-mono">{totalStudents}</span>
                      </span>
                    </div>
                    <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                      {progressPct}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700/60">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                <div className="relative rounded-2xl bg-black overflow-hidden flex flex-col items-center justify-center shadow-inner border-2 border-slate-800 w-full min-h-64">
                  <div
                    id="reader-container"
                    className="w-full h-64 bg-black rounded-lg overflow-hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                  />

                  {showSuccessScreen && successData ? (
                    <div className="absolute inset-0 z-30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-6 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300 shadow-2xl">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 border-4 border-white flex items-center justify-center text-white mb-3 shadow-[0_0_35px_rgba(255,255,255,0.4)] animate-bounce">
                        <Check className="w-12 h-12 sm:w-14 sm:h-14 stroke-[3.5]" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest bg-emerald-950/40 text-emerald-100 px-3 py-1 rounded-full border border-emerald-400/40 mb-2">
                        Asistencia Registrada en Aula
                      </span>
                      <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
                        ¡ASISTENCIA REGISTRADA CON ÉXITO!
                      </h3>
                      <div className="mt-3 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 w-full max-w-sm space-y-1">
                        <p className="text-base sm:text-lg font-extrabold text-white truncate">
                          {successData.studentName}
                        </p>
                        <div className="flex items-center justify-center gap-2 font-mono text-xs text-emerald-100">
                          <span>Matrícula: <strong>{successData.matricula}</strong></span>
                          <span>·</span>
                          <span>Hora: {successData.hora}</span>
                        </div>
                        <p className="text-[11px] text-emerald-200 truncate">
                          {successData.materia} ({successData.grupo})
                        </p>
                      </div>
                      {scanMode === 'continuous' && (
                        <div className="mt-5 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setShowSuccessScreen(false)}
                            className="px-5 py-2.5 bg-white text-emerald-900 font-extrabold text-xs rounded-xl shadow-lg hover:bg-emerald-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                            <span>Continuar Escaneando</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {cameraActive && (
                    <>
                      {scanWarningToast && (
                        <div className="absolute top-3 inset-x-3 z-30 bg-rose-700/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border-2 border-rose-300 flex items-center justify-between animate-in slide-in-from-top-3 duration-200">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-white text-rose-800 flex items-center justify-center shrink-0 shadow-md">
                              <AlertCircle className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-200 block">
                                Aviso de Lectura
                              </span>
                              <p className="text-xs font-bold text-white truncate">
                                {scanWarningToast}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setScanWarningToast(null)}
                            className="text-white/80 hover:text-white p-1 rounded-lg ml-2 shrink-0 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {sequentialToast && (
                        <div className="absolute top-3 inset-x-3 z-20 bg-emerald-700/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border-2 border-emerald-300 flex items-center justify-between animate-in slide-in-from-top-3 duration-200">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-white text-emerald-800 flex items-center justify-center shrink-0 shadow-md">
                              <Check className="w-5 h-5 stroke-[3.5]" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-200 block">
                                {sequentialToast.mensaje || 'Alumno registrado. Siguiente...'}
                              </span>
                              <h4 className="text-sm font-extrabold text-white truncate">
                                {sequentialToast.studentName}
                              </h4>
                              <span className="text-[11px] font-mono text-emerald-100">
                                Matrícula: {sequentialToast.matricula} · {sequentialToast.hora}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                        <div className="w-60 h-60 sm:w-64 sm:h-64 border-2 border-amber-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                        </div>
                      </div>

                      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleFacingMode}
                          className="px-3 py-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white text-xs font-semibold rounded-lg border border-white/20 shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{facingMode === 'environment' ? 'Trasera' : 'Frontal'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1.5 bg-rose-900/80 hover:bg-rose-800 backdrop-blur-md text-white text-xs font-semibold rounded-lg border border-rose-500/40 shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CameraOff className="w-3.5 h-3.5" />
                          <span>Detener</span>
                        </button>
                      </div>
                    </>
                  )}

                  {!cameraActive && !showSuccessScreen && (
                    <div className="absolute inset-0 z-10 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-300">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                        <Camera className="w-6 h-6 text-amber-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        Cámara Web Lista para Conectar
                      </h4>
                      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed max-w-xs">
                        {cameraError ? (
                          <span className="text-amber-300 font-medium">{cameraError}</span>
                        ) : (
                          'Presione "Conectar Cámara Web" para activar la cámara en vivo y escanear credenciales.'
                        )}
                      </p>
                      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full justify-center">
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-white" />
                          <span>Conectar Cámara Web</span>
                        </button>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isDecodingFile}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          {isDecodingFile ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                              <span>Analizando imagen...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 text-blue-400" />
                              <span>Subir foto de QR</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      scanModeRef.current = 'continuous';
                      setScanMode('continuous');
                    }}
                    aria-pressed={scanMode === 'continuous'}
                    className={`px-4 py-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                      scanMode === 'continuous'
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Modo Continuo (Múltiples alumnos)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      scanModeRef.current = 'single';
                      setScanMode('single');
                    }}
                    aria-pressed={scanMode === 'single'}
                    className={`px-4 py-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                      scanMode === 'single'
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Modo Individual (1 alumno)
                  </button>
                </div>

                {fileError && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}

                {/* Input Manual */}
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="Escribir o pegar matrícula (10 dígitos, ej. 2243330309)"
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono uppercase font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Registrar</span>
                  </button>
                </form>
                {manualError && (
                  <p className="text-xs text-rose-600">{manualError}</p>
                )}
              </div>

              {/* Columna Derecha: Alumnos Presentes */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex-1 flex flex-col min-h-[320px]">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Alumnos en Aula Hoy ({sessionLogs.length})
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Modo Entrada Activo
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1">
                    {sessionLogs.length === 0 ? (
                      <div className="h-56 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                        <UserCheck className="w-8 h-8 mb-1.5 text-slate-300" />
                        <p className="text-xs font-medium">Ningún alumno registrado todavía</p>
                      </div>
                    ) : (
                      sessionLogs.map((log) => (
                        <div key={log.id} className="p-2.5 hover:bg-slate-50 flex items-center justify-between text-xs transition-colors">
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-slate-900 block truncate">
                              {log.nombreAlumno}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              <span>{log.matricula}</span>
                              <span>·</span>
                              <span>{log.hora}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            Presente
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 mt-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-[11px]">
                  Sistema Oficial UAT · Los registros se sincronizan en vivo.
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenSummary}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Finalizar y Guardar Asistencias</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
