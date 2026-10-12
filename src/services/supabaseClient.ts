import { createClient } from '@supabase/supabase-js';

// Carga de variables de entorno con fallback seguro y normalización de clave
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env as Record<string, string | undefined>);
const rawUrl = (env.VITE_SUPABASE_URL || 'https://gxyhsslmhoafaotvvhet.supabase.co').trim();
const rawKey = (env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4eWhzc2xtaG9hZmFvdHZ2aGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NTk1NDUsImV4cCI6MjEwNzIzNTU0NX0.tSA2x4Gsr4PzAremcIL6dBgMYwVZuvjyiF90R_WgVD4').trim();

// Sanitización de prefijo en caso de error de tipeo (ej. "teyJ...")
const cleanKey = rawKey.startsWith('teyJ') ? rawKey.slice(1) : rawKey;

/**
 * Cliente oficial de Supabase conectado a PostgreSQL en la nube
 */
export const supabase = createClient(rawUrl, cleanKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export interface SupabaseSesionClase {
  id: string;
  materia_id: string | null;
  token_actual: string;
  pin_actual: string;
  activa: boolean;
  creado_en?: string;
}

export interface SupabaseAsistencia {
  id: string;
  sesion_id: string | null;
  alumno_matricula: string | null;
  estatus: string;
  registrado_en?: string;
}

export interface SupabaseUsuario {
  id?: string;
  matricula: string;
  nombre: string;
  rol: 'alumno' | 'docente';
  foto_url?: string | null;
  password?: string | null;
}

// Almacena el ID de la sesión actual registrada en Supabase
let currentSupabaseSessionId: string | null = null;
export const getCurrentSupabaseSessionId = () => currentSupabaseSessionId;
export const setCurrentSupabaseSessionId = (id: string | null) => {
  currentSupabaseSessionId = id;
};

/**
 * Asegura que el usuario (alumno o docente) exista en la tabla usuarios de PostgreSQL
 * para cumplir con la llave foránea asistencias_alumno_matricula_fkey
 */
export async function ensureUserInSupabase(user: {
  matricula: string;
  nombre: string;
  rol: 'alumno' | 'docente';
  foto_url?: string | null;
  password?: string | null;
}): Promise<boolean> {
  try {
    const cleanMatricula = user.matricula.trim();
    if (!cleanMatricula) return false;

    // Verificar si ya existe
    const { data: existing, error: findError } = await supabase
      .from('usuarios')
      .select('matricula, password')
      .eq('matricula', cleanMatricula)
      .maybeSingle();

    if (findError) {
      console.warn('Error al verificar usuario en Supabase:', findError.message);
    }

    if (existing) {
      // Si existe pero no tenía contraseña y se proporciona una, actualizarla
      if (!existing.password && user.password) {
        await supabase
          .from('usuarios')
          .update({ password: user.password })
          .eq('matricula', cleanMatricula);
      }
      return true;
    }

    // Insertar nuevo usuario institucional
    const { error: insertError } = await supabase.from('usuarios').insert({
      matricula: cleanMatricula,
      nombre: user.nombre.trim(),
      rol: user.rol,
      foto_url: user.foto_url || null,
      password: user.password || null,
    });

    if (insertError) {
      // Si fue conflicto de duplicado, es un caso de éxito concurrente
      if (insertError.code === '23505') return true;
      console.warn('Error al insertar usuario en Supabase:', insertError.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Excepción en ensureUserInSupabase:', err);
    return false;
  }
}

/**
 * Inserta directamente un usuario en la tabla `usuarios` de Supabase incluyendo la contraseña
 * Maneja el código de error de duplicado (23505)
 */
export async function registerUserInSupabase(userData: {
  matricula: string;
  nombre: string;
  rol: 'alumno' | 'docente';
  foto_url?: string | null;
  password?: string | null;
}): Promise<{
  success: boolean;
  message: string;
  data?: SupabaseUsuario;
  isDuplicate?: boolean;
}> {
  try {
    const cleanMatricula = userData.matricula.trim();
    const cleanNombre = userData.nombre.trim();
    const cleanRol = userData.rol;
    const cleanFoto = userData.foto_url || null;
    const cleanPassword = userData.password || null;

    const { data, error } = await supabase
      .from('usuarios')
      .insert([{
        matricula: cleanMatricula,
        nombre: cleanNombre,
        rol: cleanRol,
        foto_url: cleanFoto,
        password: cleanPassword,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          isDuplicate: true,
          message: 'La matrícula ya se encuentra registrada en el sistema.',
        };
      }
      return {
        success: false,
        message: error.message || 'Error al registrar el usuario en Supabase.',
      };
    }

    return {
      success: true,
      message: 'Usuario registrado exitosamente en la base de datos.',
      data: data as SupabaseUsuario,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error inesperado al conectar con Supabase';
    return {
      success: false,
      message: errorMsg,
    };
  }
}

/**
 * Actualiza la contraseña de un usuario directamente en Supabase
 * Ejecuta: await supabase.from('usuarios').update({ password: newPassword }).eq('matricula', matricula);
 */
export async function updatePasswordInSupabase(matricula: string, newPassword: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const cleanMatricula = matricula.trim();
    if (!cleanMatricula) {
      return { success: false, message: 'La matrícula no puede estar vacía.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }

    const { error } = await supabase
      .from('usuarios')
      .update({ password: newPassword })
      .eq('matricula', cleanMatricula);

    if (error) {
      console.error('Error al actualizar password en Supabase:', error.message);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: 'Contraseña actualizada correctamente en el sistema global.',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al conectar con Supabase.';
    return {
      success: false,
      message: errorMsg,
    };
  }
}

/**
 * Consulta todos los usuarios registrados en Supabase
 */
export async function fetchUsersFromSupabase(): Promise<SupabaseUsuario[]> {
  try {
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('matricula', { ascending: true });

    if (error) {
      console.warn('Error al consultar usuarios en Supabase:', error.message);
      return [];
    }

    return (usuarios || []) as SupabaseUsuario[];
  } catch (err) {
    console.error('Excepción en fetchUsersFromSupabase:', err);
    return [];
  }
}

/**
 * Inserta o actualiza la sesión activa en la tabla `sesiones_clase` con su token_actual y pin_actual
 */
export async function syncClassSessionToSupabase(params: {
  tokenActual: string;
  pinActual: string;
  activa: boolean;
  sessionId?: string;
}): Promise<SupabaseSesionClase | null> {
  try {
    const token = params.tokenActual.trim();
    const pin = params.pinActual.trim();

    // Si ya tenemos un ID de sesión en Supabase y sigue activa, la actualizamos
    if (currentSupabaseSessionId) {
      const { data, error } = await supabase
        .from('sesiones_clase')
        .update({
          token_actual: token,
          pin_actual: pin,
          activa: params.activa,
        })
        .eq('id', currentSupabaseSessionId)
        .select()
        .single();

      if (!error && data) {
        return data as SupabaseSesionClase;
      }
    }

    // Si no hay id o falló el update, cerramos sesiones anteriores y creamos una nueva activa
    if (params.activa) {
      await supabase
        .from('sesiones_clase')
        .update({ activa: false })
        .eq('activa', true);
    }

    const { data, error } = await supabase
      .from('sesiones_clase')
      .insert({
        token_actual: token,
        pin_actual: pin,
        activa: params.activa,
      })
      .select()
      .single();

    if (error) {
      console.error('Error al insertar sesión en Supabase:', error.message);
      return null;
    }

    if (data) {
      currentSupabaseSessionId = data.id;
      return data as SupabaseSesionClase;
    }

    return null;
  } catch (err) {
    console.error('Excepción al sincronizar sesión con Supabase:', err);
    return null;
  }
}

/**
 * Consulta la sesión activa más reciente en Supabase
 */
export async function fetchActiveSessionFromSupabase(): Promise<SupabaseSesionClase | null> {
  try {
    const { data, error } = await supabase
      .from('sesiones_clase')
      .select('*')
      .eq('activa', true)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error al consultar sesión activa en Supabase:', error.message);
      return null;
    }

    if (data) {
      currentSupabaseSessionId = data.id;
      return data as SupabaseSesionClase;
    }

    return null;
  } catch (err) {
    console.error('Excepción en fetchActiveSessionFromSupabase:', err);
    return null;
  }
}

/**
 * Valida un token o PIN contra la tabla `sesiones_clase` de Supabase y registra
 * la entrada en la tabla `asistencias`
 */
export async function validateAndRecordAttendanceInSupabase(params: {
  tokenOrPin: string;
  studentMatricula: string;
  studentNombre?: string;
}): Promise<{
  success: boolean;
  message: string;
  record?: SupabaseAsistencia;
  isDuplicate?: boolean;
}> {
  try {
    const cleanInput = params.tokenOrPin.trim();
    const cleanUpper = cleanInput.toUpperCase();
    const cleanMatricula = params.studentMatricula.trim();

    // 1. Obtener la sesión activa de Supabase
    let session = await fetchActiveSessionFromSupabase();

    // Si no hay sesión activa en Supabase o no coincide, buscar si coincide con alguna sesión activa reciente
    if (!session) {
      const { data: allActive } = await supabase
        .from('sesiones_clase')
        .select('*')
        .eq('activa', true);

      if (allActive && allActive.length > 0) {
        session = allActive[0] as SupabaseSesionClase;
      }
    }

    // Validar token o PIN con la sesión de Supabase
    let matches = false;
    if (session) {
      const sToken = (session.token_actual || '').trim().toUpperCase();
      const sPin = (session.pin_actual || '').trim().toUpperCase();
      if (
        cleanUpper === sToken ||
        cleanUpper === sPin ||
        (sToken && cleanUpper.includes(sToken)) ||
        (sPin && cleanUpper.replace(/[^A-Za-z0-9]/g, '') === sPin.replace(/[^A-Za-z0-9]/g, ''))
      ) {
        matches = true;
      }
    }

    if (!session || !matches) {
      return {
        success: false,
        message: 'El código QR de la clase ha expirado o no coincide con la sesión activa del docente.',
      };
    }

    // 2. Asegurar que el alumno exista en la tabla usuarios
    await ensureUserInSupabase({
      matricula: cleanMatricula,
      nombre: params.studentNombre || `Alumno ${cleanMatricula}`,
      rol: 'alumno',
    });

    // 3. Verificar si ya existe asistencia para esta sesión y matrícula
    const { data: existingAtt } = await supabase
      .from('asistencias')
      .select('*')
      .eq('sesion_id', session.id)
      .eq('alumno_matricula', cleanMatricula)
      .maybeSingle();

    if (existingAtt) {
      return {
        success: false,
        isDuplicate: true,
        message: 'Ya registraste tu asistencia para esta clase.',
        record: existingAtt as SupabaseAsistencia,
      };
    }

    // 4. Insertar en tabla asistencias
    const { data: newAtt, error: insertError } = await supabase
      .from('asistencias')
      .insert({
        sesion_id: session.id,
        alumno_matricula: cleanMatricula,
        estatus: 'presente',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error al insertar asistencia en Supabase:', insertError);
      return {
        success: false,
        message: `Error al guardar en la base de datos: ${insertError.message}`,
      };
    }

    return {
      success: true,
      message: '¡Asistencia registrada con éxito en Supabase!',
      record: newAtt as SupabaseAsistencia,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido al validar asistencia';
    return {
      success: false,
      message: errorMsg,
    };
  }
}

/**
 * Consulta todas las asistencias registradas en Supabase para la sesión activa
 */
export async function fetchAttendanceForSession(sesionId?: string): Promise<SupabaseAsistencia[]> {
  try {
    let targetSessionId = sesionId || currentSupabaseSessionId;
    if (!targetSessionId) {
      const active = await fetchActiveSessionFromSupabase();
      targetSessionId = active?.id || null;
    }
    if (!targetSessionId) return [];

    const { data, error } = await supabase
      .from('asistencias')
      .select('*')
      .eq('sesion_id', targetSessionId)
      .order('registrado_en', { ascending: false });

    if (error) {
      console.warn('Error al obtener asistencias de Supabase:', error.message);
      return [];
    }

    return (data || []) as SupabaseAsistencia[];
  } catch (err) {
    console.error('Excepción en fetchAttendanceForSession:', err);
    return [];
  }
}
