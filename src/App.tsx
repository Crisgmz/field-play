import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppDataProvider } from "@/contexts/AppDataContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Home from "@/pages/Home";
import BookingFlow from "@/pages/BookingFlow";
import MyBookings from "@/pages/MyBookings";
import Profile from "@/pages/Profile";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "@/components/ErrorBoundary";
import logoUrl from "@/logos/logo.png";

const queryClient = new QueryClient();

function LoadingScreen() {
  // Si el loading toma demasiado, mostramos UX de "atascado" con
  // botones para recargar o ir a login — así el usuario nunca queda
  // permanentemente en blanco aunque el watchdog falle por algún motivo.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setStuck(true), 15000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="relative">
        <img
          src={logoUrl}
          alt="RealPlay"
          className="h-20 w-auto animate-fade-in object-contain opacity-90"
        />
        <div
          className="absolute -inset-3 animate-pulse rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--primary) / 0.18) 0%, transparent 70%)",
          }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </div>

      {stuck && (
        <div className="mt-2 max-w-sm space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            La carga está tardando más de lo esperado. Probablemente
            tu conexión esté lenta o hay un problema temporal.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Recargar página
            </button>
            <button
              type="button"
              onClick={() => {
                // Limpia la sesión local y va al login para empezar de cero.
                try {
                  Object.keys(window.localStorage)
                    .filter((k) => k.startsWith('sb-'))
                    .forEach((k) => window.localStorage.removeItem(k));
                } catch {
                  // ignore
                }
                window.location.href = '/login';
              }}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Ir al login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdminLevel, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminLevel) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { user, isAdminLevel, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // Para usuarios autenticados, su "home" depende del rol. Esto evita
  // el flicker post-login: el route guard de /login ya redirige al
  // panel correcto en vez de pasar primero por '/'.
  const authenticatedHome = isAdminLevel ? '/admin/overview' : '/';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={authenticatedHome} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={authenticatedHome} replace /> : <Register />} />
      {/* Recovery flow: ambas rutas son siempre públicas. /reset-password
          maneja su propia sesión vía el hash de la URL (Supabase recovery). */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/clubs/:clubId" element={<ProtectedRoute><BookingFlow /></ProtectedRoute>} />
      <Route path="/clubs/:clubId/book" element={<ProtectedRoute><BookingFlow /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/:section" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  // ErrorBoundary envuelve TODO. Si cualquier componente del árbol crashea,
  // se ve la UI de fallback en vez de pantalla en blanco.
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppDataProvider>
              <AppRoutes />
            </AppDataProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
