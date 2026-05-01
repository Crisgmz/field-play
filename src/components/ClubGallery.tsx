import { useState } from 'react';
import { Images, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ClubImage } from '@/types';
import { useAppData } from '@/contexts/AppDataContext';
import FadeInImage from '@/components/FadeInImage';

interface Props {
  clubId: string;
  fallbackInitial?: string;
}

const FALLBACK_GRADIENT = 'linear-gradient(135deg, #2f8a4d 0%, #114b2e 100%)';

export default function ClubGallery({ clubId, fallbackInitial }: Props) {
  const { getClubImages, getClubImageUrl } = useAppData();
  const images = getClubImages(clubId);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="flex aspect-[16/7] w-full items-center justify-center rounded-3xl text-white/90"
        style={{ background: FALLBACK_GRADIENT }}
      >
        <span className="font-heading text-7xl">{fallbackInitial ?? '⚽'}</span>
      </div>
    );
  }

  const main = images[0];
  const thumbs = images.slice(1, 5);
  const remaining = Math.max(0, images.length - 5);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  return (
    <>
      <div className="grid aspect-[16/7] gap-2 overflow-hidden rounded-3xl sm:grid-cols-[1.4fr_1fr]">
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group relative h-full w-full overflow-hidden rounded-2xl bg-muted sm:rounded-l-3xl"
        >
          <FadeInImage
            src={getClubImageUrl(main)}
            alt={main.caption ?? ''}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </button>

        <div className="hidden grid-cols-2 grid-rows-2 gap-2 sm:grid">
          {thumbs.map((image, idx) => {
            const isLast = idx === thumbs.length - 1 && remaining > 0;
            return (
              <button
                type="button"
                key={image.id}
                onClick={() => openAt(idx + 1)}
                className="group relative h-full w-full overflow-hidden rounded-2xl bg-muted last:rounded-br-3xl"
              >
                <FadeInImage
                  src={getClubImageUrl(image)}
                  alt={image.caption ?? ''}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
                    <span className="font-semibold">+{remaining} más</span>
                  </div>
                )}
              </button>
            );
          })}
          {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, idx) => (
            <div
              key={`pad-${idx}`}
              className="h-full w-full rounded-2xl bg-muted/50"
              style={{ background: FALLBACK_GRADIENT, opacity: 0.5 }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur sm:hidden"
        >
          <Images className="h-3.5 w-3.5" />
          Ver fotos ({images.length})
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            aria-label="Cerrar galería"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex h-[60vh] min-h-[400px] items-center justify-center bg-black">
            <img
              src={getClubImageUrl(images[activeIndex])}
              alt={images[activeIndex].caption ?? ''}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto bg-card p-3">
            {images.map((image, idx) => (
              <button
                type="button"
                key={image.id}
                onClick={() => setActiveIndex(idx)}
                className={`h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  idx === activeIndex ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={getClubImageUrl(image)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
