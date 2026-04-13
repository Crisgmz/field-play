import { DaySchedule } from '@/types/courtConfig';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface Props {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
  disabled?: boolean;
}

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

const DAY_ABBREV: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

export default function VenueScheduleEditor({ schedule, onChange, disabled }: Props) {
  const updateDay = (day: number, updates: Partial<DaySchedule>) => {
    onChange(
      schedule.map((d) => (d.day === day ? { ...d, ...updates } : d)),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Horario semanal</p>
        <p className="text-[10px] text-muted-foreground">Ajuste el horario de apertura para cada día</p>
      </div>

      <div className="space-y-2">
        {schedule
          .slice()
          .sort((a, b) => {
            // Show Monday first (1,2,3,4,5,6,0)
            const orderA = a.day === 0 ? 7 : a.day;
            const orderB = b.day === 0 ? 7 : b.day;
            return orderA - orderB;
          })
          .map((day) => (
            <div
              key={day.day}
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                day.closed ? 'border-border bg-muted/30 opacity-60' : 'border-border bg-card'
              }`}
            >
              {/* Day name */}
              <div className="w-20 shrink-0">
                <span className="hidden text-sm font-semibold text-foreground sm:inline">{DAY_NAMES[day.day]}</span>
                <span className="text-sm font-semibold text-foreground sm:hidden">{DAY_ABBREV[day.day]}</span>
              </div>

              {/* Open/Close toggle */}
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={!day.closed}
                  onCheckedChange={(checked) => updateDay(day.day, { closed: !checked })}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">
                  {day.closed ? 'Cerrado' : 'Abierto'}
                </span>
              </div>

              {/* Time inputs */}
              {!day.closed && (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={day.open}
                    onChange={(e) => updateDay(day.day, { open: e.target.value })}
                    disabled={disabled}
                    className="h-8 w-24 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={day.close}
                    onChange={(e) => updateDay(day.day, { close: e.target.value })}
                    disabled={disabled}
                    className="h-8 w-24 text-xs"
                  />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
