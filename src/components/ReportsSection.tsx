import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarRange, DollarSign, MinusCircle, Percent, TrendingUp, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/bookingFormat';
import {
  bookingsForClub,
  computeBlockBreakdown,
  computeDailyRevenue,
  computeHourBreakdown,
  computeKPIs,
  computeModalityBreakdown,
  computeTopClients,
  computeWeekdayBreakdown,
  rangeFromPreset,
  type RangePreset,
} from '@/lib/reports';

const MODALITY_COLORS: Record<string, string> = {
  F11: '#1f6f7a',
  F7: '#2f8a4d',
  F5: '#f59e0b',
};

export default function ReportsSection() {
  const { user } = useAuth();
  const { clubs, fields, bookings, blocks, profiles, getVenueConfig } = useAppData();

  // Filtros
  const ownedClubs = useMemo(
    () => clubs.filter((c) => c.owner_id === user?.id),
    [clubs, user?.id],
  );
  const [clubId, setClubId] = useState<string>(ownedClubs[0]?.id ?? 'all');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const range = useMemo(
    () => rangeFromPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  // Datos por club
  const fieldsByClub = useMemo(() => {
    const map: Record<string, typeof fields> = {};
    fields.forEach((f) => {
      if (!map[f.club_id]) map[f.club_id] = [];
      map[f.club_id].push(f);
    });
    return map;
  }, [fields]);

  const scopedBookings = useMemo(
    () => bookingsForClub(bookings, clubId, fieldsByClub),
    [bookings, clubId, fieldsByClub],
  );

  const scopedBlocks = useMemo(() => {
    if (clubId === 'all') return blocks;
    const allowedFieldIds = new Set((fieldsByClub[clubId] ?? []).map((f) => f.id));
    return blocks.filter((b) => allowedFieldIds.has(b.field_id));
  }, [blocks, clubId, fieldsByClub]);

  const totalFields = useMemo(() => {
    if (clubId === 'all') return fields.filter((f) => f.is_active !== false).length;
    return (fieldsByClub[clubId] ?? []).filter((f) => f.is_active !== false).length;
  }, [clubId, fieldsByClub, fields]);

  const venueConfig = useMemo(() => {
    if (clubId === 'all' || !clubs.find((c) => c.id === clubId)) return null;
    return getVenueConfig(clubId);
  }, [clubId, clubs, getVenueConfig]);

  // Cálculos
  const kpis = useMemo(
    () => computeKPIs(scopedBookings, range, totalFields, venueConfig),
    [scopedBookings, range, totalFields, venueConfig],
  );
  const dailyRevenue = useMemo(
    () => computeDailyRevenue(scopedBookings, range),
    [scopedBookings, range],
  );
  const modalityBreakdown = useMemo(
    () => computeModalityBreakdown(scopedBookings, range),
    [scopedBookings, range],
  );
  const weekdayBreakdown = useMemo(
    () => computeWeekdayBreakdown(scopedBookings, range),
    [scopedBookings, range],
  );
  const hourBreakdown = useMemo(
    () => computeHourBreakdown(scopedBookings, range),
    [scopedBookings, range],
  );
  const topClients = useMemo(
    () => computeTopClients(scopedBookings, profiles, range),
    [scopedBookings, profiles, range],
  );
  const blockBreakdown = useMemo(
    () => computeBlockBreakdown(scopedBlocks, range),
    [scopedBlocks, range],
  );

  const topRevenueDays = useMemo(
    () => [...dailyRevenue].filter((d) => d.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [dailyRevenue],
  );

  // ── UI ─────────────────────────────────────────────

  const formatRangeLabel = () => {
    const start = new Date(`${range.startDate}T12:00:00`);
    const end = new Date(`${range.endDate}T12:00:00`);
    const fmt = (d: Date) => d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        {ownedClubs.length > 1 && (
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Club</label>
            <Select value={clubId} onValueChange={setClubId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos mis clubes</SelectItem>
                {ownedClubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Rango</label>
          <Select value={preset} onValueChange={(value) => setPreset(value as RangePreset)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="90d">Últimos 90 días</SelectItem>
              <SelectItem value="year">Este año</SelectItem>
              <SelectItem value="custom">Rango personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {preset === 'custom' && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Desde</label>
              <Input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Hasta</label>
              <Input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          {formatRangeLabel()}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Ingresos confirmados"
          value={formatCurrency(kpis.totalRevenue)}
          subtitle={`Ticket promedio: ${formatCurrency(Math.round(kpis.averageTicket))}`}
          accent="emerald"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Reservas confirmadas"
          value={kpis.confirmedBookings.toLocaleString('es-DO')}
          subtitle={`${kpis.pendingBookings} pendientes`}
          accent="primary"
        />
        <KpiCard
          icon={<Percent className="h-4 w-4" />}
          label="Ocupación"
          value={`${(kpis.occupancyRate * 100).toFixed(1)}%`}
          subtitle="Horas reservadas / horas operativas"
          accent="sky"
        />
        <KpiCard
          icon={<MinusCircle className="h-4 w-4" />}
          label="Tasa de cancelación"
          value={`${(kpis.cancellationRate * 100).toFixed(1)}%`}
          subtitle={`${kpis.cancelledBookings} canceladas / ${kpis.totalBookings} totales`}
          accent="rose"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-4">
          <TabsTrigger value="revenue">Ingresos</TabsTrigger>
          <TabsTrigger value="occupancy">Ocupación</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="operations">Operación</TabsTrigger>
        </TabsList>

        {/* INGRESOS */}
        <TabsContent value="revenue" className="space-y-4">
          <ChartCard title="Ingresos por día" subtitle="Solo reservas confirmadas dentro del rango">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyRevenue} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => `Día: ${label}`}
                  contentStyle={{ borderRadius: 12 }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2f8a4d" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Ingresos por modalidad" subtitle="F11 / F7 / F5">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={modalityBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12 }} />
                  <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                    {modalityBreakdown.map((entry) => (
                      <Cell key={entry.type} fill={MODALITY_COLORS[entry.type]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 5 días con mayor ingreso" subtitle="Picos de demanda dentro del rango">
              {topRevenueDays.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos en el rango.</p>
              ) : (
                <ul className="space-y-2 py-2">
                  {topRevenueDays.map((d, idx) => (
                    <li key={d.date} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {idx + 1}
                        </span>
                        <div className="leading-tight">
                          <p className="text-sm font-medium text-foreground">{d.label}</p>
                          <p className="text-xs text-muted-foreground">{d.bookings} {d.bookings === 1 ? 'reserva' : 'reservas'}</p>
                        </div>
                      </div>
                      <span className="font-semibold text-foreground">{formatCurrency(d.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
        </TabsContent>

        {/* OCUPACIÓN */}
        <TabsContent value="occupancy" className="space-y-4">
          <ChartCard title="Reservas por día de la semana" subtitle="Identifica los días más fuertes">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekdayBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="bookings" fill="#2f8a4d" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Reservas por hora del día" subtitle="Horarios más demandados (06:00 – 23:00)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hourBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="bookings" fill="#1f6f7a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* CLIENTES */}
        <TabsContent value="clients" className="space-y-4">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Clientes únicos en el rango"
            value={kpis.uniqueClients.toLocaleString('es-DO')}
            subtitle="Cantidad de clientes con al menos una reserva confirmada"
            accent="primary"
          />

          <ChartCard title="Top 10 clientes" subtitle="Por monto gastado en el rango">
            {topClients.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin datos en el rango.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 text-right font-medium">Reservas</th>
                      <th className="px-3 py-2 text-right font-medium">Total gastado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClients.map((c, idx) => (
                      <tr key={c.userId} className="border-t border-border">
                        <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-3 font-medium text-foreground">{c.fullName}</td>
                        <td className="px-3 py-3 text-muted-foreground">{c.email}</td>
                        <td className="px-3 py-3 text-right">{c.bookings}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatCurrency(c.spent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </TabsContent>

        {/* OPERACIÓN */}
        <TabsContent value="operations" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Cancelaciones" subtitle="Reservas que terminaron canceladas">
              <div className="space-y-2 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total canceladas</span>
                  <span className="font-heading text-2xl font-bold text-foreground">{kpis.cancelledBookings}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Tasa de cancelación</span>
                  <span className="font-medium text-rose-600">{(kpis.cancellationRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Bloqueos por tipo" subtitle="Mantenimiento, eventos y prácticas">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={blockBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'count') return [value, 'Cantidad'];
                      if (name === 'hours') return [`${value.toFixed(1)}h`, 'Horas'];
                      return [value, name];
                    }}
                    contentStyle={{ borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" name="Cantidad" fill="#475569" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="hours" name="Horas" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  accent: 'emerald' | 'primary' | 'sky' | 'rose';
}

function KpiCard({ icon, label, value, subtitle, accent }: KpiCardProps) {
  const accentClasses: Record<KpiCardProps['accent'], string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    primary: 'bg-primary/10 text-primary',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${accentClasses[accent]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-heading text-2xl font-bold text-card-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="font-heading text-base font-bold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
