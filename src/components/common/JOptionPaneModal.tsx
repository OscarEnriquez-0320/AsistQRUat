import React, { useEffect } from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle } from 'lucide-react';

export type JOptionPaneType = 'WARNING_MESSAGE' | 'ERROR_MESSAGE' | 'INFORMATION_MESSAGE' | 'SUCCESS_MESSAGE';

interface JOptionPaneModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  details?: string[];
  type?: JOptionPaneType;
}

export const JOptionPaneModal: React.FC<JOptionPaneModalProps> = ({
  isOpen,
  onClose,
  title = 'Mensaje de Advertencia - Formato Inválido',
  message,
  details = [],
  type = 'WARNING_MESSAGE',
}) => {
  // Listen for Enter or Escape to dismiss dialog like in Java Swing
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (type) {
      case 'WARNING_MESSAGE':
        return (
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0 border border-amber-300 shadow-inner">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          </div>
        );
      case 'ERROR_MESSAGE':
        return (
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center shrink-0 border border-rose-300 shadow-inner">
            <XCircle className="w-7 h-7 text-rose-600" />
          </div>
        );
      case 'SUCCESS_MESSAGE':
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-300 shadow-inner">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
        );
      case 'INFORMATION_MESSAGE':
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-300 shadow-inner">
            <Info className="w-7 h-7 text-blue-600" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="joptionpane-title"
      >
        {/* Title Bar */}
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span id="joptionpane-title" className="text-xs font-bold text-slate-700 font-mono tracking-tight">
              {title}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
            JOptionPane
          </span>
        </div>

        {/* Dialog Body */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {renderIcon()}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                {message}
              </h4>
              {details && details.length > 0 && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-500 block">
                    Criterios obligatorios no cumplidos:
                  </span>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-600 font-medium">
                    {details.map((detail, idx) => (
                      <li key={idx} className="leading-snug">{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 rounded-lg shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-slate-700"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
