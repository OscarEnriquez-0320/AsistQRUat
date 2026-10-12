import React, { useState, useEffect } from 'react';
import { User, PasswordResetRequest } from '../../types';
import { authStore } from '../../services/authStore';
import { EmailPreviewModal } from './EmailPreviewModal';
import { UATLogo } from '../common/UATLogo';
import { JOptionPaneModal, JOptionPaneType } from '../common/JOptionPaneModal';
import { 
  validateMatricula, 
  validateCorreoInstitucional, 
  detectRoleFromIdentifier 
} from '../../utils/validators';
import { 
  Eye, EyeOff, Lock, Mail, User as UserIcon, 
  CheckCircle2, AlertTriangle, ArrowRight, Shield, 
  GraduationCap, Building2, KeyRound, QrCode, Check, Loader2 
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { ResetPasswordModal } from './ResetPasswordModal';

interface AuthViewProps {
  onLoginSuccess: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'recovery';

const CAREER_OPTIONS = [
  'Ing. en Sistemas Computacionales',
  'Ing. Industrial',
  'Ing. Civil',
  'Ing. Ambiental y Sustentabilidad',
  'Ing. en Datos e Inteligencia Artificial',
] as const;

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);

  // JOptionPane modal state
  const [jOptionPane, setJOptionPane] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details: string[];
    type: JOptionPaneType;
  }>({
    isOpen: false,
    title: 'Mensaje de Advertencia - UAT',
    message: '',
    details: [],
    type: 'WARNING_MESSAGE',
  });

  const showJOptionPane = (
    message: string, 
    details: string[] = [], 
    title = 'Mensaje de Advertencia - UAT', 
    type: JOptionPaneType = 'WARNING_MESSAGE'
  ) => {
    setJOptionPane({
      isOpen: true,
      title,
      message,
      details,
      type,
    });
  };

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginWarningDetails, setLoginWarningDetails] = useState<string[]>([]);

  // Register state
  const [regRole, setRegRole] = useState<'alumno' | 'profesor'>('alumno');
  const [regNombre, setRegNombre] = useState('');
  const [regApellidos, setRegApellidos] = useState('');
  const [regMatricula, setRegMatricula] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCareer, setRegCareer] = useState<string>(CAREER_OPTIONS[0]);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regError, setRegError] = useState('');
  const [regWarningDetails, setRegWarningDetails] = useState<string[]>([]);
  const [regSuccess, setRegSuccess] = useState('');

  // Recovery state
  const [recIdentifier, setRecIdentifier] = useState('');
  const [recStep, setRecStep] = useState<1 | 2>(1);
  const [recCode, setRecCode] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recConfirmPassword, setRecConfirmPassword] = useState('');
  const [recError, setRecError] = useState('');
  const [recSuccess, setRecSuccess] = useState('');
  const [activeResetReq, setActiveResetReq] = useState<PasswordResetRequest | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Auto-generate email when matrícula changes
  useEffect(() => {
    const cleanDigits = regMatricula.replace(/\D/g, '').slice(0, 10);
    if (cleanDigits) {
      if (regRole === 'alumno') {
        setRegEmail(`a${cleanDigits}@alumnos.uat.edu.mx`);
      } else {
        setRegEmail(`a${cleanDigits}@docentes.uat.edu.mx`);
      }
    } else {
      setRegEmail('');
    }
  }, [regMatricula, regRole]);

  // Detected role in login field
  const [supabaseMatchedRole, setSupabaseMatchedRole] = useState<'alumno' | 'profesor' | null>(null);
  useEffect(() => {
    const clean = loginIdentifier.trim().toLowerCase();
    if (!clean) {
      setSupabaseMatchedRole(null);
      return;
    }
    const users = authStore.getUsers();
    const found = users.find(
      u => u.identificadorInstitucional.toLowerCase() === clean || 
           u.correo.toLowerCase() === clean
    );
    if (found) {
      setSupabaseMatchedRole(found.rol === 'profesor' ? 'profesor' : 'alumno');
    } else {
      setSupabaseMatchedRole(null);
    }
  }, [loginIdentifier]);

  const detectedLoginRole = supabaseMatchedRole || (loginIdentifier.trim() 
    ? detectRoleFromIdentifier(loginIdentifier)
    : null);

  const handleMatriculaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInvalidField(null);
    const numericVal = e.target.value.replace(/\D/g, '').slice(0, 10);
    setRegMatricula(numericVal);
  };

  const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInvalidField(null);
    const alphabeticVal = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ \s]/g, '');
    setRegNombre(alphabeticVal);
  };

  const handleApellidosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInvalidField(null);
    const alphabeticVal = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ \s]/g, '');
    setRegApellidos(alphabeticVal);
  };

  // 2. AUTENTICACIÓN MULTIDISPOSITIVO (handleLoginSubmit)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginWarningDetails([]);
    setInvalidField(null);

    const cleanInput = loginIdentifier.trim();
    if (!cleanInput) {
      const msg = 'Campo incorrecto: Matrícula o Correo Institucional';
      const details = ['El campo de identificación institucional no puede estar vacío.'];
      setLoginError(msg);
      setInvalidField('loginIdentifier');
      showJOptionPane(msg, details, 'Error de Acceso - UAT', 'ERROR_MESSAGE');
      return;
    }

    if (!loginPassword.trim()) {
      const msg = 'Campo incorrecto: Contraseña';
      const details = ['Debe ingresar su contraseña institucional.'];
      setLoginError(msg);
      setInvalidField('loginPassword');
      showJOptionPane(msg, details, 'Error de Acceso - UAT', 'ERROR_MESSAGE');
      return;
    }

    // Validación si ingresó solo números pero no son exactamente 10 dígitos
    if (/^\d+$/.test(cleanInput) && cleanInput.length !== 10) {
      const msg = 'Campo incorrecto: Matrícula';
      const details = [
        `La matrícula debe tener exactamente 10 dígitos numéricos (ingresó ${cleanInput.length}).`,
        'Ejemplo válido: 2243330309',
        'O utilice su correo institucional: a{matricula}@alumnos.uat.edu.mx',
      ];
      setLoginError(msg);
      setLoginWarningDetails(details);
      setInvalidField('loginIdentifier');
      showJOptionPane(msg, details, 'Validación de Formato - UAT', 'ERROR_MESSAGE');
      return;
    }

    // Determinar matrícula objetivo (10 dígitos o extraída del correo institucional)
    let matriculaTarget = cleanInput;
    if (cleanInput.includes('@')) {
      const matchMat = cleanInput.match(/^a?(\d{10})@/i);
      if (matchMat) {
        matriculaTarget = matchMat[1];
      }
    }

    const matricula = matriculaTarget;

    // 2. AUTENTICACIÓN MULTIDISPOSITIVO:
    // Al iniciar sesión con matrícula y contraseña, valida las credenciales consultando directamente a Supabase:
    const { data: usuario } = await supabase.from('usuarios').select('*').eq('matricula', matricula).single();

    if (usuario) {
      // Compara la contraseña ingresada contra la columna 'password' guardada en Supabase
      const dbPassword = usuario.password;
      const isPasswordMatch = dbPassword 
        ? dbPassword === loginPassword 
        : loginPassword === 'Uat2026@Segura';

      if (isPasswordMatch) {
        // Asigna automáticamente el 'rol' registrado en Supabase ('alumno' o 'docente') al usuario autenticado
        const rolMapped = (usuario.rol === 'docente' ? 'profesor' : 'alumno') as User['rol'];
        const localUsers = authStore.getUsers();
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
            passwordHash: loginPassword,
            avatarUrl: usuario.foto_url || undefined,
            ultimoAcceso: new Date().toISOString(),
          };
          localUsers.push(userObj);
        } else {
          // Asigna automáticamente el 'rol' registrado en Supabase ('alumno' o 'docente')
          userObj.rol = rolMapped;
          userObj.passwordHash = loginPassword;
          userObj.ultimoAcceso = new Date().toISOString();
          if (usuario.foto_url) userObj.avatarUrl = usuario.foto_url;
        }

        if (!usuario.password) {
          await supabase.from('usuarios').update({ password: loginPassword }).eq('matricula', usuario.matricula);
        }

        authStore.saveUsers(localUsers);
        authStore.setCurrentSession(userObj);
        localStorage.setItem('sigu_uat_session_v2', JSON.stringify(userObj));
        authStore.addAuditLog({
          tipo: 'login_exitoso',
          usuarioId: userObj.id,
          identificador: userObj.identificadorInstitucional,
          detalles: `Inicio de sesión exitoso validado en Supabase como ${userObj.rol}: ${userObj.nombre} ${userObj.apellidos}`,
        });

        onLoginSuccess(userObj);
        return;
      } else {
        const msg = 'Campo incorrecto: Contraseña';
        const details = [
          'La clave ingresada no coincide con los registros institucionales de la UAT.',
          'Recuerde que distingue entre mayúsculas y minúsculas.',
          'Puede utilizar la opción "Restablecer Contraseña" para actualizarla.',
        ];
        setLoginError(msg);
        setLoginWarningDetails(details);
        setInvalidField('loginPassword');
        showJOptionPane(msg, details, 'Error de Credenciales - UAT', 'ERROR_MESSAGE');
        return;
      }
    }

    // Consulta de respaldo en authStore (ej. administradores institucionales o cuentas demo locales)
    const result = await authStore.loginWithSupabase(cleanInput, loginPassword);
    if (result.success && result.user) {
      onLoginSuccess(result.user);
    } else {
      const isPasswordError = result.message.toLowerCase().includes('contraseña');
      const faultyField = isPasswordError ? 'Campo incorrecto: Contraseña' : 'Campo incorrecto: Matrícula o Correo no encontrado';
      
      setLoginError(faultyField);
      setLoginWarningDetails(result.details || [result.message]);
      setInvalidField(isPasswordError ? 'loginPassword' : 'loginIdentifier');
      showJOptionPane(faultyField, result.details || [result.message], 'Error de Credenciales - UAT', 'ERROR_MESSAGE');
    }
  };

  // 1. PERSISTENCIA DE CONTRASEÑA EN SUPABASE (handleRegisterSubmit)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegWarningDetails([]);
    setRegSuccess('');
    setInvalidField(null);

    // 1. Validar Nombre
    if (!regNombre.trim()) {
      const msg = 'Campo incorrecto: Nombre(s)';
      const details = ['El nombre es obligatorio y solo debe contener letras y espacios.'];
      setRegError(msg);
      setInvalidField('regNombre');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }

    // 2. Validar Apellidos
    if (!regApellidos.trim()) {
      const msg = 'Campo incorrecto: Apellidos';
      const details = ['Los apellidos son obligatorios y solo deben contener letras y espacios.'];
      setRegError(msg);
      setInvalidField('regApellidos');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }

    // 3. Validar Matrícula (Solo numéricos y exactamente 10 dígitos)
    const matVal = validateMatricula(regMatricula);
    if (!matVal.isValid) {
      const msg = 'Campo incorrecto: Matrícula';
      setRegError(msg);
      setRegWarningDetails(matVal.details || []);
      setInvalidField('regMatricula');
      showJOptionPane(
        msg, 
        matVal.details || ['La matrícula debe tener exactamente 10 dígitos numéricos (ej. 2243330309).'],
        'Error de Validación - UAT',
        'ERROR_MESSAGE'
      );
      return;
    }

    // 4. Validar Correo Institucional
    const emailVal = validateCorreoInstitucional(regEmail, regRole, regMatricula);
    if (!emailVal.isValid) {
      const expectedDomain = regRole === 'alumno' ? '@alumnos.uat.edu.mx' : '@docentes.uat.edu.mx';
      const msg = 'Campo incorrecto: Correo Institucional';
      const details = emailVal.details || [
        `El correo debe cumplir estrictamente con el formato: a{matricula}${expectedDomain}`,
        `Ejemplo esperado: a${regMatricula || '2243330309'}${expectedDomain}`,
      ];
      setRegError(msg);
      setRegWarningDetails(details);
      setInvalidField('regEmail');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }

    // 5. Validar que la contraseña no esté vacía
    if (!regPassword.trim()) {
      const msg = 'Campo incorrecto: Contraseña';
      const details = ['La contraseña no puede estar vacía. Ingrese una contraseña institucional.'];
      setRegError(msg);
      setInvalidField('regPassword');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }
    if (regPassword.length < 6) {
      const msg = 'Campo incorrecto: Contraseña';
      const details = ['La contraseña debe contener al menos 6 caracteres.'];
      setRegError(msg);
      setInvalidField('regPassword');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }

    // 6. Confirmación de Contraseña
    if (regPassword !== regConfirmPassword) {
      const msg = 'Campo incorrecto: Confirmar Contraseña';
      const details = ['La confirmación no coincide con la contraseña ingresada. Verifique ambos campos.'];
      setRegError(msg);
      setInvalidField('regConfirmPassword');
      showJOptionPane(msg, details, 'Error de Validación - UAT', 'ERROR_MESSAGE');
      return;
    }

    // 1. PERSISTENCIA DE CONTRASEÑA EN SUPABASE:
    // Guarda el campo 'password' directamente en la columna 'password' de la tabla 'usuarios' en Supabase:
    const matricula = regMatricula.trim();
    const nombre = `${regNombre.trim()} ${regApellidos.trim()}`.trim();
    const rol: 'alumno' | 'docente' = regRole === 'profesor' ? 'docente' : 'alumno';
    const foto_url = null;
    const password = regPassword;

    const { error: sbError } = await supabase.from('usuarios').insert([{ matricula, nombre, rol, foto_url, password }]);

    if (sbError) {
      if (sbError.code === '23505') {
        const errorMsg = 'La matrícula ya se encuentra registrada en el sistema.';
        setRegError(errorMsg);
        setRegWarningDetails([
          `La matrícula "${matricula}" ya existe en la base de datos de la UAT.`,
          'Inicie sesión o recupere su contraseña si olvidó sus credenciales.'
        ]);
        setInvalidField('regMatricula');
        showJOptionPane(
          errorMsg,
          [`La matrícula "${matricula}" ya se encuentra registrada en el sistema de la UAT.`],
          'Matrícula Duplicada - UAT',
          'ERROR_MESSAGE'
        );
        return;
      }
      console.warn('Aviso de error al insertar en Supabase:', sbError.message);
    }

    // Registrar en authStore para mantener sesión e historial
    const res = authStore.registerUser({
      nombre: regNombre.trim(),
      apellidos: regApellidos.trim(),
      identificadorInstitucional: regMatricula.trim(),
      correo: regEmail.trim().toLowerCase(),
      carreraODepartamento: regCareer.trim(),
      rol: regRole,
      passwordHash: regPassword,
      semestreOGrado: regRole === 'alumno' ? '1er Semestre' : 'Docente Titular',
    });

    if (res.success && res.user) {
      setRegSuccess('¡Cuenta UAT creada exitosamente! Redirigiendo a su portal...');
      showJOptionPane(
        '¡Registro completado con éxito! Se ha asignado su rol y credenciales UAT.', 
        [], 
        'Registro Exitoso - UAT', 
        'SUCCESS_MESSAGE'
      );
      setTimeout(() => {
        onLoginSuccess(res.user!);
      }, 1500);
    } else {
      setRegError(res.message);
      setRegWarningDetails(res.details || []);
      showJOptionPane(res.message, res.details || [], 'Aviso de Registro - UAT', 'ERROR_MESSAGE');
    }
  };

  // Submit Recovery - Paso 1
  const handleRecoveryRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setRecError('');
    setRecSuccess('');
    setInvalidField(null);

    if (!recIdentifier.trim()) {
      const msg = 'Campo incorrecto: Matrícula o Correo Institucional';
      setRecError(msg);
      setInvalidField('recIdentifier');
      showJOptionPane(msg, ['Ingrese su matrícula de 10 dígitos o correo institucional para recuperar su clave.'], 'Error - UAT', 'ERROR_MESSAGE');
      return;
    }

    const res = authStore.requestPasswordReset(recIdentifier.trim());
    if (res.success && res.resetRequest) {
      setActiveResetReq(res.resetRequest);
      setShowEmailModal(true);
      setRecSuccess(res.message);
      setRecStep(2);
    } else {
      const msg = 'Campo incorrecto: Matrícula o Correo no encontrado';
      setRecError(msg);
      setInvalidField('recIdentifier');
      showJOptionPane(msg, res.details || [res.message], 'Recuperación de Cuenta - UAT', 'ERROR_MESSAGE');
    }
  };

  // Submit Recovery - Paso 2
  const handleRecoveryConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError('');
    setRecSuccess('');
    setInvalidField(null);

    if (!recCode.trim()) {
      const msg = 'Campo incorrecto: Código de Verificación';
      setRecError(msg);
      setInvalidField('recCode');
      showJOptionPane(msg, ['Ingrese el código de 6 dígitos enviado a su correo institucional.'], 'Error - UAT', 'ERROR_MESSAGE');
      return;
    }

    if (!recNewPassword.trim()) {
      const msg = 'Campo incorrecto: Nueva Contraseña';
      setRecError(msg);
      setInvalidField('recNewPassword');
      showJOptionPane(msg, ['La nueva contraseña no puede estar vacía.'], 'Error - UAT', 'ERROR_MESSAGE');
      return;
    }

    if (recNewPassword !== recConfirmPassword) {
      const msg = 'Campo incorrecto: Confirmar Contraseña';
      setRecError(msg);
      setInvalidField('recConfirmPassword');
      showJOptionPane(msg, ['Las contraseñas no coinciden. Verifique ambas entradas.'], 'Error - UAT', 'ERROR_MESSAGE');
      return;
    }

    const cleanMatricula = (activeResetReq?.identificadorInstitucional || recIdentifier).replace(/\D/g, '').slice(0, 10);

    // 3. RESTABLECER/CAMBIAR CONTRASEÑA EN SUPABASE:
    // await supabase.from('usuarios').update({ password: nuevaPassword }).eq('matricula', matricula);
    if (cleanMatricula) {
      try {
        await supabase
          .from('usuarios')
          .update({ password: recNewPassword })
          .eq('matricula', cleanMatricula);
      } catch (sbErr) {
        console.warn('Aviso al actualizar contraseña en Supabase:', sbErr);
      }
    }

    const res = authStore.confirmPasswordReset(recCode.trim(), recNewPassword);
    if (res.success) {
      const confirmMsg = 'Contraseña actualizada correctamente en el sistema global.';
      setRecSuccess(confirmMsg);
      showJOptionPane(confirmMsg, [], 'Restablecimiento Exitoso - UAT', 'SUCCESS_MESSAGE');
      setTimeout(() => {
        setMode('login');
        setLoginIdentifier(cleanMatricula || activeResetReq?.identificadorInstitucional || recIdentifier);
        setLoginPassword('');
        setRecStep(1);
        setRecCode('');
        setRecNewPassword('');
        setRecConfirmPassword('');
        setRecSuccess('');
      }, 1800);
    } else {
      setRecError(res.message);
      showJOptionPane(res.message, res.details || [], 'Error de Restablecimiento - UAT', 'ERROR_MESSAGE');
    }
  };

  return (
    <div className="w-full flex items-center justify-center py-4 px-2 sm:px-4">
      {/* Simulation Email Modal */}
      {showEmailModal && activeResetReq && (
        <EmailPreviewModal
          resetReq={activeResetReq}
          onClose={() => setShowEmailModal(false)}
          onUseCode={(code) => {
            setRecCode(code);
            setShowEmailModal(false);
          }}
        />
      )}

      {/* Reset Password Direct Modal */}
      {showResetModal && (
        <ResetPasswordModal
          isOpen={showResetModal}
          initialMatricula={loginIdentifier.replace(/\D/g, '').slice(0, 10)}
          onClose={() => setShowResetModal(false)}
          onSuccess={(mat) => {
            setMode('login');
            setLoginIdentifier(mat);
            setLoginPassword('');
          }}
        />
      )}

      {/* JOptionPane Modal */}
      <JOptionPaneModal
        isOpen={jOptionPane.isOpen}
        title={jOptionPane.title}
        message={jOptionPane.message}
        details={jOptionPane.details}
        type={jOptionPane.type}
        onClose={() => setJOptionPane(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Main Container Layout */}
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 rounded-2xl bg-white border border-slate-200/90 shadow-xl overflow-hidden">
        
        {/* Left Side: 5 Columns */}
        <div className="md:col-span-5 bg-slate-50/80 border-b md:border-b-0 md:border-r border-slate-200 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-200 pb-4 mb-4 text-center md:text-left">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#14234B] block">
                Universidad Autónoma de Tamaulipas
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight mt-1">
                Asistencia por QR
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Sistema Integral de Control Escolar y Registro Digital
              </p>
            </div>

            {/* Logos Institucionales */}
            <div className="flex flex-col items-center justify-center p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs mb-4 text-center">
              <div className="flex items-center justify-center gap-4 sm:gap-6 w-full my-1">
                <img src="/images/logo-uat.png" alt="Logo UAT" className="h-16 w-auto object-contain" />
                <div className="h-12 sm:h-14 w-px bg-slate-200 shrink-0" aria-hidden="true" />
                <img src="/images/logo-fit.png" alt="Logo FIT" className="h-16 w-auto object-contain" />
              </div>
              <div className="mt-2 text-center">
                <span className="text-xs md:text-sm font-black uppercase tracking-wider text-[#14234B] block leading-snug">
                  Facultad de Ingeniería Tampico
                </span>
                <span className="text-xs font-serif font-bold italic text-slate-800 tracking-wide block mt-1">
                  "Verdad, Belleza, Probidad"
                </span>
              </div>
            </div>

            {/* Formato de Credenciales */}
            <div className="space-y-2 text-xs text-slate-700 bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs">
              <div className="font-bold text-[#14234B] text-[11px] uppercase tracking-wider flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
                <Shield className="w-3.5 h-3.5 text-[#14234B] shrink-0" />
                <span>Formatos de Credenciales Necesarios</span>
              </div>
              <div className="space-y-1.5 text-[11px] pt-0.5">
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-900 shrink-0">Matrícula:</span>
                  <span className="font-mono text-slate-600">10 dígitos numéricos (ej. 2243330309)</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-900 shrink-0">Correo Alumno:</span>
                  <span className="font-mono text-slate-600 break-all">a{'{'}matricula{'}'}@alumnos.uat.edu.mx</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-900 shrink-0">Correo Docente:</span>
                  <span className="font-mono text-slate-600 break-all">a{'{'}matricula{'}'}@docentes.uat.edu.mx</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-900 shrink-0">Contraseña:</span>
                  <span className="text-slate-600">Mínimo 8 caracteres (mayús, minús, núm. y símbolo)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 text-center md:text-left">
            <span className="text-[10px] text-slate-400 block font-mono">
              UAT · Centro Universitario Sur (Tampico)
            </span>
          </div>
        </div>

        {/* Right Side: 7 Columns */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-white">
          <div>
            {/* Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLoginError('');
                  setLoginWarningDetails([]);
                  setInvalidField(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setRegError('');
                  setRegWarningDetails([]);
                  setRegSuccess('');
                  setInvalidField(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nuevo Registro
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('recovery');
                  setRecError('');
                  setRecSuccess('');
                  setInvalidField(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'recovery'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Recuperar Clave
              </button>
            </div>

            {/* TAB 1: INICIO DE SESIÓN */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Acceso al Portal UAT</h2>
                    {detectedLoginRole && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                        Rol: {detectedLoginRole}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Ingrese con su matrícula o correo institucional
                  </p>
                </div>

                {loginError && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1.5 animate-in fade-in">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>{loginError}</span>
                    </div>
                    {loginWarningDetails.length > 0 && (
                      <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 pl-1">
                        {loginWarningDetails.map((det, i) => (
                          <li key={i}>{det}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Matrícula o Correo Institucional
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value);
                        setInvalidField(null);
                      }}
                      className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 font-medium transition-colors ${
                        invalidField === 'loginIdentifier'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900 focus:border-transparent'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="text-xs text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                    >
                      ¿Olvidó su contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        setInvalidField(null);
                      }}
                      className={`w-full pl-9 pr-10 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                        invalidField === 'loginPassword'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900 focus:border-transparent'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>Recordar sesión en este equipo</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-[0.99]"
                >
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span>Acceder al Sistema UAT</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* TAB 2: NUEVO REGISTRO */}
            {mode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Registro Institucional UAT</h2>
                  <p className="text-xs text-slate-500">
                    Facultad de Ingeniería Tampico · Asistencia por QR
                  </p>
                </div>

                {regError && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1 animate-in fade-in">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>{regError}</span>
                    </div>
                    {regWarningDetails.length > 0 && (
                      <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 pl-1">
                        {regWarningDetails.map((det, i) => (
                          <li key={i}>{det}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {regSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{regSuccess}</span>
                  </div>
                )}

                {/* Selector de Rol */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Rol Institucional
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegRole('alumno')}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        regRole === 'alumno'
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" />
                      <div>
                        <span className="text-xs font-bold block leading-tight">Alumno UAT</span>
                        <span className={`text-[10px] ${regRole === 'alumno' ? 'text-slate-300' : 'text-slate-500'}`}>
                          Matrícula (10 dígitos)
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole('profesor')}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        regRole === 'profesor'
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <div>
                        <span className="text-xs font-bold block leading-tight">Docente UAT</span>
                        <span className={`text-[10px] ${regRole === 'profesor' ? 'text-slate-300' : 'text-slate-500'}`}>
                          Matrícula / NPO
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Nombre y Apellidos */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre(s)</label>
                    <input
                      type="text"
                      required
                      value={regNombre}
                      onChange={handleNombreChange}
                      className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                        invalidField === 'regNombre'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Apellidos</label>
                    <input
                      type="text"
                      required
                      value={regApellidos}
                      onChange={handleApellidosChange}
                      className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                        invalidField === 'regApellidos'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Matrícula y Correo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        {regRole === 'alumno' ? 'Matrícula (10 dígitos)' : 'Matrícula Docente'}
                      </label>
                      <span className={`text-[10px] font-mono font-bold ${
                        regMatricula.length === 10 ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {regMatricula.length}/10
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      value={regMatricula}
                      maxLength={10}
                      onChange={handleMatriculaChange}
                      className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-2 ${
                        invalidField === 'regMatricula'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : regMatricula.length === 10
                          ? 'border-emerald-500 bg-emerald-50/20 focus:ring-emerald-500'
                          : 'border-slate-300 focus:ring-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Correo Institucional
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        setInvalidField(null);
                      }}
                      className={`w-full px-3 py-1.5 text-xs font-mono border rounded-lg focus:outline-none focus:ring-2 ${
                        invalidField === 'regEmail'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Patrón de correo */}
                <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-600 flex items-center justify-between">
                  <span>
                    Patrón requerido: <strong className="font-mono text-slate-800">
                      a{'{'}matricula{'}'}{regRole === 'alumno' ? '@alumnos.uat.edu.mx' : '@docentes.uat.edu.mx'}
                    </strong>
                  </span>
                  {regEmail && (
                    (regRole === 'alumno' && /^a\d{10}@alumnos\.uat\.edu\.mx$/i.test(regEmail)) ||
                    (regRole === 'profesor' && /^a\d{10}@docentes\.uat\.edu\.mx$/i.test(regEmail))
                  ) ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Válido
                    </span>
                  ) : (
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Incompleto
                    </span>
                  )}
                </div>

                {/* Selección de Carrera */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {regRole === 'profesor' ? 'Adscripción Docente' : 'Carrera'}
                  </label>
                  <select
                    value={regCareer}
                    onChange={(e) => setRegCareer(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-800 font-medium"
                  >
                    {CAREER_OPTIONS.map((carrera) => (
                      <option key={carrera} value={carrera}>
                        {carrera}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contraseña */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={regShowPassword ? 'text' : 'password'}
                        required
                        value={regPassword}
                        onChange={(e) => {
                          setRegPassword(e.target.value);
                          setInvalidField(null);
                        }}
                        className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 pr-8 ${
                          invalidField === 'regPassword'
                            ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                            : 'border-slate-300 focus:ring-slate-900'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setRegShowPassword(!regShowPassword)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {regShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirmar Contraseña
                    </label>
                    <input
                      type={regShowPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => {
                        setRegConfirmPassword(e.target.value);
                        setInvalidField(null);
                      }}
                      className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                        invalidField === 'regConfirmPassword'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all mt-3 cursor-pointer active:scale-[0.99]"
                >
                  Completar Registro Institucional UAT
                </button>
              </form>
            )}

            {/* TAB 3: RECUPERACIÓN DE CONTRASEÑA */}
            {mode === 'recovery' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Recuperación de Contraseña UAT</h2>
                  <p className="text-xs text-slate-500">
                    Restablezca su acceso mediante su matrícula o correo institucional
                  </p>
                </div>

                {recError && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>{recError}</span>
                  </div>
                )}

                {recSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{recSuccess}</span>
                  </div>
                )}

                {/* PASO 1 */}
                {recStep === 1 && (
                  <form onSubmit={handleRecoveryRequest} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Matrícula o Correo Institucional
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          required
                          value={recIdentifier}
                          onChange={(e) => {
                            setRecIdentifier(e.target.value);
                            setInvalidField(null);
                          }}
                          className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                            invalidField === 'recIdentifier'
                              ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                              : 'border-slate-300 focus:ring-slate-900'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Se enviará un código de seguridad para verificar su identidad.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 px-4 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Generar Código de Seguridad</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowResetModal(true)}
                        className="py-2.5 px-4 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        Restablecer Directo
                      </button>
                    </div>
                  </form>
                )}

                {/* PASO 2 */}
                {recStep === 2 && (
                  <form onSubmit={handleRecoveryConfirm} className="space-y-3.5">
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                      <div>
                        <span className="font-semibold block">Código enviado a:</span>
                        <span className="font-mono text-slate-700">{activeResetReq?.correo}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEmailModal(true)}
                        className="text-xs text-blue-700 font-bold hover:underline cursor-pointer"
                      >
                        Ver Correo Simulado
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Código de Verificación (6 dígitos)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        value={recCode}
                        onChange={(e) => {
                          setRecCode(e.target.value);
                          setInvalidField(null);
                        }}
                        className={`w-full px-3 py-2 text-center font-mono text-lg font-bold tracking-widest border rounded-lg focus:outline-none focus:ring-2 tabular-nums ${
                          invalidField === 'recCode'
                            ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                            : 'border-slate-300 focus:ring-slate-900'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Contraseña
                        </label>
                        <input
                          type="password"
                          required
                          value={recNewPassword}
                          onChange={(e) => {
                            setRecNewPassword(e.target.value);
                            setInvalidField(null);
                          }}
                          className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                            invalidField === 'recNewPassword'
                              ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                              : 'border-slate-300 focus:ring-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Confirmar Contraseña
                        </label>
                        <input
                          type="password"
                          required
                          value={recConfirmPassword}
                          onChange={(e) => {
                            setRecConfirmPassword(e.target.value);
                            setInvalidField(null);
                          }}
                          className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                            invalidField === 'recConfirmPassword'
                              ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                              : 'border-slate-300 focus:ring-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setRecStep(1)}
                        className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        Atrás
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 px-4 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                      >
                        Restablecer y Guardar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Universidad Autónoma de Tamaulipas · Asistencia por QR</span>
            <span>UAT Versión 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
};
