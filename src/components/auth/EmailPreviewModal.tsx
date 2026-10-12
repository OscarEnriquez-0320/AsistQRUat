import React, { useState } from 'react';
import { Mail, Check, Copy, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { PasswordResetRequest } from '../../types';

interface EmailPreviewModalProps {
  resetReq: PasswordResetRequest;
  onClose: () => void;
  onUseCode: (code: string) => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({
  resetReq,
  onClose,
  onUseCode,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(resetReq.codigo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header de la simulación de correo */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Simulación de Bandeja Institucional</p>
              <h4 className="text-sm font-semibold tracking-tight">Correo Universitario Recibido</h4>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
            title="Cerrar vista previa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido del correo institucional */}
        <div className="p-6 space-y-5 bg-white">
          <div className="border-b border-slate-100 pb-4 text-xs space-y-1.5 text-slate-600">
            <div className="flex justify-between">
              <span className="font-medium text-slate-900">De:</span>
              <span className="font-mono text-slate-700">soporte-sistemas@universidad.edu</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-slate-900">Para:</span>
              <span className="font-mono text-slate-800 font-semibold">{resetReq.correo}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-slate-900">Asunto:</span>
              <span className="text-slate-800 font-medium">
                [SIGU] Código de seguridad para restablecer contraseña institucional
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-700">
            <p>Estimado(a) integrante de la comunidad universitaria,</p>
            <p className="text-xs leading-relaxed text-slate-600">
              Hemos recibido una solicitud para restablecer el acceso a su cuenta en el Portal Institucional 
              asociada a la matrícula o NPO <span className="font-semibold text-slate-900">{resetReq.identificadorInstitucional}</span>.
            </p>

            <div className="my-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-medium block mb-1">
                Su código de verificación temporal
              </span>
              <div className="font-mono text-3xl font-extrabold tracking-widest text-slate-900 my-2 select-all tabular-nums">
                {resetReq.codigo}
              </div>
              <p className="text-xs text-slate-500">
                Este código expira en 15 minutos. No comparta este PIN con nadie.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200/80 p-2.5 rounded-lg text-amber-800">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Si usted no solicitó este cambio, ignore este mensaje. Su cuenta continuará protegida.</span>
            </div>
          </div>

          {/* Acciones del simulador */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '¡Código Copiado!' : 'Copiar Código'}
            </button>
            <button
              type="button"
              onClick={() => {
                onUseCode(resetReq.codigo);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <span>Aplicar Código al Formulario</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
