import { authStore } from './authStore';
import { User } from '../types';
import { 
  supabase, 
  syncClassSessionToSupabase, 
  fetchActiveSessionFromSupabase, 
  ensureUserInSupabase,
  SupabaseAsistencia 
} from './supabaseClient';

export interface AttendanceRecord {
  id: string;
  matricula: string;
  nombreAlumno: string;
  carrera: string;
  courseId: string;
  codigoMateria: string;
  nombreMateria: string;
  grupo: string;
  fecha: string; // DD/MM/YYYY
  hora: string;  // HH:MM:SS AM/PM
  timestamp: number;
  estatus: 'presente' | 'retardo' | 'justificado';
  metodoRegistro: 'escaner_profesor' | 'proyeccion_dinamica' | 'pin_manual' | 'manual_docente';
  dispositivo?: string;
}

export interface DynamicSession {
  sessionId: string;
  courseId: string;
  codigoMateria: string;
  nombreMateria: string;
  grupo: string;
  aula: string;
  profesorNpo: string;
  profesorNombre: string;
  activa: boolean;
  iniciadaEn: number;
  intervaloRotacionSegundos: number; // Por defecto 20s
  tokenActual: string;
  pinActual: string;
  expiraEnTimestamp: number;
}

const ATTENDANCE_STORAGE_KEY = 'sigu_uat_attendance_records_v1';
const ACTIVE_SESSION_STORAGE_KEY = 'sigu_uat_active_qr_session_v1';

// Sonidos sintetizados mediante Web Audio API
export const playAudioFeedback = (type: 'success' | 'warning' | 'duplicate' | 'error') => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (type === 'success') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.28);
      osc2.stop(ctx.currentTime + 0.28);
    } else if (type === 'duplicate') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(392, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Ignorar si el navegador bloquea audio
  }
};

const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  {
    id: 'att-seed-01',
    matricula: '2243330309',
    nombreAlumno: 'Valeria Sofía Mendoza Flores',
    carrera: 'Ing. en Sistemas Computacionales',
    courseId: 'tc-01',
    codigoMateria: 'TLM-501',
    nombreMateria: 'Redes Digitales y Telemática Avanzada',
    grupo: '5TM1',
    fecha: new Date().toLocaleDateString('es-MX'),
    hora: '07:04:12 AM',
    timestamp: Date.now() - 3600000,
    estatus: 'presente',
    metodoRegistro: 'escaner_profesor',
  },
  {
    id: 'att-seed-02',
    matricula: '2243330554',
    nombreAlumno: 'Mariana Castillo Lozano',
    carrera: 'Ing. en Sistemas Computacionales',
    courseId: 'tc-01',
    codigoMateria: 'TLM-501',
    nombreMateria: 'Redes Digitales y Telemática Avanzada',
    grupo: '5TM1',
    fecha: new Date().toLocaleDateString('es-MX'),
    hora: '07:05:01 AM',
    timestamp: Date.now() - 3500000,
    estatus: 'presente',
    metodoRegistro: 'proyeccion_dinamica',
  },
  {
    id: 'att-seed-03',
    matricula: '2243330105',
    nombreAlumno: 'Brenda Paola García Torres',
    carrera: 'Ing. en Sistemas Computacionales',
    courseId: 'tc-01',
    codigoMateria: 'TLM-501',
    nombreMateria: 'Redes Digitales y Telemática Avanzada',
    grupo: '5TM1',
    fecha: new Date().toLocaleDateString('es-MX'),
    hora: '07:05:44 AM',
    timestamp: Date.now() - 3400000,
    estatus: 'presente',
    metodoRegistro: 'escaner_profesor',
  },
];

type AttendanceListener = () => void;

class AttendanceStore {
  private listeners: Set<AttendanceListener> = new Set();

  constructor() {
    this.init();
    this.initRealtime();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === ATTENDANCE_STORAGE_KEY || e.key === ACTIVE_SESSION_STORAGE_KEY) {
          this.notify();
        }
      });
    }
  }

  private init() {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(ATTENDANCE_STORAGE_KEY)) {
      localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(INITIAL_ATTENDANCE));
    }
  }

  private initRealtime() {
    if (typeof window === 'undefined') return;
    try {
      supabase
        .channel('asistencias-store-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencias' },
          (payload) => {
            const newRow = payload.new as SupabaseAsistencia;
            if (newRow && newRow.alumno_matricula) {
              const matricula = newRow.alumno_matricula.trim();
              const todayStr = new Date().toLocaleDateString('es-MX');
              const records = this.getAllRecords();
              const exists = records.some(
                (r) => r.matricula.toLowerCase() === matricula.toLowerCase() && r.fecha === todayStr
              );
              if (!exists) {
                const users = authStore.getUsers();
                const student = users.find(
                  (u) => u.identificadorInstitucional.toLowerCase() === matricula.toLowerCase()
                );
                const activeSession = this.getActiveSession();
                const newRec: AttendanceRecord = {
                  id: `att-sb-${newRow.id || Date.now()}`,
                  matricula: matricula,
                  nombreAlumno: student ? `${student.nombre} ${student.apellidos}` : `Alumno ${matricula}`,
                  carrera: student?.carreraODepartamento || 'Facultad de Ingeniería Tampico',
                  courseId: activeSession?.courseId || 'tc-01',
                  codigoMateria: activeSession?.codigoMateria || 'TLM-501',
                  nombreMateria: activeSession?.nombreMateria || 'Redes Digitales y Telemática Avanzada',
                  grupo: activeSession?.grupo || '5A',
                  fecha: todayStr,
                  hora: new Date(newRow.registrado_en || Date.now()).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  timestamp: newRow.registrado_en ? new Date(newRow.registrado_en).getTime() : Date.now(),
                  estatus: 'presente',
                  metodoRegistro: 'proyeccion_dinamica',
                };
                records.unshift(newRec);
                this.saveRecords(records);
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel warning:', err);
    }
  }

  public subscribe(listener: AttendanceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error en listener de asistencia:', err);
      }
    });
  }

  public getAllRecords(): AttendanceRecord[] {
    if (typeof localStorage === 'undefined') return INITIAL_ATTENDANCE;
    try {
      const data = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
      return data ? JSON.parse(data) : INITIAL_ATTENDANCE;
    } catch {
      return INITIAL_ATTENDANCE;
    }
  }

  private saveRecords(records: AttendanceRecord[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
    this.notify();
  }

  public getRecordsForCourse(courseId: string, fechaStr?: string): AttendanceRecord[] {
    const all = this.getAllRecords();
    const targetDate = fechaStr || new Date().toLocaleDateString('es-MX');
    return all.filter((r) => r.courseId === courseId && r.fecha === targetDate);
  }

  public getRecordsForStudent(matricula: string): AttendanceRecord[] {
    const all = this.getAllRecords();
    return all.filter((r) => r.matricula.toUpperCase() === matricula.trim().toUpperCase());
  }

  public clearRecordForStudentAndCourse(matricula: string, courseId: string): void {
    const todayStr = new Date().toLocaleDateString('es-MX');
    const records = this.getAllRecords().filter(
      (r) => !(r.courseId === courseId && r.fecha === todayStr && r.matricula.toLowerCase() === matricula.trim().toLowerCase())
    );
    this.saveRecords(records);
  }

  public ensureActiveSession(course?: { id: string; codigo: string; nombre: string; grupo: string; aula: string }): DynamicSession {
    const current = this.getActiveSession();
    if (current && current.activa) {
      return current;
    }
    const defaultCourse = course || {
      id: 'tc-01',
      codigo: 'TLM-501',
      nombre: 'Redes Digitales y Telemática Avanzada',
      grupo: '5TM1',
      aula: 'Lab Telecom 2 - Edificio C',
    };
    const mockTeacher: User = {
      id: 'usr-profesor-uat-01',
      nombre: 'Dr. Carlos Eduardo',
      apellidos: 'Ramírez Peña',
      correo: 'carlos.ramirez@docentes.uat.edu.mx',
      identificadorInstitucional: 'NPO-40910',
      rol: 'profesor',
      carreraODepartamento: 'Facultad de Ingeniería y Ciencias',
      fechaRegistro: '2022-01-10T08:00:00Z',
      estado: 'activo',
      passwordHash: 'Docente#UAT2026',
    };
    return this.startDynamicSession(defaultCourse, mockTeacher);
  }

  public startDynamicSession(
    course: { id: string; codigo: string; nombre: string; grupo: string; aula: string },
    profesor: User
  ): DynamicSession {
    const rotationSec = 20;
    const now = Date.now();
    const token = this.generateSecureToken();
    const pin = this.generatePin(course.codigo);
    const session: DynamicSession = {
      sessionId: `ses-${course.id}-${now}`,
      courseId: course.id,
      codigoMateria: course.codigo,
      nombreMateria: course.nombre,
      grupo: course.grupo,
      aula: course.aula,
      profesorNpo: profesor.identificadorInstitucional,
      profesorNombre: `${profesor.nombre} ${profesor.apellidos}`,
      activa: true,
      iniciadaEn: now,
      intervaloRotacionSegundos: rotationSec,
      tokenActual: token,
      pinActual: pin,
      expiraEnTimestamp: now + rotationSec * 1000,
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    this.notify();
    syncClassSessionToSupabase({
      tokenActual: token,
      pinActual: pin,
      activa: true,
      sessionId: session.sessionId,
    }).catch((e) => console.warn('Advertencia al sincronizar sesión con Supabase:', e));
    return session;
  }

  public getActiveSession(): DynamicSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  public rotateDynamicToken(): DynamicSession | null {
    const current = this.getActiveSession();
    if (!current || !current.activa) return null;
    const now = Date.now();
    const token = this.generateSecureToken();
    const pin = this.generatePin(current.codigoMateria);
    const updated: DynamicSession = {
      ...current,
      tokenActual: token,
      pinActual: pin,
      expiraEnTimestamp: now + current.intervaloRotacionSegundos * 1000,
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(updated));
    }
    this.notify();
    syncClassSessionToSupabase({
      tokenActual: token,
      pinActual: pin,
      activa: true,
      sessionId: updated.sessionId,
    }).catch((e) => console.warn('Advertencia al sincronizar rotación en Supabase:', e));
    return updated;
  }

  public stopActiveSession(): void {
    const current = this.getActiveSession();
    if (current) {
      current.activa = false;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(current));
      }
      this.notify();
      (async () => {
        try {
          await supabase
            .from('sesiones_clase')
            .update({ activa: false })
            .eq('activa', true);
        } catch (e: unknown) {
          console.warn('Advertencia al cerrar sesión en Supabase:', e);
        }
      })();
    }
  }

  private generateSecureToken(): string {
    const randomHex = Math.random().toString(36).substring(2, 10).toUpperCase();
    const timeHex = Date.now().toString(36).slice(-4).toUpperCase();
    return `UAT-DYN-${timeHex}-${randomHex}`;
  }

  private generatePin(courseCode: string): string {
    const clean = courseCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
    const num = Math.floor(100 + Math.random() * 900);
    return `${clean}${num}`;
  }

  public parseStudentQR(raw: string): { matricula: string; raw: string } | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.matricula) {
          return { matricula: String(parsed.matricula).trim(), raw: trimmed };
        }
      } catch {
        // Fallback
      }
    }
    const matchUat = trimmed.match(/UAT[-_]ALUMNO[-_](\d{6,12})/i);
    if (matchUat) {
      return { matricula: matchUat[1], raw: trimmed };
    }
    const matchDigits = trimmed.match(/\b(\d{8,12})\b/);
    if (matchDigits) {
      return { matricula: matchDigits[1], raw: trimmed };
    }
    return null;
  }

  public recordStudentEntryByTeacher(params: {
    matricula: string;
    courseId: string;
    codigoMateria: string;
    nombreMateria: string;
    grupo: string;
    forceFresh?: boolean;
  }): {
    success: boolean;
    isDuplicate: boolean;
    message: string;
    record?: AttendanceRecord;
    studentName?: string;
  } {
    const users = authStore.getUsers();
    const cleanMatricula = params.matricula.trim();
    const student = users.find(
      (u) =>
        u.rol === 'alumno' &&
        (u.identificadorInstitucional.toLowerCase() === cleanMatricula.toLowerCase() ||
          u.correo.toLowerCase().includes(cleanMatricula.toLowerCase()))
    );
    const studentName = student
      ? `${student.nombre} ${student.apellidos}`
      : `Alumno Matrícula ${cleanMatricula}`;
    const studentCareer = student?.carreraODepartamento || 'Facultad de Ingeniería Tampico';
    const todayStr = new Date().toLocaleDateString('es-MX');
    let records = this.getAllRecords();

    const existingIndex = records.findIndex(
      (r) =>
        r.courseId === params.courseId &&
        r.fecha === todayStr &&
        r.matricula.toLowerCase() === cleanMatricula.toLowerCase()
    );

    if (existingIndex !== -1) {
      if (params.forceFresh) {
        records.splice(existingIndex, 1);
      } else {
        const existing = records[existingIndex];
        playAudioFeedback('duplicate');
        return {
          success: false,
          isDuplicate: true,
          message: `El alumno ${studentName} (${cleanMatricula}) ya cuenta con asistencia registrada hoy a las ${existing.hora}.`,
          record: existing,
          studentName,
        };
      }
    }

    const newRecord: AttendanceRecord = {
      id: `att-prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      matricula: cleanMatricula,
      nombreAlumno: studentName,
      carrera: studentCareer,
      courseId: params.courseId,
      codigoMateria: params.codigoMateria,
      nombreMateria: params.nombreMateria,
      grupo: params.grupo,
      fecha: todayStr,
      hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: Date.now(),
      estatus: 'presente',
      metodoRegistro: 'escaner_profesor',
    };

    records.unshift(newRecord);
    this.saveRecords(records);
    playAudioFeedback('success');

    (async () => {
      try {
        const activeSbSession = await fetchActiveSessionFromSupabase();
        if (activeSbSession) {
          await ensureUserInSupabase({
            matricula: cleanMatricula,
            nombre: studentName,
            rol: 'alumno',
          });
          await supabase.from('asistencias').insert({
            sesion_id: activeSbSession.id,
            alumno_matricula: cleanMatricula,
            estatus: 'presente',
          });
        }
      } catch (err) {
        console.warn('Advertencia al registrar asistencia docente en Supabase:', err);
      }
    })();

    authStore.addAuditLog({
      tipo: 'usuario_modificado',
      identificador: cleanMatricula,
      detalles: `Asistencia escaneada por docente en aula para ${params.codigoMateria} (${params.grupo})`,
    });

    return {
      success: true,
      isDuplicate: false,
      message: `¡Asistencia registrada con éxito! ${studentName}`,
      record: newRecord,
      studentName,
    };
  }

  public recordStudentSelfAttendance(params: {
    student: User;
    tokenOrPin: string;
    forceFresh?: boolean;
  }): {
    success: boolean;
    isDuplicate: boolean;
    message: string;
    record?: AttendanceRecord;
  } {
    let session = this.getActiveSession();
    if (!session || !session.activa) {
      session = this.ensureActiveSession();
    }

    const isTokenValid = (input: string): boolean => {
      if (!input) return false;
      const cleanInput = input.trim();
      if (cleanInput === session.tokenActual || cleanInput === session.pinActual) {
        return true;
      }
      const upperInput = cleanInput.toUpperCase();
      const sessionToken = (session.tokenActual || '').trim().toUpperCase();
      const sessionPin = (session.pinActual || '').trim().toUpperCase();
      if (upperInput === sessionToken || upperInput === sessionPin) {
        return true;
      }
      if (sessionToken && upperInput.includes(sessionToken)) {
        return true;
      }
      const inputStripped = upperInput.replace(/[^A-Za-z0-9]/g, '');
      const pinStripped = sessionPin.replace(/[^A-Za-z0-9]/g, '');
      if (pinStripped && inputStripped === pinStripped) {
        return true;
      }
      if (cleanInput.includes('{') && cleanInput.includes('}')) {
        try {
          const parsed = JSON.parse(cleanInput);
          const t = String(parsed.token || parsed.tokenActual || '').trim().toUpperCase();
          const p = String(parsed.pin || parsed.pinActual || '').trim().toUpperCase();
          if (t && (t === sessionToken || t === session.tokenActual.toUpperCase())) return true;
          if (p && (p === sessionPin || p === session.pinActual.toUpperCase())) return true;
        } catch {
          // Ignorar
        }
      }
      return false;
    };

    if (!isTokenValid(params.tokenOrPin)) {
      playAudioFeedback('error');
      return {
        success: false,
        isDuplicate: false,
        message: 'El código QR de la clase ha expirado o no coincide con la sesión activa del docente.',
      };
    }

    const todayStr = new Date().toLocaleDateString('es-MX');
    let records = this.getAllRecords();

    const existingIndex = records.findIndex(
      (r) =>
        r.courseId === session.courseId &&
        r.fecha === todayStr &&
        r.matricula.toLowerCase() === params.student.identificadorInstitucional.toLowerCase()
    );

    if (existingIndex !== -1) {
      if (params.forceFresh) {
        records.splice(existingIndex, 1);
      } else {
        const existing = records[existingIndex];
        playAudioFeedback('duplicate');
        return {
          success: false,
          isDuplicate: true,
          message: `Ya registraste tu asistencia para esta clase a las ${existing.hora}.`,
          record: existing,
        };
      }
    }

    const newRecord: AttendanceRecord = {
      id: `att-self-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      matricula: params.student.identificadorInstitucional,
      nombreAlumno: `${params.student.nombre} ${params.student.apellidos}`,
      carrera: params.student.carreraODepartamento,
      courseId: session.courseId,
      codigoMateria: session.codigoMateria,
      nombreMateria: session.nombreMateria,
      grupo: session.grupo,
      fecha: todayStr,
      hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: Date.now(),
      estatus: 'presente',
      metodoRegistro: 'pin_manual',
    };

    records.unshift(newRecord);
    this.saveRecords(records);
    playAudioFeedback('success');

    (async () => {
      try {
        const activeSbSession = await fetchActiveSessionFromSupabase();
        if (activeSbSession) {
          await ensureUserInSupabase({
            matricula: params.student.identificadorInstitucional,
            nombre: `${params.student.nombre} ${params.student.apellidos}`,
            rol: 'alumno',
          });
          await supabase.from('asistencias').insert({
            sesion_id: activeSbSession.id,
            alumno_matricula: params.student.identificadorInstitucional,
            estatus: 'presente',
          });
        }
      } catch (err) {
        console.warn('Advertencia al registrar asistencia de alumno en Supabase:', err);
      }
    })();

    authStore.addAuditLog({
      tipo: 'usuario_modificado',
      identificador: params.student.identificadorInstitucional,
      detalles: `Asistencia de alumno vía PIN de clase de 6 caracteres (${session.codigoMateria})`,
    });

    return {
      success: true,
      isDuplicate: false,
      message: `¡Asistencia confirmada para ${session.nombreMateria}!`,
      record: newRecord,
    };
  }

  public resetToDefaults(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(INITIAL_ATTENDANCE));
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    this.notify();
  }
}

export const attendanceStore = new AttendanceStore();
