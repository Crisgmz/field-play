import { useState } from 'react';
import { mockBookings, mockBlocks, mockClubs, mockFields, TIME_SLOTS } from '@/data/mockData';
import { Block, Booking, FieldType } from '@/types';
import { Calendar, Users, DollarSign, Shield, Plus, Trash2, Edit, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [blocks, setBlocks] = useState<Block[]>([...mockBlocks]);
  const [bookings] = useState<Booking[]>([...mockBookings]);
  const [calendarDate, setCalendarDate] = useState('2026-03-30');

  // Block form state
  const [blockForm, setBlockForm] = useState({
    field_id: 'f1',
    unit_type: 'F11' as FieldType | 'all',
    date: '2026-03-30',
    start_time: '08:00',
    end_time: '10:00',
    type: 'maintenance' as Block['type'],
    reason: '',
  });
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  const totalBookings = bookings.length;
  const totalBlocks = blocks.length;

  const stats = [
    { label: 'Total Reservas', value: totalBookings, icon: Calendar, color: 'text-primary' },
    { label: 'Bloqueos Activos', value: totalBlocks, icon: Shield, color: 'text-warning' },
    { label: 'Clubes', value: mockClubs.length, icon: Users, color: 'text-primary' },
    { label: 'Ingresos', value: `$${totalBookings * 120}`, icon: DollarSign, color: 'text-primary' },
  ];

  const handleCreateBlock = () => {
    const field = mockFields.find(f => f.id === blockForm.field_id);
    if (!field) return;

    let unitIds: string[] = [];
    if (blockForm.unit_type === 'F11' || blockForm.unit_type === 'all') {
      unitIds = field.units.filter(u => u.type === 'F11').map(u => u.id);
    } else if (blockForm.unit_type === 'F7') {
      unitIds = field.units.filter(u => u.type === 'F7').map(u => u.id);
    } else {
      unitIds = field.units.filter(u => u.type === 'F5').map(u => u.id);
    }

    const newBlock: Block = {
      id: `bl-${Date.now()}`,
      field_id: blockForm.field_id,
      field_unit_ids: unitIds,
      date: blockForm.date,
      start_time: blockForm.start_time,
      end_time: blockForm.end_time,
      type: blockForm.type,
      reason: blockForm.reason || 'Sin razón',
    };
    setBlocks(prev => [...prev, newBlock]);
    setBlockDialogOpen(false);
    toast.success('Bloqueo creado exitosamente');
    setBlockForm(f => ({ ...f, reason: '' }));
  };

  const handleDeleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    toast.success('Bloqueo eliminado');
  };

  // Calendar helpers
  const calendarDateObj = new Date(calendarDate + 'T00:00:00');
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarDateObj);
    d.setDate(d.getDate() - d.getDay() + i);
    return d.toISOString().split('T')[0];
  });

  const prevWeek = () => {
    const d = new Date(calendarDateObj);
    d.setDate(d.getDate() - 7);
    setCalendarDate(d.toISOString().split('T')[0]);
  };
  const nextWeek = () => {
    const d = new Date(calendarDateObj);
    d.setDate(d.getDate() + 7);
    setCalendarDate(d.toISOString().split('T')[0]);
  };

  const getEventsForCell = (date: string, time: string) => {
    const nextHour = `${String(parseInt(time.split(':')[0]) + 1).padStart(2, '0')}:00`;
    const cellBookings = bookings.filter(b => b.date === date && b.start_time < nextHour && b.end_time > time);
    const cellBlocks = blocks.filter(b => b.date === date && b.start_time < nextHour && b.end_time > time);
    return { cellBookings, cellBlocks };
  };

  const displayHours = TIME_SLOTS.slice(0, -1); // 08:00 to 21:00

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Panel de Administración</h1>
        <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Crear Bloqueo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Bloqueo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Club / Campo</label>
                <Select value={blockForm.field_id} onValueChange={v => setBlockForm(f => ({ ...f, field_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mockFields.map(f => {
                      const club = mockClubs.find(c => c.id === f.club_id);
                      return <SelectItem key={f.id} value={f.id}>{club?.name} – {f.name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Tipo de Unidad</label>
                <Select value={blockForm.unit_type} onValueChange={v => setBlockForm(f => ({ ...f, unit_type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el campo (F11)</SelectItem>
                    <SelectItem value="F7">Canchas F7</SelectItem>
                    <SelectItem value="F5">Canchas F5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Fecha</label>
                  <Input type="date" value={blockForm.date} onChange={e => setBlockForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Tipo</label>
                  <Select value={blockForm.type} onValueChange={v => setBlockForm(f => ({ ...f, type: v as Block['type'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="practice">Práctica</SelectItem>
                      <SelectItem value="maintenance">Mantenimiento</SelectItem>
                      <SelectItem value="event">Evento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Hora Inicio</label>
                  <Select value={blockForm.start_time} onValueChange={v => setBlockForm(f => ({ ...f, start_time: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.slice(0, -1).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Hora Fin</label>
                  <Select value={blockForm.end_time} onValueChange={v => setBlockForm(f => ({ ...f, end_time: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.slice(1).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Razón</label>
                <Input placeholder="Ej: Torneo de liga" value={blockForm.reason} onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleCreateBlock}>Crear Bloqueo</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="bookings">Reservas</TabsTrigger>
          <TabsTrigger value="blocks">Bloqueos</TabsTrigger>
          <TabsTrigger value="fields">Campos</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <p className="mt-2 font-heading text-2xl font-bold text-card-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-foreground">Últimas Reservas</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.slice(0, 5).map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-card-foreground">{b.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.start_time} – {b.end_time}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          b.field_type === 'F11' ? 'field-badge-11' : b.field_type === 'F7' ? 'field-badge-7' : 'field-badge-5'
                        }`}>{b.field_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">{b.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* CALENDAR TAB */}
        <TabsContent value="calendar">
          <div className="mb-4 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-heading text-sm font-bold text-foreground">
              Semana del {weekDates[0]}
            </span>
            <Button variant="outline" size="sm" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-muted-foreground">Hora</th>
                  {weekDates.map(d => {
                    const dateObj = new Date(d + 'T00:00:00');
                    return (
                      <th key={d} className="min-w-[100px] px-2 py-2 text-center text-muted-foreground">
                        <div>{dateObj.toLocaleDateString('es', { weekday: 'short' })}</div>
                        <div className="font-heading text-sm text-foreground">{dateObj.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayHours.map(time => (
                  <tr key={time} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-muted-foreground">{time}</td>
                    {weekDates.map(date => {
                      const { cellBookings, cellBlocks } = getEventsForCell(date, time);
                      return (
                        <td key={`${date}-${time}`} className="px-1 py-1">
                          {cellBookings.map(b => (
                            <div key={b.id} className="mb-0.5 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium truncate">
                              {b.field_type} Reserva
                            </div>
                          ))}
                          {cellBlocks.map(b => (
                            <div key={b.id} className="mb-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive font-medium truncate">
                              {b.reason}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* BOOKINGS TAB */}
        <TabsContent value="bookings">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Unidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const field = mockFields.find(f => f.units.some(u => u.id === b.field_unit_id));
                    const unit = field?.units.find(u => u.id === b.field_unit_id);
                    return (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.id}</td>
                        <td className="px-4 py-3 text-card-foreground">{b.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{b.start_time} – {b.end_time}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            b.field_type === 'F11' ? 'field-badge-11' : b.field_type === 'F7' ? 'field-badge-7' : 'field-badge-5'
                          }`}>{b.field_type}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{unit?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            b.status === 'confirmed' ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'
                          }`}>{b.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* BLOCKS TAB */}
        <TabsContent value="blocks">
          <div className="space-y-3">
            {blocks.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No hay bloqueos activos</p>}
            {blocks.map((block) => (
              <div key={block.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-card-foreground">{block.reason}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{block.date} · {block.start_time} – {block.end_time}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Unidades: {block.field_unit_ids.length}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">{block.type}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteBlock(block.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* FIELDS TAB */}
        <TabsContent value="fields">
          <div className="space-y-6">
            {mockFields.map(field => {
              const club = mockClubs.find(c => c.id === field.club_id);
              const f11 = field.units.filter(u => u.type === 'F11');
              const f7 = field.units.filter(u => u.type === 'F7');
              const f5 = field.units.filter(u => u.type === 'F5');
              return (
                <div key={field.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading text-base font-bold text-card-foreground">{club?.name} – {field.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{club?.location}</p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* F11 */}
                    {f11.map(u => (
                      <div key={u.id} className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <span className="field-badge-11 rounded-full px-2 py-0.5 text-[10px] font-bold">F11</span>
                          <span className="text-sm font-medium text-foreground">{u.name}</span>
                        </div>
                        {/* F7 children */}
                        <div className="mt-2 ml-4 space-y-2">
                          {f7.filter(f7u => f7u.parent_id === u.id).map(f7u => (
                            <div key={f7u.id} className="rounded-lg border border-border bg-card p-2.5">
                              <div className="flex items-center gap-2">
                                <span className="field-badge-7 rounded-full px-2 py-0.5 text-[10px] font-bold">F7</span>
                                <span className="text-sm font-medium text-foreground">{f7u.name}</span>
                              </div>
                              {/* F5 children */}
                              <div className="mt-1.5 ml-4 flex flex-wrap gap-2">
                                {f5.filter(f5u => f5u.parent_id === f7u.id).map(f5u => (
                                  <div key={f5u.id} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1">
                                    <span className="field-badge-5 rounded-full px-1.5 py-0.5 text-[9px] font-bold">F5</span>
                                    <span className="text-xs text-foreground">{f5u.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
