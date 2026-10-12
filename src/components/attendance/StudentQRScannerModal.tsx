import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { User } from '../../types';
import { attendanceStore } from '../../services/attendanceStore';
import { supabase, validateAndRecordAttendanceInSupabase, SupabaseAsistencia } from '../../services/supabaseClient';
import { decodeQrFromImageFile } from '../../utils/qrDecoder';
import { 
  Camera, CameraOff, X, CheckCircle2, AlertCircle, 
  RefreshCw, ShieldCheck, Upload, Check, Loader2 
} from 'lucide-react';

interface StudentQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onAttendanceSuccess?: () => void;
}

export const StudentQRScannerModal: React.FC<StudentQRScannerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAttendanceSuccess,
}) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isDecodingFile, setIsDecodingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string>('');

  // Pantalla verde de confirmación con check de éxito
  const [showSuccessScreen, setShowSuccessScreen] = useState<boolean>(false);
  const [successData, setSuccessData] = useState<{
    materia: string;
    codigo: string;
    grupo: string;
    hora: string;
    estatus: string;
  } | null>(null);

  // Buffer de enfriamiento para escaneo continuo
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Error o aviso
  const [feedbackError, setFeedbackError] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      // ESCUCHA EN TIEMPO REAL (REALTIME): Suscripción a cambios de tabla asistencias en Supabase
      const channel = supabase
        .channel(`asistencias-student-scanner-${currentUser.identificadorInstitucional}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencias' },
          (payload) => {
            const newAtt = payload.new as SupabaseAsistencia;
            if (
              newAtt &&
              newAtt.alumno_matricula &&
              newAtt.alumno_matricula.toLowerCase() === currentUser.identificadorInstitucional.toLowerCase()
            ) {
              playBeep();
              const session = attendanceStore.getActiveSession();
              setSuccessData({
                materia: session?.nombreMateria || 'Materia Oficial UAT',
                codigo: session?.codigoMateria || 'TLM-501',
                grupo: session?.grupo || '5A',
                hora: new Date(newAtt.registrado_en || Date.now()).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
                estatus: 'Presente',
              });
              setShowSuccessScreen(true);
              if (onAttendanceSuccess) {
                onAttendanceSuccess();
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        stopCamera();
      };
    } else {
      stopCamera();
      setShowSuccessScreen(false);
      setFeedbackError('');
    }
  }, [isOpen, currentUser.identificadorInstitucional]);

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error al detener cámara de alumno:', err);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  };

  const playBeep = () => {
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
    } catch {
      // AudioContext restricted
    }
  };

  const startCamera = async (overrideFacing?: 'environment' | 'user') => {
    setCameraError('');
    setFileError('');
    setFeedbackError('');
    const targetFacing = overrideFacing || facingMode;

    try {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch {
          // cleanup
        }
        html5QrCodeRef.current = null;
      }

      const html5QrCode = new Html5Qrcode("student-reader-container");
      html5QrCodeRef.current = html5QrCode;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdgePercentage = 0.75;
        const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
        return {
          width: qrboxSize,
          height: qrboxSize,
        };
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
          (decodedText) => {
            handleSuccessScan(decodedText);
          },
          (_errorMessage) => {
            // frame error
          }
        );
      } catch (advancedConstraintErr) {
        console.warn("Reintentando cámara con config básica:", advancedConstraintErr);
        await html5QrCode.start(
          { facingMode: targetFacing },
          {
            fps: 20,
            qrbox: qrboxFunction,
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            handleSuccessScan(decodedText);
          },
          (_errorMessage) => {
            // frame error
          }
        );
      }
      setCameraActive(true);
    } catch (err: unknown) {
      console.warn("Fallo al iniciar cámara:", err);
      setCameraActive(false);
      const cleanAlertMsg = "No se pudo acceder a la cámara trasera";
      setCameraError(cleanAlertMsg);
      setFeedbackError(cleanAlertMsg + ". Puede subir una foto del código QR o ingresar el PIN manual.");
    }
  };

  const handleSuccessScan = (decodedText: string) => {
    console.log("QR Detectado:", decodedText);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch {
        // Vibración no soportada
      }
    }
    handleScannedClassQR(decodedText);
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

  const handleScannedClassQR = (raw: string, isFromUpload = false) => {
    const now = Date.now();
    if (!isFromUpload && lastScannedCodeRef.current.code === raw && now - lastScannedCodeRef.current.time < 2000) {
      return;
    }
    lastScannedCodeRef.current = { code: raw, time: now };
    const rawClean = raw.trim();
    let tokenDecodificado = rawClean;

    if (rawClean.startsWith('UAT-DYN-') || rawClean.includes('UAT-DYN-')) {
      const match = rawClean.match(/UAT-DYN-[A-Z0-9]+-[A-Z0-9]+/i);
      tokenDecodificado = match ? match[0].trim() : rawClean;
    } else if (rawClean.includes('{') && rawClean.includes('}')) {
      try {
        const jsonStart = rawClean.indexOf('{');
        const jsonEnd = rawClean.lastIndexOf('}');
        const jsonSubstring = rawClean.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonSubstring);
        if (parsed.token) tokenDecodificado = String(parsed.token).trim();
        else if (parsed.tokenActual) tokenDecodificado = String(parsed.tokenActual).trim();
        else if (parsed.pin) tokenDecodificado = String(parsed.pin).trim();
        else if (parsed.pinActual) tokenDecodificado = String(parsed.pinActual).trim();
        else if (parsed.matricula) tokenDecodificado = String(parsed.matricula).trim();
      } catch {
        tokenDecodificado = rawClean;
      }
    } else {
      tokenDecodificado = rawClean;
    }

    validateAndRecord(tokenDecodificado);
  };

  const validateAndRecord = async (tokenOrPin: string) => {
    setFeedbackError('');
    const token = tokenOrPin.trim();

    try {
      const sbResult = await validateAndRecordAttendanceInSupabase({
        tokenOrPin: token,
        studentMatricula: currentUser.identificadorInstitucional,
        studentNombre: `${currentUser.nombre} ${currentUser.apellidos}`,
      });
      if (!sbResult.success && !sbResult.isDuplicate) {
        setFeedbackError(sbResult.message);
        return;
      }
    } catch (sbErr) {
      console.warn('Advertencia en validación con Supabase:', sbErr);
    }

    const res = attendanceStore.recordStudentSelfAttendance({
      student: currentUser,
      tokenOrPin: token,
      forceFresh: false,
    });

    if (res.success && res.record) {
      playBeep();
      setSuccessData({
        materia: res.record.nombreMateria,
        codigo: res.record.codigoMateria,
        grupo: res.record.grupo,
        hora: res.record.hora,
        estatus: 'Presente',
      });
      setShowSuccessScreen(true);
      if (onAttendanceSuccess) {
        onAttendanceSuccess();
      }
    } else {
      setFeedbackError(res.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    setFeedbackError('');
    setIsDecodingFile(true);
    try {
      const decodedData = await decodeQrFromImageFile(file);
      if (!decodedData) {
        setFileError('No se detectó un código QR legible en la foto. Verifique que el código QR esté encuadrado y nítido.');
        setIsDecodingFile(false);
        return;
      }
      handleScannedClassQR(decodedData, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la imagen.';
      setFileError(msg);
    } finally {
      setIsDecodingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    validateAndRecord(pinInput.trim());
    setPinInput('');
  };

  if (!isOpen) return null;
  const activeSession = attendanceStore.getActiveSession();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        
        {/* Header Modal */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded">
                  Lector de Aula UAT
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Matrícula: {currentUser.identificadorInstitucional}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-0.5 leading-snug">
                Escanear Código QR de Clase
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          <div className="relative rounded-2xl bg-black overflow-hidden aspect-4/3 flex items-center justify-center shadow-inner border-2 border-slate-800">
            {showSuccessScreen && successData ? (
              <div className="absolute inset-0 z-20 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-6 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300 shadow-2xl">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 border-4 border-white flex items-center justify-center text-white mb-3 shadow-[0_0_35px_rgba(255,255,255,0.4)] animate-bounce">
                  <Check className="w-12 h-12 sm:w-14 sm:h-14 stroke-[3.5]" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest bg-emerald-950/40 text-emerald-100 px-3 py-1 rounded-full border border-emerald-400/40 mb-2">
                  Pase de Lista Exitoso
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  ¡ASISTENCIA REGISTRADA CON ÉXITO!
                </h3>
                <div className="mt-3 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 w-full max-w-sm space-y-1">
                  <p className="text-base font-extrabold text-white truncate">
                    {successData.materia}
                  </p>
                  <div className="flex items-center justify-center gap-2 font-mono text-xs text-emerald-100">
                    <span>Código: <strong>{successData.codigo}</strong></span>
                    <span>·</span>
                    <span>Grupo: {successData.grupo}</span>
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    Hora de registro: {successData.hora} · Alumno: {currentUser.nombre}
                  </p>
                </div>
                <div className="mt-5 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSuccessScreen(false);
                      onClose();
                    }}
                    className="px-6 py-2.5 bg-white text-emerald-950 font-extrabold text-xs rounded-xl shadow-lg hover:bg-emerald-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Aceptar y Ver Historial</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div 
              id="student-reader-container"
              className="w-full h-64 bg-black rounded-lg overflow-hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />

            {cameraActive && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-60 h-60 border-2 border-amber-400 rounded-2xl relative shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent absolute top-0 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                         style={{ animation: 'bounce 2.2s infinite ease-in-out' }}
                    />
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
                    title="Detener cámara"
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
                  Lector de Código QR
                </h4>
                <p className="text-[11px] text-slate-400 mb-4 leading-relaxed max-w-xs">
                  {cameraError ? (
                    <span className="text-amber-300 font-medium">{cameraError}</span>
                  ) : (
                    'Presione "Conectar Cámara Web" para activar la cámara en vivo o suba una foto del código QR.'
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
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDecodingFile}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {isDecodingFile ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Analizando imagen...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-blue-400" />
                        <span>Subir foto del QR</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Opciones Alternativas:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDecodingFile}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>Subir foto del QR</span>
              </button>
            </div>
          </div>

          {fileError && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {feedbackError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{feedbackError}</span>
            </div>
          )}

          {/* PIN MANUAL SIEMPRE VISIBLE */}
          <div className="bg-gradient-to-r from-amber-50/80 to-slate-50 border-2 border-amber-300/80 rounded-2xl p-4 shadow-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  Ingresar PIN manual de la clase
                </span>
              </div>
              {activeSession && activeSession.activa && (
                <span className="text-[11px] font-mono text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-md font-extrabold border border-amber-300">
                  PIN sesión: {activeSession.pinActual}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Alternativa directa: Si la cámara o la iluminación fallan, introduzca el PIN de 6 caracteres o token aquí:
            </p>
            <form onSubmit={handleManualPin} className="flex gap-2">
              <input
                type="text"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Ej. TLM509 o token"
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-mono uppercase font-bold border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Validar PIN</span>
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px]">Control Escolar UAT · Validación segura y sellada</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
