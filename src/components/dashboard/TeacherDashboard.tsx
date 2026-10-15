import React, { useState, useEffect } from 'react';
import { User, TeacherCourse } from '../../types';
import { authStore } from '../../services/authStore';
import { attendanceStore, AttendanceRecord } from '../../services/attendanceStore';
import { UATLogo } from '../common/UATLogo';
import { JOptionPaneModal } from '../common/JOptionPaneModal';
import { TeacherQRScannerModal } from '../attendance/TeacherQRScannerModal';
import { TeacherProjectorModal } from '../attendance/TeacherProjectorModal';
import { supabase, syncClassSessionToSupabase } from '../../services/supabaseClient';
import { validatePassword, checkPasswordCriteria } from '../../utils/validators';
import { 
  Clock, Key, Shield, AlertCircle, CheckCircle2, QrCode, Save, 
  Check, UserCheck, Camera, ShieldCheck, LogOut, Hash, Copy, Tv 
} from 'lucide-react';

interface TeacherDashboardProps {
  user: User;
  activeTab: string;
  onUserUpdate: (updated: User) => void;
  onLogout?: () => void;
}

const INITIAL_TEACHER_COURSES: TeacherCourse[] = [
  {
    id: 'tc-01',
    codigo: 'TLM-501',
    nombre: 'Redes Digitales y Telemática Avanzada',
    carrera: 'Facultad de Ingeniería y Ciencias (FIC)',
    semestre: '5to Semestre',
    grupo: '5TM1',
    aula: 'Lab Telecom 2 - Edificio C',
    horario: 'Lun, Mié 07:00 - 09:00',
    totalAlumnos: 8,
    alumnos: [
      { matricula: '2243330309', nombre: 'Valeria Sofía Mendoza Flores', calificacion: 9.4, asistencias: 26 },
      { matricula: '2243330412', nombre: 'Alejandro Morales Cruz', calificacion: 8.8, asistencias: 24 },
      { matricula: '2243330105', nombre: 'Brenda Paola García Torres', calificacion: 9.6, asistencias: 26 },
      { matricula: '2243330981', nombre: 'Diego Fernando Navarro Rivas', calificacion: 8.0, asistencias: 22 },
      { matricula: '2243330554', nombre: 'Mariana Castillo Lozano', calificacion: 9.9, asistencias: 26 },
      { matricula: '2243330621', nombre: 'Héctor Manuel Salazar Peña', calificacion: 8.7, asistencias: 25 },
      { matricula: '2243330744', nombre: 'Andrea Lucía Vega Domínguez', calificacion: 9.2, asistencias: 27 },
      { matricula: '2243330819', nombre: 'Carlos Alberto Reynoso Lara', calificacion: 8.4, asistencias: 23 },
    ],
  },
  {
    id: 'tc-02',
    codigo: 'TLM-304',
    nombre: 'Estructuras de Datos y Algoritmos Distribuidos',
    carrera: 'Facultad de Ingeniería y Ciencias (FIC)',
    semestre: '3er Semestre',
    grupo: '3TM2',
    aula: 'Aula 204 - Edificio B',
    horario: 'Mar, Jue 11:00 - 13:00',
    totalAlumnos: 6,
    alumnos: [
      { matricula: '2243330120', nombre: 'Rodrigo Albarrán Reyes', calificacion: 8.5, asistencias: 25 },
      { matricula: '2243330231', nombre: 'Karla Jimena Ortiz Santos', calificacion: 9.0, asistencias: 27 },
      { matricula: '2243330304', nombre: 'Esteban Méndez Velasco', calificacion: 8.2, asistencias: 23 },
      { matricula: '2243330455', nombre: 'Diana Patricia Coronado Luna', calificacion: 9.1, asistencias: 26 },
      { matricula: '2243330567', nombre: 'José Emilio Treviño Garza', calificacion: 8.6, asistencias: 24 },
      { matricula: '2243330689', nombre: 'Natalia Elizabeth Ruiz Pineda', calificacion: 9.5, asistencias: 28 },
    ],
  },
];

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  user,
  activeTab,
  onUserUpdate,
  onLogout,
}) => {
  const [courses, setCourses] = useState<TeacherCourse[]>(INITIAL_TEACHER_COURSES);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(INITIAL_TEACHER_COURSES[0].id);
  const [selectedSchedule, setSelectedSchedule] = useState<string>('07:00 AM - 09:00 AM');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [isProjectorModalOpen, setIsProjectorModalOpen] = useState<boolean>(false);
  const [copiedPin, setCopiedPin] = useState<boolean>(false);

  const [liveAttendanceRecords, setLiveAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const [isJOptionPaneOpen, setIsJOptionPaneOpen] = useState(false);
  const [jOptionDetails, setJOptionDetails] = useState<string[]>([]);
  const [jOptionMsg, setJOptionMsg] = useState('');

  const selectedCourse = courses.find(c => c.id === selectedCourseId) || courses[0];
  const newPassCriteria = checkPasswordCriteria(newPass);

  const refreshAttendance = () => {
    const list = attendanceStore.getRecordsForCourse(selectedCourse.id);
    setLiveAttendanceRecords(list);
  };

  useEffect(() => {
    refreshAttendance();
    const unsubscribe = attendanceStore.subscribe(refreshAttendance);

    const channel = supabase
      .channel(`asistencias-teacher-dashboard-${selectedCourse.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'asistencias' },
        (payload) => {
          console.log('Realtime asistencia recibida en TeacherDashboard:', payload);
          refreshAttendance();
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [selectedCourse.id]);

  const handleOpenProjector = async () => {
    const session = attendanceStore.startDynamicSession(
      {
        id: selectedCourse.id,
        codigo: selectedCourse.codigo,
        nombre: selectedCourse.nombre,
        grupo: selectedCourse.grupo,
        aula: selectedCourse.aula,
      },
      user
    );
    try {
      await syncClassSessionToSupabase({
        tokenActual: session.tokenActual,
        pinActual: session.pinActual,
        activa: true,
        sessionId: session.sessionId,
      });
    } catch (e) {
      console.warn('Error al sincronizar sesión activa con Supabase:', e);
    }
    setIsProjectorModalOpen(true);
  };

  const handleUpdateGrade = (courseId: string, matricula: string, newGrade: number) => {
    setCourses(prev => prev.map(course => {
      if (course.id !== courseId) return course;
      return {
        ...course,
        alumnos: course.alumnos.map(al => {
          if (al.matricula !== matricula) return al;
          return { ...al, calificacion: Math.min(10, Math.max(0, newGrade)) };
        }),
      };
    }));
  };

  const handleSaveGrades = () => {
    setSaveSuccessMsg('Acta oficial de calificaciones y asistencias guardada exitosamente en el sistema UAT.');
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (currentPass !== user.passwordHash) {
      const msg = 'La contraseña actual de docente es incorrecta.';
      setPassError(msg);
      setJOptionMsg(msg);
      setJOptionDetails(['Verifique su contraseña actual para continuar.']);
      setIsJOptionPaneOpen(true);
      return;
    }

    const validation = validatePassword(newPass);
    if (!validation.isValid) {
      setPassError(validation.error || 'Contraseña insegura.');
      setJOptionMsg(validation.error || 'La contraseña no cumple los requisitos institucionales UAT.');
      setJOptionDetails(validation.details || []);
      setIsJOptionPaneOpen(true);
      return;
    }

    if (newPass !== confirmPass) {
      const msg = 'La confirmación de la contraseña no coincide.';
      setPassError(msg);
      setJOptionMsg(msg);
      setJOptionDetails(['Asegúrese de escribir exactamente la misma contraseña en ambos campos.']);
      setIsJOptionPaneOpen(true);
      return;
    }

    // UPDATE directo en Supabase
    await supabase.from('usuarios').update({ password: newPass }).eq('matricula', user.identificadorInstitucional);

    const res = authStore.updateUser(user.id, { passwordHash: newPass });
    if (res.success && res.user) {
      onUserUpdate(res.user);
      setPassSuccess('Su contraseña de personal académico UAT ha sido actualizada correctamente en Supabase.');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } else {
      setPassError(res.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <TeacherQRScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        selectedCourse={selectedCourse}
        allCourses={courses}
        initialSchedule={selectedSchedule}
        onCourseChange={(courseId) => setSelectedCourseId(courseId)}
        onScheduleChange={(sched) => setSelectedSchedule(sched)}
      />

      <TeacherProjectorModal
        isOpen={isProjectorModalOpen}
        onClose={() => setIsProjectorModalOpen(false)}
        selectedCourse={selectedCourse}
        currentUser={user}
        scheduleBlock={selectedSchedule}
      />

      <JOptionPaneModal
        isOpen={isJOptionPaneOpen}
        onClose={() => setIsJOptionPaneOpen(false)}
        title="Validación de Seguridad Docente - UAT"
        message={jOptionMsg}
        details={jOptionDetails}
        type="WARNING_MESSAGE"
      />

      {/* Welcome Banner */}
      <div className="order-0 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 p-2 flex items-center justify-center shrink-0 shadow-2xs">
            <UATLogo size="sm" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Personal Académico UAT
              </span>
              <span>·</span>
              <span>NPO: <strong className="font-mono text-slate-900">{user.identificadorInstitucional}</strong></span>
              <span>·</span>
              <span>{user.semestreOGrado || 'Profesor de Tiempo Completo'}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {user.nombre} {user.apellidos}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              {user.carreraODepartamento} · Facultad de Ingeniería Tampico (UAT)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleOpenProjector}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-md transition-all hover:scale-101 active:scale-99 cursor-pointer"
          >
            <Tv className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>Proyectar Código QR de Clase</span>
          </button>
          <button
            type="button"
            onClick={() => setIsScannerModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition-all hover:scale-101 active:scale-99 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>Lector en Aula</span>
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 shadow-sm transition-all cursor-pointer"
              title="Cerrar sesión institucional UAT"
            >
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>Cerrar Sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: GRUPOS */}
      {(activeTab === 'grupos' || activeTab === 'inicio' || activeTab === 'calificaciones') && (
        <details open={activeTab !== 'inicio'} className="order-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">
            Mis Grupos y Evaluaciones
          </summary>
          <div className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map((course) => {
              const isSelected = course.id === selectedCourseId;
              return (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`text-left p-5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {course.codigo} · Grupo {course.grupo}
                    </span>
                    <span className={`tabular-nums font-semibold ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {course.totalAlumnos} alumnos inscritos
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base leading-snug">
                    {course.nombre}
                  </h3>
                  <div className={`mt-3 pt-2 text-xs flex items-center justify-between border-t ${
                    isSelected ? 'border-white/15 text-slate-300' : 'border-slate-100 text-slate-500'
                  }`}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{course.horario}</span>
                    </div>
                    <span>{course.aula}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Acta Escolar UAT: {selectedCourse.nombre}
                  </h3>
                  <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                    {selectedCourse.grupo}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registro de evaluaciones y pases de lista por Asistencia por QR
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveGrades}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-amber-400" />
                <span>Guardar Acta Oficial UAT</span>
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Matrícula UAT (10 dígitos)</th>
                    <th className="px-6 py-3">Nombre del Alumno</th>
                    <th className="px-6 py-3 text-center">Asistencias QR</th>
                    <th className="px-6 py-3 text-right">Calificación (0-10)</th>
                    <th className="px-6 py-3 text-center">Estatus Escolar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedCourse.alumnos.map((alumno) => (
                    <tr key={alumno.matricula} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                        {alumno.matricula}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        {alumno.nombre}
                      </td>
                      <td className="px-6 py-3.5 text-center font-mono tabular-nums text-xs text-slate-600">
                        {alumno.asistencias} / 26
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            value={alumno.calificacion}
                            onChange={(e) => handleUpdateGrade(selectedCourse.id, alumno.matricula, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-right font-mono text-xs font-bold border border-slate-300 rounded focus:ring-1 focus:ring-slate-900 focus:outline-none tabular-nums"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          alumno.calificacion >= 6 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {alumno.calificacion >= 6 ? 'Acreditado' : 'No Acreditado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </details>
      )}

      {/* TAB 2: ASISTENCIA QR */}
      {(activeTab === 'asistencia-qr' || activeTab === 'inicio') && (
        <div className="order-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <span className="text-[11px] font-bold uppercase text-amber-800 tracking-wider">
                  Módulo Docente UAT · Flujo Directo en Aula
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Lector Rápido de Asistencia en Aula ({selectedCourse.codigo} · {selectedCourse.grupo})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  El profesor escanea en secuencia las credenciales de los alumnos o proporciona el PIN de 6 caracteres.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenProjector}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md cursor-pointer hover:scale-101 active:scale-98"
                >
                  <Tv className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>Proyectar Código QR de Clase</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScannerModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-md cursor-pointer hover:scale-101"
                >
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>Abrir Lector con Cámara</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-2xl p-6 shadow-md border border-slate-800 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Configuración de Pase en Aula
                      </span>
                      <span className="text-xs font-mono text-slate-400">{selectedCourse.aula}</span>
                    </div>
                    <h3 className="text-base font-extrabold text-white mt-1">
                      Confirmar Clase y Horario
                    </h3>
                  </div>

                  <div className="space-y-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                        Materia y Grupo:
                      </label>
                      <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="w-full text-xs font-bold bg-slate-900 border border-slate-700 text-white rounded-lg p-2 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                      >
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} · {c.nombre} ({c.grupo})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                        Bloque de Horario:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          '07:00 AM - 09:00 AM',
                          '09:00 AM - 11:00 AM',
                          '11:00 AM - 01:00 PM',
                          '01:00 PM - 03:00 PM',
                          '03:00 PM - 05:00 PM',
                          '05:00 PM - 07:00 PM'
                        ].map((bloque) => (
                          <button
                            key={bloque}
                            type="button"
                            onClick={() => setSelectedSchedule(bloque)}
                            className={`px-2 py-1.5 text-[11px] font-mono font-bold rounded-lg border text-center transition-all cursor-pointer ${
                              selectedSchedule === bloque
                                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {bloque}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={handleOpenProjector}
                      className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-101 active:scale-99"
                    >
                      <Tv className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                      <span>Proyectar Código QR de Clase ({selectedSchedule})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScannerModalOpen(true)}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-amber-400" />
                      <span>Escanear Alumnos con Cámara del Docente</span>
                    </button>
                  </div>
                </div>

                {/* PIN de Respaldo */}
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-4 h-4 text-amber-700" />
                      PIN de Clase (6 Caracteres)
                    </span>
                    <span className="text-[10px] text-amber-700 bg-amber-100 font-bold px-2 py-0.5 rounded">
                      Clave de respaldo
                    </span>
                  </div>
                  <div className="bg-white border-2 border-amber-400 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Código PIN Oficial:</span>
                      <span className="font-mono text-2xl font-black text-slate-950 tracking-wider">
                        {attendanceStore.getActiveSession()?.pinActual || selectedCourse.codigo.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) + '492'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const pin = attendanceStore.getActiveSession()?.pinActual || selectedCourse.codigo.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) + '492';
                        navigator.clipboard?.writeText(pin);
                        setCopiedPin(true);
                        setTimeout(() => setCopiedPin(false), 2500);
                      }}
                      className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copiar PIN"
                    >
                      {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{copiedPin ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Alumnos Presentes */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Alumnos Registrados en Aula Hoy ({liveAttendanceRecords.length})
                    </h3>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Sincronización en Vivo
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Matrícula UAT</th>
                        <th className="px-4 py-2.5">Nombre del Alumno</th>
                        <th className="px-4 py-2.5">Hora</th>
                        <th className="px-4 py-2.5">Método</th>
                        <th className="px-4 py-2.5 text-center">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveAttendanceRecords.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            Ninguna asistencia registrada hoy en esta materia.
                          </td>
                        </tr>
                      ) : (
                        liveAttendanceRecords.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                              {log.matricula}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              {log.nombreAlumno}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">
                              {log.hora}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500">
                              {log.metodoRegistro === 'escaner_profesor'
                                ? 'Cámara Docente'
                                : log.metodoRegistro === 'proyeccion_dinamica'
                                ? 'Credencial Alumno'
                                : 'PIN Aula'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {log.estatus === 'presente' ? 'Presente' : 'Retardo'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CREDENCIAL DOCENTE */}
      {(activeTab === 'credencial' || activeTab === 'inicio' || activeTab === 'asistencia-qr') && (
        <div className="order-2 max-w-xl mx-auto w-full space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">Credencial Oficial de Personal Académico UAT</h2>
            <p className="text-xs text-slate-500">Acreditación institucional oficial de la Universidad Autónoma de Tamaulipas</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6 shadow-xl border border-slate-700">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white p-1 overflow-hidden shadow-inner flex items-center justify-center">
                  <UATLogo size="sm" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold tracking-wider uppercase text-amber-300">
                    Universidad Autónoma de Tamaulipas
                  </h3>
                  <p className="text-[10px] text-slate-300 font-mono">Credencial de Personal Académico</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                DOCENTE ACTIVO
              </span>
            </div>

            <div className="flex items-center gap-5 my-5">
              <div className="w-24 h-28 rounded-xl bg-slate-700/60 border border-white/20 overflow-hidden shrink-0 shadow-md">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.nombre}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    Foto
                  </div>
                )}
              </div>
              <div className="space-y-1.5 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">
                  Catedrático(a)
                </span>
                <p className="text-base font-bold text-white truncate leading-tight">
                  {user.nombre} {user.apellidos}
                </p>
                <div className="pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Adscripción Institucional
                  </span>
                  <p className="text-xs text-amber-200 font-medium line-clamp-1">
                    {user.carreraODepartamento}
                  </p>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 block">NPO</span>
                    <span className="font-mono text-sm font-extrabold text-amber-300 tabular-nums">
                      {user.identificadorInstitucional}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 block">Categoría</span>
                    <span className="text-xs text-slate-200">
                      Profesor Titular UAT
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-7 h-7 text-amber-400" />
                <span className="text-[9px] font-mono text-slate-400">FIRMA ELECTRÓNICA UAT-{user.id.toUpperCase()}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 font-mono block">NPO: {user.identificadorInstitucional}</span>
                <span className="text-[9px] text-emerald-400 font-bold">VIGENCIA: 2026 - 2028</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SEGURIDAD */}
      {activeTab === 'seguridad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Key className="w-5 h-5 text-slate-700" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Cambiar Contraseña Docente UAT</h3>
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
                <h3 className="font-bold text-slate-900 text-sm">Registro de Cátedra UAT</h3>
                <p className="text-xs text-slate-500">Información del nombramiento docente</p>
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">NPO Oficial:</span>
                <span className="font-mono font-bold text-slate-900">{user.identificadorInstitucional}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">Correo Docente:</span>
                <span className="font-mono text-slate-900">{user.correo}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="text-slate-500">Facultad:</span>
                <span className="font-medium text-slate-900">{user.carreraODepartamento}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
