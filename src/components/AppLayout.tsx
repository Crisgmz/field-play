import { ReactNode, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDisplayName, useAuth } from '@/contexts/AuthContext';
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
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const clientNav = [
  { label: 'Inicio', icon: Home, path: '/' },
  { label: 'Mis reservas', icon: Calendar, path: '/bookings' },
  { label: 'Mi perfil', icon: User, path: '/profile' },
];

const adminSections = [
  { label: 'Resumen', icon: LayoutDashboard, path: '/admin/overview' },
  { label: 'Calendario', icon: Calendar, path: '/admin/calendar' },
  { label: 'Reservas', icon: ListChecks, path: '/admin/bookings' },
  { label: 'Bloqueos', icon: Ban, path: '/admin/blocks' },
  { label: 'Clubes', icon: Building2, path: '/admin/clubs' },
  { label: 'Campos', icon: Map, path: '/admin/fields' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const navItems = useMemo(() => (isAdmin ? adminSections : clientNav), [isAdmin]);

  if (!user) return <>{children}</>;

  const NavContent = () => (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg font-bold">
            FP
          </div>
          <div>
            <p className="font-heading text-base font-bold">RealPlay</p>
            <p className="text-xs text-primary-foreground/80">{getDisplayName(user)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-primary-foreground/80">
          <span>{user.email}</span>
          {isAdmin && (
            <span className="rounded-full bg-white/15 px-2 py-1 font-semibold text-white">
              <Shield className="mr-1 inline h-3 w-3" />Admin
            </span>
          )}
        </div>
      </div>

      <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {isAdmin ? 'Panel lateral' : 'Navegación'}
      </div>

      {navItems.map((item) => {
        const active = location.pathname === item.path || (!isAdmin && location.pathname === item.path);
        return (
          <button
            key={item.path}
            onClick={() => {
              navigate(item.path);
              setSheetOpen(false);
            }}
            className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
              active
                ? 'bg-primary text-primary-foreground shadow'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              active ? 'bg-white/15' : 'bg-muted'
            }`}>
              <item.icon className="h-4.5 w-4.5" />
            </span>
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        );
      })}

      <button
        onClick={() => {
          logout();
          navigate('/login');
        }}
        className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
            <p className="truncate text-xs text-muted-foreground">{isAdmin ? 'Administración' : 'Reservas deportivas'}</p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
