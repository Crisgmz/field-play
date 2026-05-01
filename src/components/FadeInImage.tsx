import { ImgHTMLAttributes, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * <img> con fade-in automático cuando termina de cargar.
 * Mientras carga, muestra el bg-muted (opcional shimmer si quieres
 * en el contenedor padre con `<Skeleton>` overlay).
 *
 * Esto evita el "pop" feo de las imágenes que aparecen de golpe.
 */
export default function FadeInImage({
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={cn(
        'transition-opacity duration-500 ease-out',
        loaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
      loading={props.loading ?? 'lazy'}
      decoding={props.decoding ?? 'async'}
    />
  );
}
