import React, { useState, useEffect } from 'react';
import { User, AuditLog, UserRole } from '../../types';
import { authStore } from '../../services/authStore';
import { attendanceStore, AttendanceRecord } from '../../services/attendanceStore';
import { UATLogo } from '../common/UATLogo';
import { JOptionPaneModal } from '../common/JOptionPaneModal';
import { 
  validateMatricula, 
  validateCorreoInstitucional, 
  validatePassword
} from '../../utils/validators';
import { 
  Search, Plus, CheckCircle2, X, LogOut 
} from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  activeTab: string;
  onUserUpdate: (updated: User) => void;
  onLogout?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  activeTab,
  onLogout,
}) => {
  const [users, setUsers] = useState<User[]>(authStore.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(authStore.getAuditLogs());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(attendanceStore.getAllRecords());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activo' | 'inactivo'>('todos');

  useEffect(() => {
    const unsub = attendanceStore.subscribe(() => {
      setAttendanceRecords(attendanceStore.getAllRecords());
    });
    return () => unsub();
  }, []);

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newApellidos, setNewApellidos] = useState('');
  const [newCorreo, setNewCorreo] = useState('');
  const [newId, setNewId] = useState('');
  const [newRol, setNewRol] = useState<UserRole>('alumno');
  const [newCarrera, setNewCarrera] = useState('Ing. en Sistemas Computacionales');
  const [newPassword, setNewPassword] = useState('Uat2026@Segura');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const [isJOptionPaneOpen, setIsJOptionPaneOpen] = useState(false);
  const [jOptionDetails, setJOptionDetails] = useState<string[]>([]);
  const [jOptionMsg, setJOptionMsg] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const refreshData = () => {
    setUsers(authStore.getUsers());
    setAuditLogs(authStore.getAuditLogs());
  };

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(''), 4000);
  };

  const handleToggleStatus = (targetUser: User) => {
    const res = authStore.toggleUserStatus(targetUser.id);
    if (res.success) {
      refreshData();
      showNotice(`Estatus de ${targetUser.nombre} (${targetUser.identificadorInstitucional}) actualizado a: ${res.newStatus}.`);
    }
  };

  const handleResetPasswordAdmin = (targetUser: User) => {
    const tempPass = 'Uat2026@Temporal';
    const res = authStore.updateUser(targetUser.id, { passwordHash: tempPass });
    if (res.success) {
      authStore.addAuditLog({
        tipo: 'contrasena_restablecida',
        usuarioId: targetUser.id,
        identificador: targetUser.identificadorInstitucional,
        detalles: `Restablecimiento administrativo de contraseña a: ${tempPass}`,
      });
      refreshData();
      showNotice(`Contraseña de ${targetUser.nombre} restablecida a: "${tempPass}".`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (newRol === 'alumno') {
      const matVal = validateMatricula(newId);
      if (!matVal.isValid) {
        setFormError(matVal.error || 'Matrícula inválida.');
        setJOptionMsg(matVal.error || 'Matrícula UAT inválida.');
        setJOptionDetails(matVal.details || []);
        setIsJOptionPaneOpen(true);
        return;
      }
    }

    const emailVal = validateCorreoInstitucional(newCorreo, newRol, newId);
    if (!emailVal.isValid) {
      setFormError(emailVal.error || 'Correo institucional inválido.');
      setJOptionMsg(emailVal.error || 'Correo UAT inválido.');
      setJOptionDetails(emailVal.details || []);
      setIsJOptionPaneOpen(true);
      return;
    }

    const pwdVal = validatePassword(newPassword);
    if (!pwdVal.isValid) {
      setFormError(pwdVal.error || 'Contraseña insegura.');
      setJOptionMsg(pwdVal.error || 'Contraseña no cumple requisitos UAT.');
      setJOptionDetails(pwdVal.details || []);
      setIsJOptionPaneOpen(true);
      return;
    }

    const res = await authStore.registerUserAsync({
      nombre: newNombre.trim(),
      apellidos: newApellidos.trim(),
      correo: newCorreo.trim().toLowerCase(),
      identificadorInstitucional: newId.trim(),
      rol: newRol,
      carreraODepartamento: newCarrera.trim(),
      passwordHash: newPassword,
    });

    if (res.success) {
      refreshData();
      setFormSuccess('Usuario institucional UAT registrado correctamente en Supabase.');
      setTimeout(() => {
        setIsAddUserOpen(false);
        setFormSuccess('');
        setNewNombre('');
        setNewApellidos('');
        setNewCorreo('');
        setNewId('');
      }, 1500);
    } else {
      setFormError(res.message);
      setJOptionMsg(res.message);
      setJOptionDetails(res.details || []);
      setIsJOptionPaneOpen(true);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = 
      u.nombre.toLowerCase().includes(q) ||
      u.apellidos.toLowerCase().includes(q) ||
      u.correo.toLowerCase().includes(q) ||
      u.identificadorInstitucional.toLowerCase().includes(q);
    
    const matchRole = roleFilter === 'todos' || u.rol === roleFilter;
    const matchStatus = statusFilter === 'todos' || u.estado === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="space-y-6">
      <JOptionPaneModal
        isOpen={isJOptionPaneOpen}
        onClose={() => setIsJOptionPaneOpen(false)}
        title="Validación Administrativa - UAT"
        message={jOptionMsg}
        details={jOptionDetails}
        type="WARNING_MESSAGE"
      />

      {/* Header Admin */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
            <UATLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                Administración UAT
              </span>
              <span>·</span>
              <span>ID: <strong className="font-mono text-slate-900">{user.identificadorInstitucional}</strong></span>
              <span>·</span>
              <span>Servicios Escolares</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Dirección de Control Escolar y Asistencia por QR
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Universidad Autónoma de Tamaulipas · Padrón Oficial de Alumnos y Docentes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddUserOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Nuevo Usuario UAT</span>
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
              title="Cerrar sesión institucional UAT"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Cerrar Sesión</span>
            </button>
          )}
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* TAB: USUARIOS */}
      {(activeTab === 'usuarios' || activeTab === 'inicio') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Padrón Institucional de Usuarios UAT</h2>
              <p className="text-xs text-slate-500">Gestión de matrículas (10 dígitos), correos institucionales y roles sincronizados con Supabase</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar matrícula o correo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-none w-52"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 text-slate-700 font-medium"
              >
                <option value="todos">Todos los Roles</option>
                <option value="alumno">Alumnos</option>
                <option value="profesor">Docentes</option>
                <option value="administrador">Administradores</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Matrícula / ID</th>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Correo Institucional UAT</th>
                  <th className="px-6 py-3 text-center">Rol</th>
                  <th className="px-6 py-3 text-center">Estatus</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono font-bold text-slate-900">
                      {u.identificadorInstitucional}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {u.nombre} {u.apellidos}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-600">
                      {u.correo}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                        u.rol === 'alumno' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : u.rol === 'profesor' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                          u.estado === 'activo'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {u.estado}
                      </button>
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleResetPasswordAdmin(u)}
                        title="Restablecer a contraseña segura temporal"
                        className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                      >
                        Reset Clave
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: ASISTENCIA POR QR */}
      {activeTab === 'asistencia-qr' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Monitoreo General de Asistencia por QR (UAT)</h2>
              <p className="text-xs text-slate-500">Sesiones de clase y asistencias sincronizadas con control escolar</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              Sistema Operativo y Sincronizado
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Total de Alumnos</span>
              <span className="text-2xl font-bold font-mono text-slate-900">
                {users.filter(u => u.rol === 'alumno').length}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Plantilla Docente Activa</span>
              <span className="text-2xl font-bold font-mono text-slate-900">
                {users.filter(u => u.rol === 'profesor').length}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Registros QR de Hoy</span>
              <span className="text-2xl font-bold font-mono text-emerald-700">{attendanceRecords.length} pases</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB: AUDITORÍA */}
      {activeTab === 'auditoria' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900">Bitácora de Accesos y Seguridad UAT</h2>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900">{log.identificador}</span>
                  <span className="text-slate-500 ml-2">{log.detalles}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(log.timestamp).toLocaleString('es-MX')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Agregar Usuario */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Registrar Usuario en el Sistema UAT</h3>
              <button onClick={() => setIsAddUserOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {formError && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
                {formSuccess}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rol</label>
                <select
                  value={newRol}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setNewRol(r);
                    if (r === 'alumno' && newId.length === 10) {
                      setNewCorreo(`a${newId}@alumnos.uat.edu.mx`);
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                >
                  <option value="alumno">Alumno (Matrícula 10 dígitos)</option>
                  <option value="profesor">Docente (NPO)</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    placeholder="Ej. Valeria"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Apellidos</label>
                  <input
                    type="text"
                    required
                    value={newApellidos}
                    onChange={(e) => setNewApellidos(e.target.value)}
                    placeholder="Ej. Mendoza Flores"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {newRol === 'alumno' ? 'Matrícula (10 dígitos)' : 'Identificador / NPO'}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={newRol === 'alumno' ? 10 : 15}
                    value={newId}
                    onChange={(e) => {
                      const val = newRol === 'alumno' ? e.target.value.replace(/\D/g, '') : e.target.value;
                      setNewId(val);
                      if (newRol === 'alumno' && val.length === 10) {
                        setNewCorreo(`a${val}@alumnos.uat.edu.mx`);
                      }
                    }}
                    placeholder={newRol === 'alumno' ? '2243330309' : 'NPO-5010'}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo Institucional</label>
                  <input
                    type="email"
                    required
                    value={newCorreo}
                    onChange={(e) => setNewCorreo(e.target.value)}
                    placeholder={newRol === 'alumno' ? 'a2243330309@alumnos.uat.edu.mx' : 'docente@docentes.uat.edu.mx'}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Carrera / Programa</label>
                <select
                  value={newCarrera}
                  onChange={(e) => setNewCarrera(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800"
                >
                  <option value="Ing. en Sistemas Computacionales">Ing. en Sistemas Computacionales</option>
                  <option value="Ing. Industrial">Ing. Industrial</option>
                  <option value="Ing. Civil">Ing. Civil</option>
                  <option value="Ing. Ambiental y Sustentabilidad">Ing. Ambiental y Sustentabilidad</option>
                  <option value="Ing. en Datos e Inteligencia Artificial">Ing. en Datos e Inteligencia Artificial</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contraseña Inicial</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mín. 8 caract., mayús, minús, núm. y especial"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
                >
                  Guardar en UAT y Supabase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
