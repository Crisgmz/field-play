import { ReactNode, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDisplayName, useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import {
  Home,
  Calendar,
  LogOut,
  User,
  Shield,
  Menu,
  LayoutDashboard,
  Building2,
  Map,
  Ban,
  DollarSign,
  ListChecks,
  Settings,
  UsersRound,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDialogBackButton } from '@/hooks/useDialogBackButton';

const clientNav = [
  { label: 'Inicio', icon: Home, path: '/' },
  { label: 'Mis reservas', icon: Calendar, path: '/bookings' },
  { label: 'Mi perfil', icon: User, path: '/profile' },
];

type AdminNavItem = {
  label: string;
  icon: typeof Home;
  path: string;
  /** Sections marked admin-only are hidden for staff accounts. */
  adminOnly?: boolean;
};

const adminSections: AdminNavItem[] = [
  { label: 'Resumen', icon: LayoutDashboard, path: '/admin/overview' },
  { label: 'Calendario', icon: Calendar, path: '/admin/calendar' },
  { label: 'Reservas', icon: ListChecks, path: '/admin/bookings' },
  { label: 'Bloqueos', icon: Ban, path: '/admin/blocks' },
  { label: 'Reportes', icon: BarChart3, path: '/admin/reports', adminOnly: true },
  { label: 'Clubes', icon: Building2, path: '/admin/clubs', adminOnly: true },
  { label: 'Campos', icon: Map, path: '/admin/fields', adminOnly: true },
  { label: 'Configuración', icon: Settings, path: '/admin/config', adminOnly: true },
  { label: 'Precios', icon: DollarSign, path: '/admin/pricing', adminOnly: true },
  { label: 'Equipo', icon: UsersRound, path: '/admin/team', adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin, isStaff, isAdminLevel, staffClubId } = useAuth();
  const { bookings } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Cantidad de reservas pendientes nuevas que el admin/staff aún no
  // ha abierto. Se muestra como badge sobre el item "Reservas" del
  // sidebar para llamar la atención.
  const pendingBadge = useMemo(() => {
    if (!isAdminLevel) return 0;
    let allowedClubIds: Set<string> | null = null;
    if (isStaff && staffClubId) {
      allowedClubIds = new Set([staffClubId]);
    }
    return bookings.filter((b) => {
      if (b.status !== 'pending' || b.admin_seen_at) return false;
      if (allowedClubIds && !allowedClubIds.has(b.club_id)) return false;
      return true;
    }).length;
  }, [bookings, isAdminLevel, isStaff, staffClubId]);

  // Cliente: cuántas de SUS reservas están pendientes (info útil sobre
  // el item "Mis reservas").
  const myPendingBadge = useMemo(() => {
    if (isAdminLevel || !user) return 0;
    return bookings.filter((b) => b.user_id === user.id && b.status === 'pending').length;
  }, [bookings, isAdminLevel, user]);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Back button del navegador cierra el sheet/dialog antes que navegar.
  useDialogBackButton(sheetOpen, () => setSheetOpen(false));
  useDialogBackButton(logoutDialogOpen, () => setLogoutDialogOpen(false));

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setLogoutDialogOpen(false);
      setSheetOpen(false);
      navigate('/login');
    }
  };

  const navItems = useMemo(() => {
    if (!isAdminLevel) return clientNav;
    return adminSections.filter((item) => !(item.adminOnly && isStaff));
  }, [isAdminLevel, isStaff]);

  if (!user) return <>{children}</>;

  const NavContent = () => (
    <nav className="flex h-full flex-col p-4">
      {/* Brand: fija arriba */}
      <div className="mb-4 shrink-0 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg font-bold">
            FP
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-bold">RealPlay</p>
            <p className="truncate text-xs text-primary-foreground/80">{getDisplayName(user)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-primary-foreground/80">
          <span className="truncate">{user.email}</span>
          {isAdmin && (
            <span className="flex-shrink-0 rounded-full bg-white/15 px-2 py-1 font-semibold text-white">
              <Shield className="mr-1 inline h-3 w-3" />Admin
            </span>
          )}
          {isStaff && (
            <span className="flex-shrink-0 rounded-full bg-white/15 px-2 py-1 font-semibold text-white">
              <UsersRound className="mr-1 inline h-3 w-3" />Empleado
            </span>
          )}
        </div>
      </div>

      <div className="mb-2 shrink-0 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {isAdminLevel ? 'Panel lateral' : 'Navegación'}
      </div>

      {/* Lista scrollable: ocupa todo el espacio sobrante. En mobile (Sheet) o
          en desktop con muchas secciones, este es el único bloque que scrollea. */}
      <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
        {navItems.map((item) => {
          const active = location.pathname === item.path;

          // Badge de notificación para los items que lo necesiten:
          // - Admin/staff: "Reservas" muestra cantidad de pendientes nuevas
          // - Cliente: "Mis reservas" muestra cantidad de pendientes propias
          let badge = 0;
          if (isAdminLevel && item.path === '/admin/bookings') {
            badge = pendingBadge;
          } else if (!isAdminLevel && item.path === '/bookings') {
            badge = myPendingBadge;
          }

          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setSheetOpen(false);
              }}
              className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                active
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <span className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                active ? 'bg-white/15' : 'bg-muted'
              }`}>
                <item.icon className="h-4.5 w-4.5" />
                {badge > 0 && (
                  <span
                    aria-label={`${badge} pendiente${badge === 1 ? '' : 's'}`}
                    className="absolute -right-1 -top-1 flex h-5 min-w-[20px] animate-pulse items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-card"
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {badge > 0 && (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-700'
                }`}>
                  {badge > 99 ? '99+' : badge} nueva{badge === 1 ? '' : 's'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Logout: siempre visible al fondo */}
      <button
        onClick={() => setLogoutDialogOpen(true)}
        className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <LogOut className="h-4.5 w-4.5" />
        </span>
        <span className="flex-1 text-left">Cerrar sesión</span>
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <NavContent />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-2xl">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <NavContent />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-bold text-foreground">RealPlay</span>
            <p className="truncate text-xs text-muted-foreground">{isAdminLevel ? (isStaff ? 'Panel de empleado' : 'Administración') : 'Reservas deportivas'}</p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>

      <AlertDialog open={logoutDialogOpen} onOpenChange={(open) => !loggingOut && setLogoutDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu sesión se cerrará en este dispositivo. Tendrás que volver a iniciar sesión para reservar o administrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmLogout();
              }}
              disabled={loggingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
