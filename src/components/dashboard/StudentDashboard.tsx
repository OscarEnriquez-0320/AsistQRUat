import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { User, StudentCourse } from '../../types';
import { authStore } from '../../services/authStore';
import { attendanceStore, DynamicSession, AttendanceRecord } from '../../services/attendanceStore';
import { UATLogo } from '../common/UATLogo';
import { JOptionPaneModal } from '../common/JOptionPaneModal';
import { StudentQRScannerModal } from '../attendance/StudentQRScannerModal';
import { supabase, validateAndRecordAttendanceInSupabase, SupabaseAsistencia } from '../../services/supabaseClient';
import { decodeQrFromImageFile } from '../../utils/qrDecoder';
import { validatePassword, checkPasswordCriteria } from '../../utils/validators';
import { 
  BookOpen, Calendar, Award, CheckCircle2, Clock, 
  Key, Shield, AlertCircle, QrCode, Check, 
  Camera, Upload, Loader2, LogOut, Maximize2, Hash, Copy, Pencil, User as UserIcon 
} from 'lucide-react';

interface StudentDashboardProps {
  user: User;
  activeTab: string;
  onUserUpdate: (updated: User) => void;
  onLogout?: () => void;
}

const INITIAL_COURSES: StudentCourse[] = [
  {
    id: 'c-01',
    codigo: 'TLM-501',
    nombre: 'Redes Digitales y Telemática Avanzada',
    profesor: 'Dr. Carlos Eduardo Ramírez Peña',
    aula: 'FIC - Lab de Telecomunicaciones 2',
    horario: 'Lun, Mié 07:00 - 09:00',
    calificacionParcial1: 9.6,
    calificacionParcial2: 9.2,
    calificacionFinal: 9.4,
    asistenciaPct: 98,
  },
  {
    id: 'c-02',
    codigo: 'TLM-502',
    nombre: 'Arquitectura de Sistemas Distribuidos',
    profesor: 'Dra. Elena Vázquez Márquez',
    aula: 'FIC - Edificio Central Aula 102',
    horario: 'Mar, Jue 09:00 - 11:00',
    calificacionParcial1: 9.0,
    calificacionParcial2: 9.4,
    calificacionFinal: 9.2,
    asistenciaPct: 94,
  },
  {
    id: 'c-03',
    codigo: 'TLM-503',
    nombre: 'Seguridad en Redes y Criptografía Aplicada',
    profesor: 'Mtro. Roberto Hernández Silva',
    aula: 'FIC - Laboratorio de Ciberseguridad',
    horario: 'Vie 08:00 - 12:00',
    calificacionParcial1: 10.0,
    calificacionParcial2: 9.8,
    calificacionFinal: 9.9,
    asistenciaPct: 100,
  },
  {
    id: 'c-04',
    codigo: 'TLM-504',
    nombre: 'Programación Web y Servicios Cloud',
    profesor: 'Mtra. Sandra Ochoa Ruiz',
    aula: 'FIC - Laboratorio de Cómputo 3',
    horario: 'Lun, Mié 11:00 - 13:00',
    calificacionParcial1: 9.2,
    calificacionParcial2: 9.5,
    calificacionFinal: 9.3,
    asistenciaPct: 96,
  },
];

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  activeTab,
  onUserUpdate,
  onLogout,
}) => {
  const [courses] = useState<StudentCourse[]>(INITIAL_COURSES);
  const [studentQrDataUrl, setStudentQrDataUrl] = useState<string>('');
  const [activeSession, setActiveSession] = useState<DynamicSession | null>(null);

  const [qrPinInput, setQrPinInput] = useState('');
  const [qrScanSuccess, setQrScanSuccess] = useState('');
  const [qrScanError, setQrScanError] = useState('');
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [isStudentScannerOpen, setIsStudentScannerOpen] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isQrModalMaximized, setIsQrModalMaximized] = useState(false);
  const [copiedMatricula, setCopiedMatricula] = useState(false);
  const studentFileInputRef = useRef<HTMLInputElement | null>(null);
  const credentialPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUpdateToast, setPhotoUpdateToast] = useState<string | null>(null);

  const refreshAttendanceState = () => {
    const list = attendanceStore.getRecordsForStudent(user.identificadorInstitucional);
    setAttendanceHistory(list);
    setActiveSession(attendanceStore.getActiveSession());
  };

  const handleCredentialPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Por favor seleccione un archivo de imagen válido (JPG, PNG o WEBP).');
      return;
    }
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const res = authStore.updateUser(user.id, { avatarUrl: base64Data });
      if (res.success && res.user) {
        onUserUpdate(res.user);
      } else {
        onUserUpdate({ ...user, avatarUrl: base64Data });
      }
      setIsUploadingPhoto(false);
      setPhotoUpdateToast('¡Foto de credencial actualizada exitosamente!');
      setTimeout(() => setPhotoUpdateToast(null), 4000);
    };
    reader.onerror = () => {
      setIsUploadingPhoto(false);
      alert('Error al leer el archivo de imagen.');
    };
    reader.readAsDataURL(file);
    if (credentialPhotoInputRef.current) {
      credentialPhotoInputRef.current.value = '';
    }
  };

  const handlePhotoUploadStudent = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrScanError('');
    setQrScanSuccess('');
    setIsProcessingPhoto(true);
    try {
      const decoded = await decodeQrFromImageFile(file);
      if (!decoded) {
        setQrScanError('No se detectó un código QR legible en la imagen subida.');
        setIsProcessingPhoto(false);
        return;
      }
      let tokenOrPin = decoded;
      if (decoded.startsWith('{') && decoded.endsWith('}')) {
        try {
          const parsed = JSON.parse(decoded);
          if (parsed.token) tokenOrPin = parsed.token;
          else if (parsed.pin) tokenOrPin = parsed.pin;
        } catch {}
      }
      const res = attendanceStore.recordStudentSelfAttendance({
        student: user,
        tokenOrPin,
        forceFresh: true,
      });
      if (res.success) {
        setQrScanSuccess(`¡Código QR decodificado exitosamente! Asistencia registrada.`);
        refreshAttendanceState();
        setTimeout(() => setQrScanSuccess(''), 6000);
      } else {
        setQrScanError(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la imagen.';
      setQrScanError(msg);
    } finally {
      setIsProcessingPhoto(false);
      if (studentFileInputRef.current) {
        studentFileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    refreshAttendanceState();
    const payload = JSON.stringify({
      tipo: 'alumno_uat',
      matricula: user.identificadorInstitucional,
      nombre: `${user.nombre} ${user.apellidos}`,
      carrera: user.carreraODepartamento,
      valido: '2026-2',
    });
    QRCode.toDataURL(payload, {
      width: 400,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setStudentQrDataUrl).catch(console.error);

    const unsubscribe = attendanceStore.subscribe(refreshAttendanceState);

    const channel = supabase
      .channel(`asistencias-student-dashboard-${user.identificadorInstitucional}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'asistencias' },
        (payload) => {
          const newAtt = payload.new as SupabaseAsistencia;
          if (
            newAtt &&
            newAtt.alumno_matricula &&
            newAtt.alumno_matricula.toLowerCase() === user.identificadorInstitucional.toLowerCase()
          ) {
            refreshAttendanceState();
            setQrScanSuccess('¡Tu asistencia ha sido confirmada en tiempo real por el sistema institucional UAT!');
            setTimeout(() => setQrScanSuccess(''), 5000);
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user.identificadorInstitucional]);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const [isJOptionPaneOpen, setIsJOptionPaneOpen] = useState(false);
  const [jOptionDetails, setJOptionDetails] = useState<string[]>([]);
  const [jOptionMsg, setJOptionMsg] = useState('');

  const newPassCriteria = checkPasswordCriteria(newPass);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (currentPass !== user.passwordHash) {
      const msg = 'La contraseña actual ingresada es incorrecta.';
      setPassError(msg);
      setJOptionMsg(msg);
      setJOptionDetails(['Verifique su contraseña actual para continuar.']);
      setIsJOptionPaneOpen(true);
      return;
    }

    const validation = validatePassword(newPass);
    if (!validation.isValid) {
      setPassError(validation.error || 'Contraseña insegura.');
      setJOptionMsg(validation.error || 'La contraseña no cumple las políticas UAT.');
      setJOptionDetails(validation.details || []);
      setIsJOptionPaneOpen(true);
      return;
    }

    if (newPass !== confirmPass) {
      const msg = 'La confirmación de la contraseña no coincide.';
      setPassError(msg);
      setJOptionMsg(msg);
      setJOptionDetails(['Asegúrese de escribir la misma contraseña en ambos campos.']);
      setIsJOptionPaneOpen(true);
      return;
    }

    // UPDATE directo a Supabase
    await supabase.from('usuarios').update({ password: newPass }).eq('matricula', user.identificadorInstitucional);

    const res = authStore.updateUser(user.id, { passwordHash: newPass });
    if (res.success && res.user) {
      onUserUpdate(res.user);
      setPassSuccess('Su contraseña institucional UAT ha sido actualizada correctamente en Supabase.');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } else {
      setPassError(res.message);
    }
  };

  const handleRegisterQrAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrScanError('');
    setQrScanSuccess('');
    const cleanInput = qrPinInput.trim().toUpperCase();
    if (!cleanInput) {
      setQrScanError('Por favor ingrese el código PIN de 6 caracteres dictado por el docente.');
      return;
    }

    try {
      const sbResult = await validateAndRecordAttendanceInSupabase({
        tokenOrPin: cleanInput,
        studentMatricula: user.identificadorInstitucional,
        studentNombre: `${user.nombre} ${user.apellidos}`,
      });
      if (!sbResult.success && !sbResult.isDuplicate) {
        setQrScanError(sbResult.message);
        return;
      }
    } catch (sbErr) {
      console.warn('Advertencia en validación con Supabase:', sbErr);
    }

    const res = attendanceStore.recordStudentSelfAttendance({
      student: user,
      tokenOrPin: cleanInput,
    });

    if (res.success) {
      setQrScanSuccess(res.message);
      setQrPinInput('');
      refreshAttendanceState();
      setTimeout(() => setQrScanSuccess(''), 5000);
    } else {
      setQrScanError(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <JOptionPaneModal
        isOpen={isJOptionPaneOpen}
        onClose={() => setIsJOptionPaneOpen(false)}
        title="Validación de Seguridad - UAT"
        message={jOptionMsg}
        details={jOptionDetails}
        type="WARNING_MESSAGE"
      />

      <StudentQRScannerModal
        isOpen={isStudentScannerOpen}
        onClose={() => setIsStudentScannerOpen(false)}
        currentUser={user}
        onAttendanceSuccess={refreshAttendanceState}
      />

      <input
        ref={credentialPhotoInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        onChange={handleCredentialPhotoUpload}
        className="hidden"
      />

      {isQrModalMaximized && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border-2 border-slate-900 flex flex-col items-center relative">
            <button
              type="button"
              onClick={() => setIsQrModalMaximized(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Cerrar vista completa"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <UATLogo size="sm" />
              <div className="text-left">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">Universidad Autónoma de Tamaulipas</span>
                <span className="text-xs font-bold text-slate-900">Credencial Digital de Alumno</span>
              </div>
            </div>
            <div className="w-64 h-64 bg-white rounded-2xl border-4 border-slate-900 p-3 my-3 shadow-xl flex items-center justify-center">
              {studentQrDataUrl ? (
                <img
                  src={studentQrDataUrl}
                  alt={`QR ${user.identificadorInstitucional}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <QrCode className="w-40 h-40 text-slate-900" />
              )}
            </div>

            <div className="w-full flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-left">
              <div className="relative group w-14 h-16 rounded-xl bg-slate-800 border border-slate-300 overflow-hidden shrink-0 shadow-inner flex items-center justify-center">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.nombre}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-6 h-6 text-slate-400" />
                )}
                <button
                  type="button"
                  onClick={() => credentialPhotoInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-amber-300 cursor-pointer"
                  title="Cambiar foto de credencial"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <span className="font-mono text-sm font-black text-slate-950 tracking-wider block">
                  {user.identificadorInstitucional}
                </span>
                <p className="font-extrabold text-xs text-slate-900 truncate">
                  {user.nombre} {user.apellidos}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {user.carreraODepartamento}
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 w-full flex items-center justify-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 py-1.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Optimizado para escaneo en aula</span>
            </div>
            <button
              type="button"
              onClick={() => setIsQrModalMaximized(false)}
              className="mt-4 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cerrar Pantalla Completa
            </button>
          </div>
        </div>
      )}

      <input
        ref={studentFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoUploadStudent}
        className="hidden"
      />

      {/* Welcome Banner Institucional UAT */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
            <UATLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Alumno Regular UAT
              </span>
              <span>·</span>
              <span>Matrícula: <strong className="font-mono text-slate-900">{user.identificadorInstitucional}</strong></span>
              <span>·</span>
              <span>{user.semestreOGrado || '5to Semestre'}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {user.nombre} {user.apellidos}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              {user.carreraODepartamento} · Facultad de Ingeniería Tampico (UAT)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right border-l md:border-l border-slate-200 pl-4">
            <span className="text-xs text-slate-500 block">Promedio General</span>
            <span className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">9.45</span>
          </div>
          <div className="text-right border-l border-slate-200 pl-4">
            <span className="text-xs text-slate-500 block">Asistencia UAT</span>
            <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">97.0%</span>
          </div>
          {onLogout && (
            <div className="border-l border-slate-200 pl-4 flex items-center">
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                title="Cerrar sesión institucional UAT"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: RESUMEN ACADÉMICO */}
      {(activeTab === 'resumen' || activeTab === 'inicio') && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold">Materias Cursadas</span>
                <BookOpen className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {courses.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Facultad de Ingeniería y Ciencias (FIC)</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold">Asistencia por QR</span>
                <QrCode className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
                97.0%
              </div>
              <p className="text-[11px] text-emerald-600 mt-1">Cumplimiento mínimo del 80% superado</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold">Estatus de Beca</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-base font-bold text-slate-900">
                Excelencia UAT
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Periodo Escolar 2026-2</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold">Próxima Clase</span>
                <Calendar className="w-4 h-4 text-slate-600" />
              </div>
              <div className="text-base font-bold text-slate-900">
                TLM-501 · 07:00 AM
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Pase de lista obligatorio por QR</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Carga Académica Semestral UAT</h3>
                <p className="text-xs text-slate-500">Unidades de aprendizaje y registro de asistencia escolar</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Código</th>
                    <th className="px-6 py-3">Unidad de Aprendizaje</th>
                    <th className="px-6 py-3">Docente Titular</th>
                    <th className="px-6 py-3">Horario / Aula</th>
                    <th className="px-6 py-3 text-right">Asistencia</th>
                    <th className="px-6 py-3 text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {courses.map((course) => (
                    <tr key={course.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                        {course.codigo}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        {course.nombre}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">
                        {course.profesor}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        <div>{course.horario}</div>
                        <div className="text-[11px] text-slate-400">{course.aula}</div>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-right tabular-nums text-emerald-700 font-bold">
                        {course.asistenciaPct}%
                      </td>
                      <td className="px-6 py-3.5 font-mono text-right tabular-nums font-extrabold text-slate-900">
                        {course.calificacionFinal?.toFixed(1) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASISTENCIA POR QR */}
      {activeTab === 'asistencia-qr' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <span className="text-[11px] font-bold uppercase text-amber-700 tracking-wider">
                  Módulo Oficial UAT · Control Escolar
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Credencial Digital y Asistencia por QR
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Muestre su código QR personal al docente para escaneo directo en aula, o ingrese el PIN de 6 caracteres.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQrModalMaximized(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Ampliar QR para facilitar lectura del profesor"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>Maximizar Credencial</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              <div className="lg:col-span-6 flex flex-col">
                <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border-2 border-slate-800 flex flex-col items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600" />
                  <div className="w-full flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-sm">
                        <UATLogo size="sm" />
                      </div>
                      <div className="text-left">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block leading-tight">
                          Universidad Autónoma de Tamaulipas
                        </span>
                        <span className="text-xs font-bold text-white">
                          Credencial Digital de Asistencia
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                      2026-2
                    </span>
                  </div>

                  <div className="w-full flex flex-col items-center justify-center my-2">
                    <div 
                      onClick={() => setIsQrModalMaximized(true)}
                      className="w-64 h-64 bg-white rounded-2xl border-4 border-amber-400 p-3 shadow-2xl flex flex-col items-center justify-center relative cursor-pointer group hover:scale-102 transition-transform"
                      title="Haga clic para ver en pantalla completa"
                    >
                      {studentQrDataUrl ? (
                        <img
                          src={studentQrDataUrl}
                          alt={`QR Alumno ${user.identificadorInstitucional}`}
                          className="w-52 h-52 object-contain"
                        />
                      ) : (
                        <div className="w-52 h-52 flex items-center justify-center">
                          <QrCode className="w-36 h-36 text-slate-900" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-2xs">
                        <Maximize2 className="w-4 h-4 text-amber-400" />
                        <span>Clic para Maximizar</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="font-mono text-base font-black text-amber-300 tracking-wider">
                        MATRÍCULA: {user.identificadorInstitucional}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(user.identificadorInstitucional);
                          setCopiedMatricula(true);
                          setTimeout(() => setCopiedMatricula(false), 2000);
                        }}
                        className="p-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs transition-colors cursor-pointer"
                        title="Copiar matrícula"
                      >
                        {copiedMatricula ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mt-3 flex items-center gap-3">
                    <div className="relative group w-14 h-16 rounded-xl bg-slate-800 border border-white/20 overflow-hidden shrink-0 shadow-md flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.nombre}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <UserIcon className="w-6 h-6 text-slate-400" />
                      )}
                      <button
                        type="button"
                        onClick={() => credentialPhotoInputRef.current?.click()}
                        className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-amber-300 cursor-pointer"
                        title="Cambiar foto de credencial"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1 text-left space-y-0.5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-sm text-white truncate">
                          {user.nombre} {user.apellidos}
                        </h3>
                        <button
                          type="button"
                          onClick={() => credentialPhotoInputRef.current?.click()}
                          className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer shrink-0 ml-1"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Foto</span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 truncate">
                        {user.carreraODepartamento}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        ID: UAT-ALUMNO-{user.identificadorInstitucional}
                      </p>
                    </div>
                  </div>

                  <div className="w-full mt-4 py-2.5 px-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-center flex items-center justify-center gap-2 text-xs text-emerald-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Muestre este código al profesor para escaneo directo con su cámara</span>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: PIN de Clase Manual */}
              <div className="lg:col-span-6 flex flex-col space-y-5">
                <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-400/30 flex items-center justify-center text-amber-900 font-black">
                        <Hash className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">
                          Ingresar PIN de Clase (6 Caracteres)
                        </h3>
                        <span className="text-[11px] text-amber-800 font-semibold block">
                          Opción alternativa de respaldo
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                      Manual
                    </span>
                  </div>

                  <form onSubmit={handleRegisterQrAttendance} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={qrPinInput}
                        onChange={(e) => setQrPinInput(e.target.value.toUpperCase())}
                        placeholder="Ej. TLM492"
                        className="flex-1 px-4 py-3 text-base font-mono uppercase font-black tracking-widest text-center border-2 border-amber-300 bg-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-inner"
                      />
                      <button
                        type="submit"
                        className="px-5 py-3 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 rounded-2xl transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Check className="w-4 h-4 text-amber-400" />
                        <span>Validar PIN</span>
                      </button>
                    </div>
                  </form>

                  {qrScanSuccess && (
                    <div className="p-3.5 bg-emerald-100 border border-emerald-300 rounded-2xl text-xs text-emerald-900 flex items-center gap-2.5 animate-in fade-in shadow-2xs">
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700" />
                      <span className="font-bold">{qrScanSuccess}</span>
                    </div>
                  )}

                  {qrScanError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-800 flex items-center gap-2.5 animate-in fade-in shadow-2xs">
                      <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                      <span className="font-semibold">{qrScanError}</span>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Historial de Asistencias Registradas
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono font-semibold">
                      {attendanceHistory.length} pases hoy
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {attendanceHistory.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        Aún no tienes asistencias registradas hoy en el aula.
                      </div>
                    ) : (
                      attendanceHistory.map((rec) => (
                        <div key={rec.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{rec.nombreMateria}</span>
                              <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                                {rec.codigoMateria}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">
                              {rec.fecha} a las {rec.hora}
                            </span>
                          </div>
                          <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {rec.estatus}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-amber-600" />
                      Lector de Asistencia en Aula (Cámara o Foto de QR)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsStudentScannerOpen(true)}
                      className="p-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-600" />
                      <span>Conectar Cámara Web</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => studentFileInputRef.current?.click()}
                      disabled={isProcessingPhoto}
                      className="p-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      {isProcessingPhoto ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                          <span>Procesando...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Subir foto de QR</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MIS MATERIAS */}
      {activeTab === 'materias' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Detalle de Materias y Calificaciones</h2>
              <p className="text-xs text-slate-500">Historial correspondiente a su matrícula {user.identificadorInstitucional}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {courses.map((course) => (
              <div key={course.id} className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all bg-slate-50/40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      {course.codigo}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-2">{course.nombre}</h3>
                    <p className="text-xs text-slate-600 mt-1">Prof: {course.profesor}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Promedio</span>
                    <span className="text-xl font-bold font-mono text-emerald-700 tabular-nums">
                      {course.calificacionFinal?.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{course.horario}</span>
                  </div>
                  <div className="font-medium text-slate-700">
                    {course.aula}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CREDENCIAL DIGITAL */}
      {activeTab === 'credencial' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">Credencial Digital del Estudiante UAT</h2>
            <p className="text-xs text-slate-500">Documento de identificación académica oficial de la Universidad Autónoma de Tamaulipas</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 shadow-xl border border-slate-700">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white p-1 overflow-hidden shadow-inner flex items-center justify-center">
                  <UATLogo size="sm" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold tracking-wider uppercase text-amber-300">
                    Universidad Autónoma de Tamaulipas
                  </h3>
                  <p className="text-[10px] text-slate-300 font-mono">Credencial Estudiantil Digital</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                VIGENTE 2026-2
              </span>
            </div>

            {photoUpdateToast && (
              <div className="my-3 p-3 bg-emerald-500/20 border border-emerald-400/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold">{photoUpdateToast}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-5 my-5">
              <div className="relative group w-28 h-32 rounded-2xl bg-slate-800 border-2 border-amber-400/50 overflow-hidden shrink-0 shadow-xl flex items-center justify-center">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.nombre}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-800/90 p-2 text-center">
                    <UserIcon className="w-10 h-10 text-slate-500 mb-1" />
                    <span className="text-[10px] text-slate-400 font-medium">Sin Foto</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => credentialPhotoInputRef.current?.click()}
                  className="absolute bottom-1.5 right-1.5 p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10 flex items-center justify-center"
                  title="Seleccionar foto de credencial"
                >
                  <Camera className="w-4 h-4 stroke-[2.5]" />
                </button>
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xs flex items-center justify-center text-amber-400 z-20">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5 min-w-0 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">
                    Nombre del Estudiante
                  </span>
                  <button
                    type="button"
                    onClick={() => credentialPhotoInputRef.current?.click()}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Cambiar foto</span>
                  </button>
                </div>
                <p className="text-base sm:text-lg font-bold text-white truncate leading-tight">
                  {user.nombre} {user.apellidos}
                </p>
                <div className="pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Facultad y Carrera
                  </span>
                  <p className="text-xs text-amber-200 font-medium leading-tight">
                    {user.carreraODepartamento}
                  </p>
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-4 pt-1">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 block">Matrícula (10 dígitos)</span>
                    <span className="font-mono text-sm font-extrabold text-amber-400 tabular-nums">
                      {user.identificadorInstitucional}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 block">Semestre</span>
                    <span className="text-xs text-slate-200">
                      {user.semestreOGrado || '5to Semestre'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {studentQrDataUrl ? (
                  <div className="w-10 h-10 bg-white rounded-lg p-0.5 shadow-sm shrink-0 flex items-center justify-center">
                    <img src={studentQrDataUrl} alt="QR Escaneable" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <QrCode className="w-8 h-8 text-amber-400" />
                )}
                <div>
                  <span className="text-[10px] font-mono text-amber-300 font-bold block">
                    ID ASISTENCIA: {user.identificadorInstitucional}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">Escaneable por personal académico UAT</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 font-mono block">FOLIO: {user.id.toUpperCase()}</span>
                <span className="text-[9px] text-emerald-400 font-bold">ESTATUS: ALUMNO REGULAR</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SEGURIDAD */}
      {activeTab === 'seguridad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Key className="w-5 h-5 text-slate-700" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Cambiar Contraseña UAT</h3>
                <p className="text-xs text-slate-500">Se actualizará directamente en Supabase</p>
              </div>
            </div>

            {passError && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{passError}</span>
              </div>
            )}
            {passSuccess && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contraseña Actual
                </label>
                <input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nueva Contraseña Segura
                </label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-[11px] text-slate-600">
                <span className="font-bold text-slate-700 block">Requisitos de Contraseña:</span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <span className={newPassCriteria.hasMinLength ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    ✓ 8+ caracteres
                  </span>
                  <span className={newPassCriteria.hasUpperCase ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    ✓ Mayúscula (A-Z)
                  </span>
                  <span className={newPassCriteria.hasLowerCase ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    ✓ Minúscula (a-z)
                  </span>
                  <span className={newPassCriteria.hasNumber ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    ✓ Número (0-9)
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Actualizar Contraseña en Supabase
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Shield className="w-5 h-5 text-slate-700" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Identidad y Matrícula UAT</h3>
                <p className="text-xs text-slate-500">Datos registrados en el Padrón Escolar</p>
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">Matrícula Escolar:</span>
                <span className="font-mono font-bold text-slate-900">{user.identificadorInstitucional}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">Correo Institucional:</span>
                <span className="font-mono text-slate-900">{user.correo}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">Facultad / Escuela:</span>
                <span className="font-medium text-slate-900">{user.carreraODepartamento}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
