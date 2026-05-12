import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Pantalla obligatoria que se muestra al usuario cuando
 * `profiles.must_change_password = true`. Bloquea TODA la UI hasta
 * que el usuario cambie su contraseña inicial. Activada al crear
 * empleados desde el panel admin — el password que el admin asignó
 * es temporal y debe rotarse en el primer login.
 *
 * El componente se monta a nivel global en App.tsx, antes que las
 * rutas, así no importa en qué URL estaba el empleado al iniciar
 * sesión: siempre verá esta pantalla primero.
 */
export default function ForceChangePassword() {
  const { user, refreshProfile, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        toast.error(`No se pudo cambiar la contraseña: ${updateErr.message}`);
        return;
      }
      // Marca el profile como "ya cambió la contraseña" — RPC del lado
      // server (migración 020) bajo security definer.
      const { error: markErr } = await supabase.rpc('rpc_mark_password_changed');
      if (markErr) {
        // El password ya se cambió en auth; solo el flag no se grabó.
        // No bloqueamos al usuario — el siguiente refresh lo resincroniza.
        console.warn('No se pudo marcar must_change_password=false:', markErr.message);
      }
      await refreshProfile();
      toast.success('Contraseña actualizada. Bienvenido al sistema.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">Cambia tu contraseña</h1>
            <p className="text-sm text-muted-foreground">
              {user?.first_name ? `Hola ${user.first_name}, ` : ''}por seguridad debes cambiar la contraseña inicial que te asignaron.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nueva contraseña</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Confirma la contraseña</label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repítela"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Button className="w-full" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>) : 'Guardar nueva contraseña'}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => void logout()}
            disabled={submitting}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
