import jsQR from 'jsqr';

/**
 * Decodifica un código QR a partir de un archivo de imagen (PNG, JPG, WEBP, etc.)
 * utilizando la librería jsQR y un canvas HTML5 en memoria.
 */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se seleccionó ningún archivo.'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida (debe ser PNG, JPG, WEBP, etc.).'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Redimensionar proporcionalmente si la foto tomada por la cámara del celular es muy grande (ej. > 1200px)
          const maxDimension = 1200;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);

          // Intento 1: lectura directa con soporte para inversión de colores
          let code = jsQR(imageData.data, width, height, {
            inversionAttempts: 'attemptBoth',
          });

          // Intento 2: si no se detecta (p. ej. foto tomada con sombras o bajo contraste), ajustar luminancia
          if (!code) {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;
              // Alto contraste binarizado
              const binarized = gray > 128 ? 255 : 0;
              data[i] = binarized;
              data[i + 1] = binarized;
              data[i + 2] = binarized;
            }
            ctx.putImageData(imageData, 0, 0);
            const highContrastData = ctx.getImageData(0, 0, width, height);
            code = jsQR(highContrastData.data, width, height, {
              inversionAttempts: 'attemptBoth',
            });
          }

          if (code && code.data && code.data.trim()) {
            resolve(code.data.trim());
          } else {
            resolve(null);
          }
        } catch (err) {
          console.warn('Error decodificando QR desde imagen:', err);
          resolve(null);
        }
      };

      img.onerror = () => {
        reject(new Error('No se pudo renderizar la imagen para análisis óptico.'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo de la imagen.'));
    };

    reader.readAsDataURL(file);
  });
}
