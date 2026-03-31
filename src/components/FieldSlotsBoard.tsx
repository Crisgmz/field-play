import { PhysicalSlotId, SlotStatus, UnitOption } from '@/types';

interface Props {
  statuses: SlotStatus[];
  options: UnitOption[];
  selectedUnitId?: string | null;
  onSelectUnit: (unitId: string) => void;
}

function slotLabel(slotId: PhysicalSlotId) {
  return slotId;
}

export default function FieldSlotsBoard({ statuses, options, selectedUnitId, onSelectUnit }: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-heading text-base font-bold text-foreground">Cancha física</h4>
            <p className="text-xs text-muted-foreground">6 slots reales · estilo Playtomic</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {statuses.map((slot) => (
            <div
              key={slot.id}
              className={`rounded-2xl border px-3 py-5 text-center transition-all ${
                slot.selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : slot.occupied
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <div className="text-xs font-medium opacity-80">Slot</div>
              <div className="mt-1 font-heading text-lg font-extrabold">{slotLabel(slot.id)}</div>
              <div className="mt-2 text-[11px] font-semibold">
                {slot.selected ? 'Seleccionado' : slot.occupied ? 'Ocupado' : 'Disponible'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1"><span className="h-3 w-3 rounded-full bg-emerald-500" />Disponible</span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1"><span className="h-3 w-3 rounded-full bg-destructive" />Ocupado</span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1"><span className="h-3 w-3 rounded-full bg-primary" />Seleccionado</span>
      </div>

      <div>
        <h4 className="mb-3 font-heading text-base font-bold text-foreground">Combinaciones disponibles</h4>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => {
            const active = selectedUnitId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={!option.available}
                onClick={() => option.available && onSelectUnit(option.id)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  !option.available
                    ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60'
                    : active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/40 hover:bg-accent/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-sm font-bold">{option.name}</p>
                    <p className="mt-1 text-xs opacity-80">{option.type} · {option.slot_ids.join(' + ')}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${option.available ? 'bg-emerald-500 text-white' : 'bg-destructive text-white'}`}>
                    {option.available ? 'Disponible' : 'Ocupado'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
