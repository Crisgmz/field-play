import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      navigate(email.includes('admin') ? '/admin' : '/');
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left visual panel - hidden on mobile */}
      <div className="hidden w-1/2 items-center justify-center bg-gradient-to-br from-primary to-primary/80 lg:flex">
        <div className="px-12 text-center">
          <div className="mb-6 text-6xl">⚽</div>
          <h1 className="font-heading text-4xl font-extrabold text-primary-foreground">RealPlay</h1>
          <p className="mt-3 text-lg text-primary-foreground/80">Book your pitch. Play your game.</p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <h1 className="font-heading text-3xl font-extrabold text-foreground">RealPlay</h1>
            <p className="mt-1 text-sm text-muted-foreground">Book your pitch. Play your game.</p>
          </div>

          <h2 className="font-heading text-2xl font-bold text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="player@realplay.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full">Sign In</Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
          </p>

          <div className="mt-8 rounded-lg bg-accent p-3 text-xs text-muted-foreground">
            <p className="font-medium text-accent-foreground">Demo credentials:</p>
            <p className="mt-1">Player: <span className="font-mono">player@realplay.com</span></p>
            <p>Admin: <span className="font-mono">admin@realplay.com</span></p>
            <p className="mt-1 opacity-70">Any password works</p>
          </div>
        </div>
      </div>
    </div>
  );
}
