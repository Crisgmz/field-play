import { ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Loader2, MailCheck, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  email: string;
  onVerified: () => void;
  onChangeEmail?: () => void;
}

const CODE_LENGTH = 6;
const RESEND_DEFAULT_SECONDS = 60;

export default function VerifyEmailCode({ email, onVerified, onChangeEmail }: Props) {
  const { verifyEmailCode, requestVerificationCode } = useAuth();
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_DEFAULT_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const fullCode = digits.join('');

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      setDigits((current) => {
        const next = [...current];
        next[index] = '';
        return next;
      });
      return;
    }
    setDigits((current) => {
      const next = [...current];
      // Si el usuario pega o escribe varios dígitos, los distribuimos.
      for (let i = 0; i < value.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = value[i];
      }
      return next;
    });
    const nextIndex = Math.min(CODE_LENGTH - 1, index + value.length);
    inputsRef.current[nextIndex]?.focus();
    inputsRef.current[nextIndex]?.select();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        next[index - 1] = '';
        return next;
      });
      inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const filled = pasted.padEnd(CODE_LENGTH, '').split('').slice(0, CODE_LENGTH);
    setDigits((current) => current.map((_, i) => filled[i] ?? ''));
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleVerify = async () => {
    if (fullCode.length !== CODE_LENGTH) {
      toast.error('Ingresa los 6 dígitos del código.');
      return;
    }
    setSubmitting(true);
    const result = await verifyEmailCode(email, fullCode);
    setSubmitting(false);
    if (result.ok) {
      toast.success('¡Cuenta verificada! Ya puedes iniciar sesión.');
      onVerified();
      return;
    }
    toast.error(result.message);
    if (result.reason === 'wrong_code' || result.reason === 'unknown') {
      // Limpia para reintentar.
      setDigits(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    setResending(true);
    const result = await requestVerificationCode(email);
    setResending(false);
    if (result.ok) {
      toast.success('Te enviamos un código nuevo.');
      setResendCooldown(RESEND_DEFAULT_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } else {
      toast.error(result.message);
      if (result.retryAfterSeconds) setResendCooldown(result.retryAfterSeconds);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Verifica tu cuenta</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Te enviamos un código de 6 dígitos a
          <br />
          <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <div onPaste={handlePaste} className="flex justify-center gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputsRef.current[index] = el)}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={index === 0 ? CODE_LENGTH : 1}
            value={digit}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="h-14 w-12 rounded-xl border border-border bg-background text-center font-mono text-2xl font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:h-16 sm:w-14"
            aria-label={`Dígito ${index + 1}`}
          />
        ))}
      </div>

      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={submitting || fullCode.length !== CODE_LENGTH}
        onClick={() => void handleVerify()}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {submitting ? 'Verificando...' : 'Verificar y activar cuenta'}
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resending || resendCooldown > 0}
          className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          {resendCooldown > 0
            ? `Reenviar código en ${resendCooldown}s`
            : resending
              ? 'Enviando...'
              : 'Reenviar código'}
        </button>

        {onChangeEmail && (
          <button
            type="button"
            onClick={onChangeEmail}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Usar otro correo
          </button>
        )}
      </div>
    </div>
  );
}
