import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder con efecto shimmer (gradiente deslizante).
 * Reemplaza al `animate-pulse` original — se siente más premium y
 * visualmente asocia "está cargando contenido", no "está vacío".
 *
 * Uso:
 *   <Skeleton className="h-6 w-32" />
 *   <Skeleton variant="circle" className="h-10 w-10" />
 */
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle";
}

function Skeleton({ className, variant = "rect", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md",
        // Gradiente con tres stops: el clarito en el medio "viaja"
        // gracias al keyframe shimmer (background-position).
        "bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,hsl(var(--muted))_0%,hsl(var(--muted-foreground)/0.15)_50%,hsl(var(--muted))_100%)]",
        variant === "circle" && "rounded-full",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
