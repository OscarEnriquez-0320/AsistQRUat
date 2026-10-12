import { User, AuditLog, PasswordResetRequest } from '../types';
import { 
  validateMatricula, 
  validateCorreoInstitucional, 
  validatePassword,
  detectRoleFromIdentifier
} from '../utils/validators';
import { supabase, SupabaseUsuario } from './supabaseClient';

const USERS_STORAGE_KEY = 'sigu_uat_users_v2';
const SESSION_STORAGE_KEY = 'sigu_uat_session_v2';
const AUDIT_STORAGE_KEY = 'sigu_uat_audit_v2';
const RESETS_STORAGE_KEY = 'sigu_uat_resets_v2';

// Cuentas institucionales precargadas oficiales de la UAT
const DEFAULT_USERS: User[] = [
  {
    id: 'usr-alumno-uat-01',
    nombre: 'Valeria Sofía',
    apellidos: 'Mendoza Flores',
    correo: 'a2243330309@alumnos.uat.edu.mx',
    identificadorInstitucional: '2243330309', // Matrícula oficial de 10 dígitos
    rol: 'alumno',
    carreraODepartamento: 'Ing. en Sistemas Computacionales',
    semestreOGrado: '5to Semestre',
    fechaRegistro: '2024-08-15T09:30:00Z',
    ultimoAcceso: '2026-10-04T18:00:00Z',
    estado: 'activo',
    telefono: '+52 834 318 1800',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    passwordHash: 'Uat2026@Segura',
  },
  {
    id: 'usr-profesor-uat-01',
    nombre: 'Dr. Carlos Eduardo',
    apellidos: 'Ramírez Peña',
    correo: 'carlos.ramirez@docentes.uat.edu.mx',
    identificadorInstitucional: 'NPO-40910',
    rol: 'profesor',
    carreraODepartamento: 'Facultad de Ingeniería y Ciencias - División de Estudios de Posgrado',
    semestreOGrado: 'Profesor de Tiempo Completo (Nivel B)',
    fechaRegistro: '2022-01-10T08:00:00Z',
    ultimoAcceso: '2026-10-04T15:20:00Z',
    estado: 'activo',
    telefono: '+52 834 318 1750',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    passwordHash: 'Docente#UAT2026',
  },
  {
    id: 'usr-admin-uat-01',
    nombre: 'Mtra. Gabriela',
    apellidos: 'Fuentes Estrada',
    correo: 'admin.escolar@uat.edu.mx',
    identificadorInstitucional: 'ADM-1001',
    rol: 'administrador',
    carreraODepartamento: 'Dirección General de Servicios Escolares UAT',
    semestreOGrado: 'Jefatura de Registro y Control de Asistencia',
    fechaRegistro: '2020-03-01T08:00:00Z',
    ultimoAcceso: '2026-10-04T19:00:00Z',
    estado: 'activo',
    telefono: '+52 834 318 1700',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    passwordHash: 'Admin#Uat2026!',
  },
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-uat-001',
    tipo: 'registro',
    identificador: 'ADM-1001',
    timestamp: '2026-10-01T09:00:00Z',
    ip: '148.217.1.10',
    detalles: 'Inicialización de cuenta de Servicios Escolares UAT',
  },
  {
    id: 'log-uat-002',
    tipo: 'login_exitoso',
    identificador: '2243330309',
    timestamp: '2026-10-04T14:10:00Z',
    ip: '148.217.88.24',
    detalles: 'Inicio de sesión de alumno UAT mediante matrícula 2243330309',
  },
  {
    id: 'log-uat-003',
    tipo: 'login_exitoso',
    identificador: 'NPO-40910',
    timestamp: '2026-10-04T15:20:00Z',
    ip: '148.217.88.91',
    detalles: 'Inicio de sesión de docente UAT mediante credenciales NPO',
  },
];

class AuthStore {
  constructor() {
    this.init();
  }

  private init() {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(USERS_STORAGE_KEY)) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    }
    if (!localStorage.getItem(AUDIT_STORAGE_KEY)) {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(INITIAL_AUDIT_LOGS));
    }
    if (!localStorage.getItem(RESETS_STORAGE_KEY)) {
      localStorage.setItem(RESETS_STORAGE_KEY, JSON.stringify([]));
    }
  }

  // Carga inicial y sincronización con Supabase
  public async syncWithSupabase(): Promise<User[]> {
    try {
      const { data: usuarios, error } = await supabase.from('usuarios').select('*');
      if (error) {
        console.warn('Aviso al consultar usuarios en Supabase:', error.message);
        return this.getUsers();
      }
      if (usuarios && Array.isArray(usuarios)) {
        const localUsers = this.getUsers();
        let changed = false;

        usuarios.forEach((su: SupabaseUsuario) => {
          const mat = (su.matricula || '').trim();
          if (!mat) return;
          const rolMapped = (su.rol === 'docente' ? 'profesor' : 'alumno') as User['rol'];
          const existingIdx = localUsers.findIndex(
            u => u.identificadorInstitucional.toUpperCase() === mat.toUpperCase()
          );

          if (existingIdx === -1) {
            const names = (su.nombre || 'Usuario').split(' ');
            const nombre = names[0] || 'Usuario';
            const apellidos = names.slice(1).join(' ') || 'UAT';
            const domain = rolMapped === 'profesor' ? 'docentes.uat.edu.mx' : 'alumnos.uat.edu.mx';
            const correo = rolMapped === 'profesor'
              ? `${nombre.toLowerCase()}.${apellidos.split(' ')[0]?.toLowerCase() || 'prof'}@${domain}`
              : `a${mat}@${domain}`;

            const newUser: User = {
              id: su.id || `usr-sb-${mat}`,
              nombre,
              apellidos,
              correo,
              identificadorInstitucional: mat,
              rol: rolMapped,
              carreraODepartamento: rolMapped === 'profesor' ? 'Facultad de Ingeniería y Ciencias' : 'Ing. en Sistemas Computacionales',
              semestreOGrado: rolMapped === 'profesor' ? 'Docente Titular' : '1er Semestre',
              fechaRegistro: new Date().toISOString(),
              estado: 'activo',
              passwordHash: su.password || 'Uat2026@Segura',
              avatarUrl: su.foto_url || undefined,
            };
            localUsers.push(newUser);
            changed = true;
          } else {
            if (localUsers[existingIdx].rol !== rolMapped) {
              localUsers[existingIdx].rol = rolMapped;
              changed = true;
            }
            if (su.foto_url && localUsers[existingIdx].avatarUrl !== su.foto_url) {
              localUsers[existingIdx].avatarUrl = su.foto_url;
              changed = true;
            }
            if (su.password && localUsers[existingIdx].passwordHash !== su.password) {
              localUsers[existingIdx].passwordHash = su.password;
              changed = true;
            }
          }
        });

        if (changed) {
          this.saveUsers(localUsers);
        }
      }
      return this.getUsers();
    } catch (err) {
      console.warn('Excepción al sincronizar usuarios con Supabase:', err);
      return this.getUsers();
    }
  }

  // Usuarios
  public getUsers(): User[] {
    try {
      const data = localStorage.getItem(USERS_STORAGE_KEY);
      return data ? JSON.parse(data) : DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  }

  public saveUsers(users: User[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }

  public findUserByIdentifierOrEmail(query: string): User | undefined {
    const clean = query.trim().toLowerCase();
    const users = this.getUsers();
    return users.find(
      u => u.correo.toLowerCase() === clean || 
           u.identificadorInstitucional.toLowerCase() === clean
    );
  }

  /**
   * Consulta a Supabase si una matrícula ya existe directamente en PostgreSQL
   */
  public async checkMatriculaInSupabase(matricula: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('matricula')
        .eq('matricula', matricula.trim())
        .maybeSingle();

      if (!error && data) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Registra un usuario en Supabase (`usuarios`) guardando el campo 'password' directamente
   * y en el almacén local institucional.
   * await supabase.from('usuarios').insert([{ matricula, nombre, rol, foto_url, password }]);
   */
  public async registerUserAsync(userData: Omit<User, 'id' | 'fechaRegistro' | 'estado'>): Promise<{
    success: boolean;
    message: string;
    details?: string[];
    user?: User;
  }> {
    const cleanId = userData.identificadorInstitucional.trim();
    const cleanEmail = userData.correo.trim().toLowerCase();
    const cleanNombre = `${userData.nombre.trim()} ${userData.apellidos.trim()}`.trim();
    const rolSupabase: 'alumno' | 'docente' = userData.rol === 'profesor' ? 'docente' : 'alumno';

    // 1. Validar matrícula si es alumno
    if (userData.rol === 'alumno') {
      const matValidation = validateMatricula(cleanId);
      if (!matValidation.isValid) {
        return {
          success: false,
          message: matValidation.error || 'Matrícula inválida.',
          details: matValidation.details,
        };
      }
    }

    // 2. Validar correo institucional
    const emailValidation = validateCorreoInstitucional(cleanEmail, userData.rol, cleanId);
    if (!emailValidation.isValid) {
      return {
        success: false,
        message: emailValidation.error || 'Correo institucional inválido.',
        details: emailValidation.details,
      };
    }

    // 3. Validar contraseña
    if (!userData.passwordHash || !userData.passwordHash.trim()) {
      return {
        success: false,
        message: 'La contraseña no puede estar vacía.',
        details: ['Ingrese una contraseña para su cuenta institucional.'],
      };
    }
    if (userData.passwordHash.length < 6) {
      return {
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres.',
        details: ['Ingrese una contraseña de al menos 6 caracteres.'],
      };
    }

    // 1. PERSISTENCIA DE CONTRASEÑA EN SUPABASE:
    // Guarda el campo 'password' directamente en la columna 'password' de la tabla 'usuarios' en Supabase:
    const matricula = cleanId;
    const nombre = cleanNombre;
    const rol = rolSupabase;
    const foto_url = userData.avatarUrl || null;
    const password = userData.passwordHash;

    const { data: sbData, error: sbError } = await supabase
      .from('usuarios')
      .insert([{ matricula, nombre, rol, foto_url, password }])
      .select()
      .single();

    if (sbError) {
      if (sbError.code === '23505') {
        return {
          success: false,
          message: 'La matrícula ya se encuentra registrada en el sistema.',
          details: [
            `La matrícula "${cleanId}" ya existe en la base de datos institucional.`,
            'Si ya cuenta con una cuenta, inicie sesión o utilice la opción "Recuperar Clave".',
          ],
        };
      }
      console.warn('Aviso de inserción en Supabase usuarios:', sbError.message);
    }

    // Guardar también en el estado local institucional
    const users = this.getUsers();
    const existingIndex = users.findIndex(u => u.identificadorInstitucional.toUpperCase() === cleanId.toUpperCase());
    if (existingIndex !== -1) {
      return {
        success: false,
        message: 'La matrícula ya se encuentra registrada en el sistema.',
        details: ['Comuníquese a Servicios Escolares de la UAT si considera que es un error.'],
      };
    }

    const newUser: User = {
      ...userData,
      id: sbData?.id || `usr-uat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      identificadorInstitucional: cleanId.toUpperCase(),
      correo: cleanEmail,
      fechaRegistro: new Date().toISOString(),
      estado: 'activo',
    };

    users.push(newUser);
    this.saveUsers(users);
    this.addAuditLog({
      tipo: 'registro',
      usuarioId: newUser.id,
      identificador: newUser.identificadorInstitucional,
      detalles: `Registro oficial UAT en Supabase como ${newUser.rol}: ${newUser.nombre} ${newUser.apellidos}`,
    });

    return { 
      success: true, 
      message: 'Registro institucional UAT completado exitosamente en Supabase.', 
      user: newUser 
    };
  }

  public registerUser(userData: Omit<User, 'id' | 'fechaRegistro' | 'estado'>): { 
    success: boolean; 
    message: string; 
    details?: string[];
    user?: User 
  } {
    const users = this.getUsers();
    const cleanId = userData.identificadorInstitucional.trim();
    const cleanEmail = userData.correo.trim().toLowerCase();

    if (userData.rol === 'alumno') {
      const matValidation = validateMatricula(cleanId);
      if (!matValidation.isValid) {
        return {
          success: false,
          message: matValidation.error || 'Matrícula inválida.',
          details: matValidation.details,
        };
      }
    }

    const emailValidation = validateCorreoInstitucional(cleanEmail, userData.rol, cleanId);
    if (!emailValidation.isValid) {
      return {
        success: false,
        message: emailValidation.error || 'Correo institucional inválido.',
        details: emailValidation.details,
      };
    }

    if (!userData.passwordHash || !userData.passwordHash.trim()) {
      return {
        success: false,
        message: 'La contraseña no puede estar vacía.',
        details: ['Ingrese una contraseña para su cuenta institucional.'],
      };
    }
    if (userData.passwordHash.length < 6) {
      return {
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres.',
        details: ['Ingrese una contraseña de al menos 6 caracteres.'],
      };
    }

    if (users.some(u => u.identificadorInstitucional.toUpperCase() === cleanId.toUpperCase())) {
      const etiqueta = userData.rol === 'profesor' ? 'NPO' : 'matrícula';
      return { 
        success: false, 
        message: `La ${etiqueta} institucional (${cleanId}) ya se encuentra registrada en la UAT.`,
        details: ['Comuníquese a Servicios Escolares de la UAT si considera que es un error.'],
      };
    }

    const newUser: User = {
      ...userData,
      id: `usr-uat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      identificadorInstitucional: cleanId.toUpperCase(),
      correo: cleanEmail,
      fechaRegistro: new Date().toISOString(),
      estado: 'activo',
    };

    users.push(newUser);
    this.saveUsers(users);

    // 1. PERSISTENCIA DE CONTRASEÑA EN SUPABASE:
    // Guarda el campo 'password' directamente en la columna 'password' de la tabla 'usuarios' en Supabase:
    const matricula = cleanId;
    const nombre = `${userData.nombre.trim()} ${userData.apellidos.trim()}`.trim();
    const rol: 'alumno' | 'docente' = userData.rol === 'profesor' ? 'docente' : 'alumno';
    const foto_url = userData.avatarUrl || null;
    const password = userData.passwordHash;

    supabase.from('usuarios').insert([{ matricula, nombre, rol, foto_url, password }]).then(({ error }) => {
      if (error && error.code !== '23505') {
        console.warn('Aviso de inserción en Supabase:', error.message);
      }
    });

    this.addAuditLog({
      tipo: 'registro',
      usuarioId: newUser.id,
      identificador: newUser.identificadorInstitucional,
      detalles: `Registro oficial UAT como ${newUser.rol}: ${newUser.nombre} ${newUser.apellidos}`,
    });

    return { 
      success: true, 
      message: 'Registro institucional UAT completado exitosamente.', 
      user: newUser 
    };
  }

  public updateUser(id: string, updates: Partial<User>): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) {
      return { success: false, message: 'Usuario no encontrado' };
    }

    users[idx] = { ...users[idx], ...updates };
    this.saveUsers(users);

    if (updates.passwordHash && users[idx].identificadorInstitucional) {
      supabase
        .from('usuarios')
        .update({ password: updates.passwordHash })
        .eq('matricula', users[idx].identificadorInstitucional)
        .then(({ error }) => {
          if (error) console.warn('Aviso al actualizar password en Supabase:', error.message);
        });
    }

    this.addAuditLog({
      tipo: 'usuario_modificado',
      usuarioId: id,
      identificador: users[idx].identificadorInstitucional,
      detalles: 'Actualización de datos de perfil institucional UAT',
    });

    return { success: true, message: 'Usuario actualizado correctamente', user: users[idx] };
  }

  public toggleUserStatus(id: string): { success: boolean; newStatus: User['estado'] } {
    const users = this.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return { success: false, newStatus: 'inactivo' };

    const newStatus: User['estado'] = user.estado === 'activo' ? 'inactivo' : 'activo';
    user.estado = newStatus;
    this.saveUsers(users);

    this.addAuditLog({
      tipo: 'usuario_estado_cambiado',
      usuarioId: id,
      identificador: user.identificadorInstitucional,
      detalles: `Estado de cuenta UAT cambiado a: ${newStatus}`,
    });

    return { success: true, newStatus };
  }

  /**
   * Inicio de sesión multididispositivo validando directamente contra Supabase:
   * 1. Consulta al usuario en Supabase:
   *    const { data: usuario } = await supabase.from('usuarios').select('*').eq('matricula', matricula).single();
   * 2. Compara la contraseña ingresada contra la columna 'password' guardada en Supabase.
   * 3. Asigna automáticamente el 'rol' registrado en Supabase ('alumno' o 'docente') al usuario autenticado.
   */
  public async loginWithSupabase(identifierOrEmail: string, password: string): Promise<{
    success: boolean;
    message: string;
    details?: string[];
    user?: User;
  }> {
    const clean = identifierOrEmail.trim();

    // Extraer matrícula objetivo (10 dígitos o desde correo institucional)
    let matriculaTarget = clean;
    if (clean.includes('@')) {
      const matchMat = clean.match(/^a?(\d{10})@/i);
      if (matchMat) {
        matriculaTarget = matchMat[1];
      }
    }
    const matricula = matriculaTarget;

    try {
      // 2. AUTENTICACIÓN MULTIDISPOSITIVO (handleLoginSubmit):
      // Al iniciar sesión con matrícula y contraseña, valida las credenciales consultando directamente a Supabase:
      const { data: usuario, error: sbError } = await supabase.from('usuarios').select('*').eq('matricula', matricula).single();

      if (!sbError && usuario) {
        // Compara la contraseña ingresada contra la columna 'password' guardada en Supabase
        const dbPassword = usuario.password;
        const isPasswordMatch = dbPassword 
          ? dbPassword === password 
          : password === 'Uat2026@Segura';

        if (!isPasswordMatch) {
          this.addAuditLog({
            tipo: 'login_fallido',
            identificador: usuario.matricula,
            detalles: 'Contraseña incorrecta validada contra la columna password en Supabase',
          });
          return {
            success: false,
            message: 'Contraseña incorrecta.',
            details: [
              'La clave ingresada no coincide con los registros institucionales de la UAT.',
              'Recuerde que distingue entre mayúsculas y minúsculas.',
              'Puede utilizar la opción "Restablecer Contraseña" para actualizarla.',
            ],
          };
        }

        // 3. Asigna automáticamente el 'rol' registrado en Supabase ('alumno' o 'docente')
        const rolMapped = (usuario.rol === 'docente' ? 'profesor' : 'alumno') as User['rol'];
        const localUsers = this.getUsers();
        let userObj = localUsers.find(
          u => u.identificadorInstitucional.toUpperCase() === usuario.matricula.toUpperCase()
        );

        if (!userObj) {
          const names = (usuario.nombre || 'Usuario').split(' ');
          const nombre = names[0] || 'Usuario';
          const apellidos = names.slice(1).join(' ') || 'UAT';
          const domain = rolMapped === 'profesor' ? 'docentes.uat.edu.mx' : 'alumnos.uat.edu.mx';
          const correo = rolMapped === 'profesor'
            ? `${nombre.toLowerCase()}.${apellidos.split(' ')[0]?.toLowerCase() || 'prof'}@${domain}`
            : `a${usuario.matricula}@${domain}`;

          userObj = {
            id: usuario.id || `usr-sb-${usuario.matricula}`,
            nombre,
            apellidos,
            correo,
            identificadorInstitucional: usuario.matricula,
            rol: rolMapped,
            carreraODepartamento: rolMapped === 'profesor' ? 'Facultad de Ingeniería y Ciencias' : 'Ing. en Sistemas Computacionales',
            semestreOGrado: rolMapped === 'profesor' ? 'Docente Titular' : '1er Semestre',
            fechaRegistro: new Date().toISOString(),
            estado: 'activo',
            passwordHash: password,
            avatarUrl: usuario.foto_url || undefined,
            ultimoAcceso: new Date().toISOString(),
          };
          localUsers.push(userObj);
        } else {
          userObj.rol = rolMapped;
          userObj.passwordHash = password;
          userObj.ultimoAcceso = new Date().toISOString();
          if (usuario.foto_url) userObj.avatarUrl = usuario.foto_url;
        }

        // Si en Supabase el password estaba vacío, sincronizarlo
        if (!usuario.password) {
          await supabase.from('usuarios').update({ password }).eq('matricula', usuario.matricula);
        }

        this.saveUsers(localUsers);
        this.setCurrentSession(userObj);
        this.addAuditLog({
          tipo: 'login_exitoso',
          usuarioId: userObj.id,
          identificador: userObj.identificadorInstitucional,
          detalles: `Inicio de sesión exitoso autenticado con Supabase como ${userObj.rol}: ${userObj.nombre} ${userObj.apellidos}`,
        });

        return {
          success: true,
          message: `Bienvenido(a) a la UAT, ${userObj.nombre}.`,
          user: userObj,
        };
      }
    } catch (err) {
      console.warn('Aviso en consulta de autenticación directa a Supabase:', err);
    }

    // Consulta de respaldo si no se encontró en Supabase por matrícula directa
    await this.syncWithSupabase();
    return this.login(identifierOrEmail, password);
  }

  /**
   * Actualiza la contraseña directamente en Supabase y sincroniza localmente:
   * await supabase.from('usuarios').update({ password: nuevaPassword }).eq('matricula', matricula);
   */
  public async updatePasswordInSupabase(matricula: string, newPassword: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const cleanMatricula = matricula.replace(/\D/g, '').slice(0, 10);
      if (!cleanMatricula || cleanMatricula.length !== 10) {
        return { success: false, message: 'La matrícula debe contener 10 dígitos numéricos.' };
      }

      // 3. RESTABLECER CONTRASEÑA GLOBAL:
      // Al restablecer o cambiar la contraseña de una matrícula, realiza un UPDATE directo en la base de datos de Supabase:
      const nuevaPassword = newPassword;
      const { error } = await supabase.from('usuarios').update({ password: nuevaPassword }).eq('matricula', cleanMatricula);

      if (error) {
        console.error('Error al actualizar password en Supabase:', error.message);
        return { success: false, message: error.message };
      }

      // Sincronizar en el estado local de authStore
      const users = this.getUsers();
      const idx = users.findIndex(u => u.identificadorInstitucional.toUpperCase() === cleanMatricula.toUpperCase());
      if (idx !== -1) {
        users[idx].passwordHash = newPassword;
        this.saveUsers(users);
        const curr = this.getCurrentSession();
        if (curr && curr.identificadorInstitucional.toUpperCase() === cleanMatricula.toUpperCase()) {
          this.setCurrentSession({ ...curr, passwordHash: newPassword });
        }
      }

      this.addAuditLog({
        tipo: 'contrasena_restablecida',
        identificador: cleanMatricula,
        detalles: 'Contraseña actualizada en Supabase y sincronizada globalmente',
      });

      return {
        success: true,
        message: 'Contraseña actualizada correctamente en el sistema global.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la base de datos de Supabase.';
      return { success: false, message: msg };
    }
  }

  // Autenticación con detección inteligente de roles
  public login(identifierOrEmail: string, password: string): { 
    success: boolean; 
    message: string; 
    details?: string[];
    user?: User 
  } {
    const cleanInput = identifierOrEmail.trim().toLowerCase();
    const users = this.getUsers();

    const user = users.find(
      u => u.correo.toLowerCase() === cleanInput || 
           u.identificadorInstitucional.toLowerCase() === cleanInput
    );

    if (!user) {
      const detectedRole = detectRoleFromIdentifier(cleanInput);
      let formatHint = 'Verifique su matrícula institucional (10 dígitos) o correo institucional (@alumnos.uat.edu.mx).';
      if (detectedRole === 'profesor') {
        formatHint = 'Verifique su NPO institucional o correo docente (@docentes.uat.edu.mx).';
      } else if (detectedRole === 'administrador') {
        formatHint = 'Verifique su credencial de administrador o correo (@uat.edu.mx).';
      }

      this.addAuditLog({
        tipo: 'login_fallido',
        identificador: identifierOrEmail,
        detalles: `Intento de acceso fallido: cuenta no encontrada (${detectedRole})`,
      });

      return { 
        success: false, 
        message: 'Credenciales inválidas. No se encontró ninguna cuenta asociada.',
        details: [formatHint, 'Si es nuevo ingreso, complete primero su Nuevo Registro.'],
      };
    }

    if (user.estado === 'bloqueado' || user.estado === 'inactivo') {
      this.addAuditLog({
        tipo: 'login_fallido',
        usuarioId: user.id,
        identificador: user.identificadorInstitucional,
        detalles: `Intento de acceso a cuenta ${user.estado}`,
      });
      return { 
        success: false, 
        message: `La cuenta se encuentra ${user.estado}.`,
        details: ['Contacte a la Dirección de Servicios Escolares de la UAT para su reactivación.'],
      };
    }

    if (user.passwordHash !== password) {
      this.addAuditLog({
        tipo: 'login_fallido',
        usuarioId: user.id,
        identificador: user.identificadorInstitucional,
        detalles: 'Contraseña incorrecta',
      });
      return { 
        success: false, 
        message: 'Contraseña incorrecta.',
        details: [
          'La clave ingresada no coincide con los registros institucionales de la UAT.',
          'Recuerde que distingue entre mayúsculas y minúsculas.',
          'Puede utilizar la pestaña "Recuperar Clave" para restablecerla.',
        ],
      };
    }

    user.ultimoAcceso = new Date().toISOString();
    this.saveUsers(users);
    this.setCurrentSession(user);

    this.addAuditLog({
      tipo: 'login_exitoso',
      usuarioId: user.id,
      identificador: user.identificadorInstitucional,
      detalles: `Inicio de sesión exitoso UAT como ${user.rol}: ${user.nombre} ${user.apellidos}`,
    });

    return { 
      success: true, 
      message: `Bienvenido(a) a la UAT, ${user.nombre}.`, 
      user 
    };
  }

  public logout(): void {
    const current = this.getCurrentSession();
    if (current) {
      this.addAuditLog({
        tipo: 'login_exitoso',
        usuarioId: current.id,
        identificador: current.identificadorInstitucional,
        detalles: 'Cierre de sesión institucional UAT',
      });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  public getCurrentSession(): User | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!data) return null;
      const cached = JSON.parse(data) as User;
      if (!cached || !cached.id) return null;
      const fresh = this.getUsers().find(u => u.id === cached.id || u.identificadorInstitucional.toUpperCase() === cached.identificadorInstitucional.toUpperCase());
      return fresh || cached;
    } catch {
      return null;
    }
  }

  public setCurrentSession(user: User): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }

  // Recuperación de Contraseña
  public requestPasswordReset(identifierOrEmail: string): { 
    success: boolean; 
    message: string; 
    details?: string[];
    resetRequest?: PasswordResetRequest;
    user?: User;
  } {
    const user = this.findUserByIdentifierOrEmail(identifierOrEmail);
    if (!user) {
      return { 
        success: false, 
        message: 'No se encontró ninguna cuenta asociada.',
        details: [
          'Asegúrese de ingresar su matrícula de 10 dígitos o correo institucional de la UAT.',
          'Ejemplo: a2243330309@alumnos.uat.edu.mx o 2243330309',
        ],
      };
    }

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiraEn = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const resetReq: PasswordResetRequest = {
      id: `rst-uat-${Date.now()}`,
      correo: user.correo,
      identificadorInstitucional: user.identificadorInstitucional,
      codigo: pin,
      creadoEn: new Date().toISOString(),
      expiraEn,
      usado: false,
    };

    const resets: PasswordResetRequest[] = this.getPasswordResets();
    resets.push(resetReq);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RESETS_STORAGE_KEY, JSON.stringify(resets));
    }

    this.addAuditLog({
      tipo: 'recuperacion_solicitada',
      usuarioId: user.id,
      identificador: user.identificadorInstitucional,
      detalles: `Código de seguridad UAT enviado al correo ${user.correo}`,
    });

    return {
      success: true,
      message: `Código de seguridad generado para el correo institucional ${user.correo}.`,
      resetRequest: resetReq,
      user,
    };
  }

  public getPasswordResets(): PasswordResetRequest[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(RESETS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public verifyResetCode(codigo: string, identifierOrEmail?: string): { 
    valid: boolean; 
    message: string; 
    resetReq?: PasswordResetRequest 
  } {
    const cleanCode = codigo.trim();
    const resets = this.getPasswordResets();
    const now = new Date();

    const match = resets.find(r => {
      const codeMatch = r.codigo === cleanCode && !r.usado;
      if (!codeMatch) return false;
      if (identifierOrEmail) {
        const cleanId = identifierOrEmail.trim().toLowerCase();
        return r.correo.toLowerCase() === cleanId || r.identificadorInstitucional.toLowerCase() === cleanId;
      }
      return true;
    });

    if (!match) {
      return { valid: false, message: 'El código de seguridad es inválido o ya ha sido utilizado.' };
    }

    if (new Date(match.expiraEn) < now) {
      return { valid: false, message: 'El código de seguridad ha expirado. Por favor solicite uno nuevo.' };
    }

    return { valid: true, message: 'Código verificado correctamente.', resetReq: match };
  }

  public confirmPasswordReset(codigo: string, newPassword: string): { 
    success: boolean; 
    message: string;
    details?: string[];
  } {
    const pwdVal = validatePassword(newPassword);
    if (!pwdVal.isValid) {
      return {
        success: false,
        message: pwdVal.error || 'La contraseña no cumple los requisitos.',
        details: pwdVal.details,
      };
    }

    const verification = this.verifyResetCode(codigo);
    if (!verification.valid || !verification.resetReq) {
      return { success: false, message: verification.message };
    }

    const resetReq = verification.resetReq;
    const users = this.getUsers();
    const user = users.find(u => u.correo.toLowerCase() === resetReq.correo.toLowerCase());

    if (!user) {
      return { success: false, message: 'Usuario no encontrado para aplicar el cambio.' };
    }

    user.passwordHash = newPassword;
    this.saveUsers(users);

    // Actualizar directamente en la base de datos de Supabase
    if (user.identificadorInstitucional) {
      supabase
        .from('usuarios')
        .update({ password: newPassword })
        .eq('matricula', user.identificadorInstitucional)
        .then(({ error }) => {
          if (error) console.warn('Aviso al actualizar password en Supabase:', error.message);
        });
    }

    const resets = this.getPasswordResets();
    const rIdx = resets.findIndex(r => r.id === resetReq.id);
    if (rIdx !== -1) {
      resets[rIdx].usado = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(RESETS_STORAGE_KEY, JSON.stringify(resets));
      }
    }

    this.addAuditLog({
      tipo: 'contrasena_restablecida',
      usuarioId: user.id,
      identificador: user.identificadorInstitucional,
      detalles: 'Restablecimiento exitoso de contraseña UAT',
    });

    return { 
      success: true, 
      message: 'Su contraseña ha sido restablecida exitosamente con el formato seguro de la UAT.' 
    };
  }

  // Bitácora de Auditoría
  public getAuditLogs(): AuditLog[] {
    if (typeof localStorage === 'undefined') return INITIAL_AUDIT_LOGS;
    try {
      const data = localStorage.getItem(AUDIT_STORAGE_KEY);
      return data ? JSON.parse(data) : INITIAL_AUDIT_LOGS;
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp' | 'ip'>): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id: `log-uat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ip: `148.217.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
      ...log,
    };
    logs.unshift(newLog);
    if (logs.length > 100) logs.pop();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
    }
  }

  // Reiniciar datos a defaults UAT
  public resetToDefaults(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(INITIAL_AUDIT_LOGS));
    localStorage.setItem(RESETS_STORAGE_KEY, JSON.stringify([]));
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export const authStore = new AuthStore();
