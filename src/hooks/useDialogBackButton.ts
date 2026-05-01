import { useEffect, useRef } from 'react';

/**
 * Cuando un modal está abierto y el usuario presiona el botón "atrás" del
 * navegador (especialmente importante en mobile, donde es el gesto natural),
 * queremos cerrar el modal en vez de navegar a la página anterior.
 *
 * Estrategia:
 *   - Al abrir, hacemos `history.pushState` con un marcador propio.
 *   - Al cerrarse el modal por cualquier vía (close button, esc, click overlay),
 *     limpiamos ese estado con un `history.back` silencioso si todavía es
 *     nuestro marcador el actual.
 *   - Si el usuario presiona "atrás" del navegador con el modal abierto,
 *     dispara `popstate` → llamamos `onClose()` y NO permitimos que la URL
 *     regrese a la página anterior (porque el push ya consumió ese back).
 *
 * Uso:
 *   const [open, setOpen] = useState(false);
 *   useDialogBackButton(open, () => setOpen(false));
 *   <Dialog open={open} onOpenChange={setOpen}>...</Dialog>
 */
export function useDialogBackButton(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      // Si cerramos el modal por la vía normal (no por back button) y todavía
      // tenemos nuestro state en el history, lo limpiamos con un back silencioso.
      if (pushedRef.current) {
        pushedRef.current = false;
        // Solo hacemos history.back si el state actual es el nuestro;
        // si no, ya el popstate handler lo limpió antes.
        const state = window.history.state as { __dialogModal__?: boolean } | null;
        if (state?.__dialogModal__) {
          window.history.back();
        }
      }
      return;
    }

    // Se acaba de abrir el modal: pushear marcador.
    window.history.pushState({ __dialogModal__: true }, '');
    pushedRef.current = true;

    const handlePop = () => {
      // El usuario presionó "atrás". Cerramos el modal sin navegar más.
      pushedRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
    };
  }, [open]);
}
