// ============================================================
// Compresión de imágenes en cliente usando Canvas (sin dependencias).
//
// Por qué: las fotos modernas (de celular sobre todo) pesan 3-8 MB.
// Subir eso a Supabase Storage es lento y desperdicia ancho de banda
// y cuota. Reducir a 1920px de lado mayor con JPEG 85% baja una foto
// típica a ~300 KB sin pérdida visual perceptible.
//
// Si la imagen ya es chica (≤ targetMaxBytes) y de tipo soportado,
// la devolvemos tal cual (no recompactamos PNGs por debajo del umbral
// para no romper transparencias accidentalmente).
// ============================================================

export interface CompressOptions {
  maxDimension?: number;     // px del lado mayor; default 1920
  quality?: number;          // 0-1 para JPEG; default 0.85
  targetMaxBytes?: number;   // si ya pesa menos, no se recompacta; default 600 KB
  outputType?: 'image/jpeg' | 'image/webp'; // default 'image/jpeg'
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_TARGET_MAX_BYTES = 600 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event instanceof Error ? event : new Error('No se pudo decodificar la imagen.'));
    };
    img.src = url;
  });
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  filename: string,
  outputType: string,
  quality: number,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar el blob comprimido.'));
          return;
        }
        const ext = outputType === 'image/webp' ? 'webp' : 'jpg';
        const baseName = filename.replace(/\.[^.]+$/, '') || 'image';
        resolve(new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() }));
      },
      outputType,
      quality,
    );
  });
}

export async function compressImage(file: File, options: CompressOptions = {}): Promise<CompressResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const targetMaxBytes = options.targetMaxBytes ?? DEFAULT_TARGET_MAX_BYTES;
  const outputType = options.outputType ?? 'image/jpeg';

  // Si ya es razonablemente liviana, no la recompactamos. Excepción:
  // siempre forzamos compresión cuando el browser puede leerla, para
  // homogeneizar tipos (todos terminan en JPEG/WebP).
  if (file.size <= targetMaxBytes && (file.type === outputType || file.type === 'image/jpeg')) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // Si el browser no puede decodificar la imagen, devolvemos el file
    // original y dejamos que la subida siga su curso (Storage fallará
    // con un error claro si el tipo no es válido).
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const targetWidth = Math.round(img.width * ratio);
  const targetHeight = Math.round(img.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  try {
    const compressed = await canvasToFile(canvas, file.name, outputType, quality);
    // Si la "comprimida" pesa más que la original (raro pero posible
    // con imágenes ya muy optimizadas), nos quedamos con la original.
    if (compressed.size >= file.size) {
      return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
    }
    return {
      file: compressed,
      originalSize: file.size,
      compressedSize: compressed.size,
      wasCompressed: true,
    };
  } catch (err) {
    console.error('compressImage error:', err);
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
