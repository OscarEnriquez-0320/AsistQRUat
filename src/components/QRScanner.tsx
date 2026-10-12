import React from 'react';
import { StudentQRScannerModal } from './attendance/StudentQRScannerModal';
import { User } from '../types';

export interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onAttendanceSuccess?: () => void;
}

/**
 * Componente QRScanner para escaneo optimizado en móvil y escritorio
 * Reutiliza y canaliza StudentQRScannerModal con soporte completo
 */
export const QRScanner: React.FC<QRScannerProps> = (props) => {
  return <StudentQRScannerModal {...props} />;
};

export default QRScanner;
