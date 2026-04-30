import { ChangeEvent, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/contexts/AppDataContext';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  clubId: string;
}

export default function ClubGalleryManager({ clubId }: Props) {
  const { getClubImages, getClubImageUrl, uploadClubImage, deleteClubImage } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const images = getClubImages(clubId);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Sube una imagen JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('La imagen no puede exceder 10 MB.');
      return;
    }
    setUploading(true);
    const result = await uploadClubImage(clubId, file);
    setUploading(false);
    if (result.ok) {
      toast.success('Imagen agregada a la galería.');
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-heading text-sm font-bold text-foreground">Galería</h4>
          <p className="text-xs text-muted-foreground">
            {images.length === 0
              ? 'Aún no hay imágenes. Las que subas se mostrarán a los clientes.'
              : `${images.length} ${images.length === 1 ? 'imagen' : 'imágenes'} publicadas.`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-2 h-3.5 w-3.5" />}
          {uploading ? 'Subiendo...' : 'Agregar foto'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image) => {
            const url = getClubImageUrl(image);
            const busy = deletingId === image.id;
            return (
              <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                <img src={url} alt={image.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
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
