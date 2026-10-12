export type UserRole = 'alumno' | 'profesor' | 'administrador';
export type UserStatus = 'activo' | 'inactivo' | 'bloqueado';

export interface User {
  id: string;
  nombre: string;
  apellidos: string;
  correo: string;
  identificadorInstitucional: string; // Matrícula para alumno (ej. 2243330309), NPO para profesor (ej. NPO-40910), ADM para admin
  rol: UserRole;
  carreraODepartamento: string;
  semestreOGrado?: string;
  fechaRegistro: string;
  ultimoAcceso?: string;
  estado: UserStatus;
  telefono?: string;
  avatarUrl?: string;
  passwordHash: string; // Almacenado de forma segura en el repositorio
}

export type AuditLogType = 
  | 'login_exitoso'
  | 'login_fallido'
  | 'registro'
  | 'recuperacion_solicitada'
  | 'contrasena_restablecida'
  | 'usuario_creado'
  | 'usuario_modificado'
  | 'usuario_estado_cambiado';

export interface AuditLog {
  id: string;
  tipo: AuditLogType;
  usuarioId?: string;
  identificador: string;
  timestamp: string;
  ip: string;
  detalles: string;
}

export interface PasswordResetRequest {
  id: string;
  correo: string;
  identificadorInstitucional: string;
  codigo: string;
  creadoEn: string;
  expiraEn: string;
  usado: boolean;
}

export interface StudentCourse {
  id: string;
  codigo: string;
  nombre: string;
  profesor: string;
  aula: string;
  horario: string;
  calificacionParcial1?: number;
  calificacionParcial2?: number;
  calificacionFinal?: number;
  asistenciaPct: number;
}

export interface TeacherCourse {
  id: string;
  codigo: string;
  nombre: string;
  carrera: string;
  semestre: string;
  grupo: string;
  aula: string;
  horario: string;
  totalAlumnos: number;
  alumnos: {
    matricula: string;
    nombre: string;
    calificacion: number;
    asistencias: number;
  }[];
}
