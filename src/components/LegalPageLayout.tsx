import { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Clock3, Mail, MapPin, Phone } from 'lucide-react';
import logoUrl from '@/logos/logo.png';
import PaymentBrands from '@/components/PaymentBrands';
import { LEGAL_INFO } from '@/lib/legal';

type LegalPageLayoutProps = {
  badge: string;
  title: string;
  description: string;
  effectiveDate: string;
  updatedAt: string;
  sections: { id: string; label: string }[];
  children: ReactNode;
};

// Datos de contacto del comercio para la última sección de cada política.
export function LegalContactList() {
  return (
    <ul className="!ml-0 !space-y-2 [&_li]:!ml-0 [&_li]:!list-none">
      <li className="flex items-start gap-2">
        <Mail className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <a href={`mailto:${LEGAL_INFO.supportEmail}`} className="text-foreground hover:text-primary">
          {LEGAL_INFO.supportEmail}
        </a>
      </li>
      <li className="flex items-start gap-2">
        <Phone className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <a href={`tel:${LEGAL_INFO.phone.replace(/[^\d+]/g, '')}`} className="text-foreground hover:text-primary">
          {LEGAL_INFO.phone}
        </a>
      </li>
      <li className="flex items-start gap-2">
        <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <span>
          <strong>{LEGAL_INFO.companyName}</strong>
          <br />
          RNC {LEGAL_INFO.rnc}
          <br />
          {LEGAL_INFO.address}
        </span>
      </li>
    </ul>
  );
}

// Layout de las páginas legales públicas (políticas de pago, privacidad).
// No usa AppLayout porque se leen sin iniciar sesión.
export default function LegalPageLayout({
  badge,
  title,
  description,
  effectiveDate,
  updatedAt,
  sections,
  children,
}: LegalPageLayoutProps) {
  const { hash } = useLocation();

  // El navegador no puede saltar al ancla en la carga inicial porque el
  // contenido lo pinta React después; lo hacemos manualmente.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="RealPlay" className="h-10 w-auto object-contain" />
            <span className="font-heading text-lg font-bold text-foreground">{LEGAL_INFO.tradeName}</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">
          {badge}
        </span>
        <h1 className="mt-4 font-heading text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          En vigor desde {effectiveDate} · Actualizado el {updatedAt}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">En esta página</p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-8 rounded-3xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground shadow-sm sm:p-8 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_section]:scroll-mt-6 [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:space-y-1">
            {children}
          </article>
        </div>

        <PaymentBrands className="mt-10 border-t border-border pt-6" />
      </main>
    </div>
  );
}
