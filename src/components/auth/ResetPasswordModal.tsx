import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, CheckCircle2, AlertTriangle, X, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { authStore } from '../../services/authStore';
import { validatePassword } from '../../utils/validators';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMatricula?: string;
  onSuccess?: (matricula: string) => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  initialMatricula = '',
  onSuccess,
}) => {
  const [matricula, setMatricula] = useState<string>(initialMatricula);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setMatricula(initialMatricula || '');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen, initialMatricula]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanMatricula = matricula.replace(/\D/g, '').slice(0, 10);
    if (!cleanMatricula || cleanMatricula.length !== 10) {
      setErrorMsg('Ingrese una matrícula institucional válida de 10 dígitos numéricos.');
      return;
    }

    if (!newPassword.trim()) {
      setErrorMsg('La nueva contraseña no puede estar vacía.');
      return;
    }

    const val = validatePassword(newPassword);
    if (!val.isValid) {
      setErrorMsg(val.error || 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula y número.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden. Verifique ambas entradas.');
      return;
    }

    setLoading(true);

    try {
      // 3. RESTABLECER CONTRASEÑA GLOBAL (ResetPasswordModal.tsx):
      // Al restablecer o cambiar la contraseña de una matrícula, realiza un UPDATE directo en la base de datos de Supabase:
      const matricula = cleanMatricula;
      const nuevaPassword = newPassword;
      const { error: updateError } = await supabase.from('usuarios').update({ password: nuevaPassword }).eq('matricula', matricula);

      if (updateError) {
        setErrorMsg(`Error al actualizar en la base de datos: ${updateError.message}`);
        setLoading(false);
        return;
      }

      // Sincronizar también en authStore local para consistencia inmediata
      const users = authStore.getUsers();
      const localIdx = users.findIndex(
        u => u.identificadorInstitucional.toUpperCase() === cleanMatricula.toUpperCase()
      );
      if (localIdx !== -1) {
        users[localIdx].passwordHash = newPassword;
        authStore.saveUsers(users);
        const currentSession = authStore.getCurrentSession();
        if (currentSession && currentSession.identificadorInstitucional.toUpperCase() === cleanMatricula.toUpperCase()) {
          authStore.setCurrentSession({ ...currentSession, passwordHash: newPassword });
        }
      }

      // Notificar al usuario cuando la actualización en Supabase sea exitosa
      const confirmationText = '¡Contraseña actualizada exitosamente en Supabase!';
      setSuccessMsg(confirmationText);

      setTimeout(() => {
        if (onSuccess) {
          onSuccess(cleanMatricula);
        }
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la base de datos.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        
        {/* Encabezado UAT */}
        <div className="bg-gradient-to-r from-[#14234B] to-[#1E3A8A] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <KeyRound className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Restablecer Contraseña</h3>
              <p className="text-xs text-blue-200">Base de Datos Global de Supabase</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Mensajes de Alerta */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="leading-relaxed font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="leading-relaxed font-semibold">{successMsg}</div>
            </div>
          )}

          {/* Campo: Matrícula */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Matrícula Institucional (10 dígitos)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Shield className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Ej. 2243330309"
                maxLength={10}
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#14234B] focus:border-[#14234B] font-mono tracking-wider transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Matrícula de la cuenta cuya contraseña se actualizará en Supabase.
            </p>
          </div>

          {/* Campo: Nueva Contraseña */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Nueva Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres, mayúscula y número"
                required
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#14234B] focus:border-[#14234B] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Campo: Confirmar Contraseña */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita la nueva contraseña"
                required
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#14234B] focus:border-[#14234B] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nota informativa */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-[11px] text-blue-800 leading-relaxed">
            Esta acción ejecutará una actualización en tiempo real en la columna <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900 font-bold">password</code> de la tabla <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900 font-bold">usuarios</code> en Supabase, permitiendo autenticación inmediata en cualquier dispositivo.
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#14234B] hover:bg-[#1E3A8A] active:scale-[0.98] rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Actualizando en Supabase...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 text-amber-300" />
                  Actualizar Contraseña Global
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
