/**
 * Validaciones institucionales para la Universidad Autónoma de Tamaulipas (UAT)
 * Sistema: Asistencia por QR y Control Escolar
 */

export interface PasswordCriteria {
  hasMinLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
  score: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: string[];
}

/**
 * 1. Validar Matrícula UAT
 * Regla: Solo debe aceptar caracteres numéricos y tener exactamente 10 dígitos.
 * Ejemplo válido: 2243330309
 */
export const MATRICULA_REGEX = /^\d{10}$/;

export function validateMatricula(matricula: string): ValidationResult {
  const clean = matricula.trim();
  if (!clean) {
    return {
      isValid: false,
      error: 'Campo incorrecto: Matrícula',
      details: ['La matrícula institucional no puede estar vacía. Debe ingresar 10 dígitos numéricos.'],
    };
  }
  if (!/^\d+$/.test(clean)) {
    return {
      isValid: false,
      error: 'Campo incorrecto: Matrícula',
      details: [
        'Solo se permiten caracteres numéricos.',
        'No se admiten letras, espacios ni caracteres especiales.',
      ],
    };
  }
  if (clean.length !== 10) {
    return {
      isValid: false,
      error: 'Campo incorrecto: Matrícula',
      details: [
        `Debe tener exactamente 10 dígitos numéricos (actualmente tiene ${clean.length}).`,
        'Ejemplo válido: 2243330309',
      ],
    };
  }
  return { isValid: true };
}

/**
 * 2. Validar Correo Institucional UAT
 * Para Alumnos: Debe cumplir estrictamente con el formato: a{matricula}@alumnos.uat.edu.mx
 * Ejemplo válido basado en la matrícula 2243330309: a2243330309@alumnos.uat.edu.mx
 */
export const ALUMNO_EMAIL_REGEX = /^a\d{10}@alumnos\.uat\.edu\.mx$/i;
export const DOCENTE_EMAIL_REGEX = /^a\d{10}@docentes\.uat\.edu\.mx$/i;
export const ADMIN_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(admin\.)?uat\.edu\.mx$/i;

export function validateCorreoInstitucional(
  email: string,
  rol: 'alumno' | 'profesor' | 'administrador',
  expectedMatricula?: string
): ValidationResult {
  const clean = email.trim().toLowerCase();
  if (!clean) {
    return {
      isValid: false,
      error: 'Campo incorrecto: Correo Institucional',
      details: ['El correo institucional no puede estar vacío.'],
    };
  }

  if (rol === 'alumno') {
    if (!ALUMNO_EMAIL_REGEX.test(clean)) {
      return {
        isValid: false,
        error: 'Campo incorrecto: Correo Institucional',
        details: [
          'Debe cumplir estrictamente con el formato: a{matricula}@alumnos.uat.edu.mx',
          'Ejemplo válido: a2243330309@alumnos.uat.edu.mx',
        ],
      };
    }
    // Si se tiene la matrícula, validar que coincida exactamente
    if (expectedMatricula && expectedMatricula.trim().length === 10) {
      const expectedEmail = `a${expectedMatricula.trim()}@alumnos.uat.edu.mx`.toLowerCase();
      if (clean !== expectedEmail) {
        return {
          isValid: false,
          error: 'Campo incorrecto: Correo Institucional',
          details: [
            `El correo no coincide con la matrícula ingresada (${expectedMatricula}).`,
            `Correo requerido: ${expectedEmail}`,
          ],
        };
      }
    }
    return { isValid: true };
  }

  if (rol === 'profesor') {
    // Sigue el mismo formato que el alumno con @docentes.uat.edu.mx
    const isValidDocente = DOCENTE_EMAIL_REGEX.test(clean) || /^[a-zA-Z0-9._%+-]+@docentes\.uat\.edu\.mx$/i.test(clean);
    if (!isValidDocente) {
      return {
        isValid: false,
        error: 'Campo incorrecto: Correo Institucional',
        details: [
          'Debe cumplir estrictamente con el formato: a{matricula}@docentes.uat.edu.mx',
          'Ejemplo válido: a2243330309@docentes.uat.edu.mx',
        ],
      };
    }
    if (expectedMatricula && expectedMatricula.trim().length === 10) {
      const expectedEmail = `a${expectedMatricula.trim()}@docentes.uat.edu.mx`.toLowerCase();
      if (clean !== expectedEmail && !DOCENTE_EMAIL_REGEX.test(clean)) {
        return {
          isValid: false,
          error: 'Campo incorrecto: Correo Institucional',
          details: [
            `El correo docente debe coincidir con su matrícula (${expectedMatricula}).`,
            `Correo requerido: ${expectedEmail}`,
          ],
        };
      }
    }
    return { isValid: true };
  }

  // Administrador
  if (!ADMIN_EMAIL_REGEX.test(clean)) {
    return {
      isValid: false,
      error: 'Formato de correo administrativo inválido.',
      details: [
        'Dominio institucional permitido: @uat.edu.mx o @admin.uat.edu.mx',
        'Ejemplo: admin.escolar@uat.edu.mx',
      ],
    };
  }

  return { isValid: true };
}

/**
 * 3. Validar Contraseña Segura
 * Regla: Formato fuerte (mínimo 8 caracteres, al menos una mayúscula,
 * una minúscula, un número y un carácter especial).
 */
export const PASSWORD_STRONG_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]{8,}$/;

export function checkPasswordCriteria(password: string): PasswordCriteria {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

  let score = 0;
  if (hasMinLength) score++;
  if (hasUpperCase) score++;
  if (hasLowerCase) score++;
  if (hasNumber) score++;
  if (hasSpecialChar) score++;

  const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;

  return {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar,
    isValid,
    score,
  };
}

export function validatePassword(password: string): ValidationResult {
  const criteria = checkPasswordCriteria(password);
  if (criteria.isValid) {
    return { isValid: true };
  }

  const details: string[] = [];
  if (!criteria.hasMinLength) details.push('Tener al menos 8 caracteres (longitud actual: ' + password.length + ')');
  if (!criteria.hasUpperCase) details.push('Incluir al menos una letra mayúscula (A-Z)');
  if (!criteria.hasLowerCase) details.push('Incluir al menos una letra minúscula (a-z)');
  if (!criteria.hasNumber) details.push('Incluir al menos un número (0-9)');
  if (!criteria.hasSpecialChar) details.push('Incluir al menos un carácter especial (!@#$%^&*...)');

  return {
    isValid: false,
    error: 'La contraseña no cumple con la política de seguridad institucional.',
    details,
  };
}

/**
 * 4. Asignación de Roles y Navegación
 * Identifica si el usuario es Alumno, Profesor o Administrador según
 * el dominio o las credenciales ingresadas.
 */
export function detectRoleFromIdentifier(input: string): 'alumno' | 'profesor' | 'administrador' {
  const clean = input.trim().toLowerCase();
  // Caso 1: Correo de alumno o matrícula pura de 10 dígitos
  if (clean.includes('@alumnos.uat.edu.mx') || clean.startsWith('a22') || /^\d{10}$/.test(clean)) {
    return 'alumno';
  }
  // Caso 2: Correo docente o identificador NPO
  if (clean.includes('@docentes.uat.edu.mx') || clean.includes('@profesor') || clean.startsWith('npo')) {
    return 'profesor';
  }
  // Caso 3: Correo admin o identificador ADM
  if (clean.includes('@admin') || clean.includes('@uat.edu.mx') || clean.startsWith('adm')) {
    return 'administrador';
  }
  // Por defecto, si son 10 dígitos o empieza con 'a', es alumno
  if (/^a?\d{10}/.test(clean)) {
    return 'alumno';
  }
  return 'alumno';
}
