import { ChangeEvent, useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/contexts/AppDataContext';
import { compressImage, formatBytes } from '@/lib/imageCompress';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 15 * 1024 * 1024; // permitimos hasta 15MB de input; comprimimos antes de subir

interface Props {
  clubId: string;
}

type Phase = 'idle' | 'compressing' | 'uploading';

interface UploadInfo {
  phase: Phase;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

const initialInfo: UploadInfo = {
  phase: 'idle',
  originalSize: 0,
  compressedSize: 0,
  wasCompressed: false,
};

export default function ClubGalleryManager({ clubId }: Props) {
  const { getClubImages, getClubImageUrl, uploadClubImage, deleteClubImage } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<UploadInfo>(initialInfo);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const images = getClubImages(clubId);
  const isBusy = info.phase !== 'idle';

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Sube una imagen JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`La imagen pesa ${formatBytes(file.size)} — máximo ${formatBytes(MAX_BYTES)}.`);
      return;
    }

    setInfo({
      phase: 'compressing',
      originalSize: file.size,
      compressedSize: 0,
      wasCompressed: false,
    });

    let toUpload = file;
    try {
      const compressed = await compressImage(file, {
        maxDimension: 1920,
        quality: 0.85,
        targetMaxBytes: 600 * 1024,
      });
      toUpload = compressed.file;
      setInfo((prev) => ({
        ...prev,
        phase: 'uploading',
        compressedSize: compressed.compressedSize,
        wasCompressed: compressed.wasCompressed,
      }));
    } catch (err) {
      console.error('Compresión falló, subiendo original:', err);
      setInfo((prev) => ({
        ...prev,
        phase: 'uploading',
        compressedSize: file.size,
        wasCompressed: false,
      }));
    }

    const result = await uploadClubImage(clubId, toUpload);
    setInfo(initialInfo);

    if (result.ok) {
      const savedKb = info.originalSize > 0 ? Math.max(0, info.originalSize - toUpload.size) : 0;
      const savedNote = savedKb > 50 * 1024 ? ` (${formatBytes(savedKb)} ahorrados)` : '';
      toast.success(`Imagen agregada a la galería${savedNote}.`);
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async (imageId: string) => {
    setDeletingId(imageId);
    const ok = await deleteClubImage(imageId);
    setDeletingId(null);
    if (ok) {
      toast.success('Imagen eliminada.');
    } else {
      toast.error('No se pudo eliminar la imagen.');
    }
  };

  const phaseLabel = () => {
    if (info.phase === 'compressing') return 'Optimizando...';
    if (info.phase === 'uploading') {
      const sizeNote = info.compressedSize > 0 ? ` ${formatBytes(info.compressedSize)}` : '';
      return `Subiendo${sizeNote}...`;
    }
    return 'Agregar foto';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-heading text-sm font-bold text-foreground">Galería</h4>
          <p className="text-xs text-muted-foreground">
            {images.length === 0
              ? 'Aún no hay imágenes. La primera que subas se usará como portada del club.'
              : `${images.length} ${images.length === 1 ? 'imagen' : 'imágenes'} publicadas. La primera es la portada.`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={isBusy}>
          {info.phase === 'compressing' && <Sparkles className="mr-2 h-3.5 w-3.5 animate-pulse" />}
          {info.phase === 'uploading' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {info.phase === 'idle' && <ImagePlus className="mr-2 h-3.5 w-3.5" />}
          {phaseLabel()}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {isBusy && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          <div className="flex items-start gap-2">
            <UploadCloud className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div className="flex-1 leading-relaxed">
              {info.phase === 'compressing' && (
                <>
                  <p className="font-medium">Optimizando imagen…</p>
                  <p className="text-muted-foreground">
                    Tamaño original: <span className="font-mono">{formatBytes(info.originalSize)}</span>. Reduciendo a 1920px y JPEG 85% para que la subida sea más rápida.
                  </p>
                </>
              )}
              {info.phase === 'uploading' && (
                <>
                  <p className="font-medium">Subiendo a Storage…</p>
                  <p className="text-muted-foreground">
                    {info.wasCompressed
                      ? `Reducida de ${formatBytes(info.originalSize)} a ${formatBytes(info.compressedSize)}.`
                      : `Tamaño: ${formatBytes(info.compressedSize)} (no se pudo reducir más).`}
                    {' '}No cierres esta ventana.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image, idx) => {
            const url = getClubImageUrl(image);
            const busy = deletingId === image.id;
            const isCover = idx === 0;
            return (
              <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                <img src={url} alt={image.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
                {isCover && (
                  <span className="absolute left-1 top-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                    Portada
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(image.id)}
                  disabled={busy}
                  className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                  aria-label="Eliminar imagen"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {busy ? 'Eliminando' : 'Eliminar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
