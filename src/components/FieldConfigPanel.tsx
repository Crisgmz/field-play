import { useMemo, useState } from 'react';
import { FieldType, FieldUnit, Field } from '@/types';
import { COURT_TEMPLATES } from '@/types/courtConfig';
import { buildConflictMap, buildFieldConfigSummary, getMaxSimultaneousBookings } from '@/lib/courtConfig';
import CourtLayoutPreview from './CourtLayoutPreview';
import { AlertTriangle, Check, Layers, Maximize2, Minimize2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Props {
  field: Field;
  onToggleUnit?: (unitId: string, active: boolean) => void;
}

export default function FieldConfigPanel({ field, onToggleUnit }: Props) {
  const [expandedType, setExpandedType] = useState<FieldType | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const summary = useMemo(() => buildFieldConfigSummary(field), [field]);
  const conflictMap = useMemo(() => buildConflictMap(field.units), [field.units]);

  const unitsByType: Record<FieldType, FieldUnit[]> = useMemo(() => {
    const result: Record<FieldType, FieldUnit[]> = { F11: [], F7: [], F5: [] };
    for (const unit of field.units) {
      result[unit.type].push(unit);
    }
    return result;
  }, [field.units]);

  const selectedConflicts = selectedUnitId ? (conflictMap.get(selectedUnitId) ?? []) : [];

  return (
    <div className="space-y-6">
      {/* Header with summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Plantilla</p>
          <p className="mt-1 text-sm font-bold text-foreground">{summary.templateName}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Slots físicos</p>
          <p className="mt-1 text-sm font-bold text-foreground">{summary.totalSlots} / 6</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unidades activas</p>
          <p className="mt-1 text-sm font-bold text-foreground">{summary.activeUnitIds.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Conflictos</p>
          <p className={`mt-1 text-sm font-bold ${summary.conflicts.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {summary.conflicts.length}
          </p>
        </div>
      </div>

      {/* Visual preview */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h4 className="font-heading text-sm font-bold text-foreground">Vista de cancha</h4>
        </div>
        <CourtLayoutPreview
          units={field.units}
          highlightType={expandedType}
        />
      </div>

      {/* Unit management by type */}
      <div className="space-y-4">
        <h4 className="font-heading text-sm font-bold text-foreground">Gestión de unidades</h4>

        {(['F11', 'F7', 'F5'] as FieldType[]).map((type) => {
          const typeUnits = unitsByType[type];
          if (typeUnits.length === 0) return null;

          const isExpanded = expandedType === type;
          const activeCount = typeUnits.filter((u) => u.is_active !== false).length;
          const maxBookings = getMaxSimultaneousBookings(type);

          return (
            <div key={type} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Type header */}
              <button
                type="button"
                onClick={() => setExpandedType(isExpanded ? null : type)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold field-badge-${type === 'F11' ? '11' : type === 'F7' ? '7' : '5'}`}>
                    {type}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {type === 'F11' ? 'Fútbol 11' : type === 'F7' ? 'Fútbol 7' : 'Fútbol 5'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activeCount} de {typeUnits.length} activas · máx {maxBookings} simultáneas
                    </p>
                  </div>
                </div>
                {isExpanded ? <Minimize2 className="h-4 w-4 text-muted-foreground" /> : <Maximize2 className="h-4 w-4 text-muted-foreground" />}
              </button>

              {/* Expanded unit list */}
              {isExpanded && (
                <div className="border-t border-border">
                  {typeUnits.map((unit) => {
                    const isActive = unit.is_active !== false;
                    const isSelected = selectedUnitId === unit.id;
                    const conflicts = conflictMap.get(unit.id) ?? [];
                    const conflictNames = conflicts
                      .map((id) => field.units.find((u) => u.id === id)?.name)
                      .filter(Boolean);

                    return (
                      <div
                        key={unit.id}
                        className={`flex items-center justify-between gap-3 border-b border-border p-3 last:border-0 transition-all ${
                          isSelected ? 'bg-primary/5' : ''
                        } ${!isActive ? 'opacity-50' : ''}`}
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-start gap-3 text-left"
                          onClick={() => setSelectedUnitId(isSelected ? null : unit.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{unit.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Slots: {unit.slot_ids.join(' + ')}
                            </p>
                            {isSelected && conflicts.length > 0 && (
                              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  Conflictos ({conflicts.length})
                                </div>
                                <p className="mt-0.5 text-[10px] text-amber-600">
                                  No puede coexistir con: {conflictNames.join(', ')}
                                </p>
                              </div>
                            )}
                            {isSelected && conflicts.length === 0 && (
                              <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                                  <Check className="h-3 w-3" />
                                  Sin conflictos
                                </div>
                              </div>
                            )}
                          </div>
                        </button>

                        {onToggleUnit && (
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) => onToggleUnit(unit.id, checked)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conflict matrix summary */}
      {summary.conflicts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-bold text-amber-700">Matriz de conflictos</h4>
          </div>
          <p className="text-xs text-amber-600 mb-3">
            Las siguientes unidades comparten zonas físicas. Cuando una se reserva, las demás quedan bloqueadas para ese horario.
          </p>
          <div className="space-y-1.5">
            {summary.conflicts.slice(0, 10).map((pair, i) => {
              const unitA = field.units.find((u) => u.id === pair.unitA);
              const unitB = field.units.find((u) => u.id === pair.unitB);
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-amber-700">{unitA?.name}</span>
                  <span className="text-amber-400">&harr;</span>
                  <span className="font-semibold text-amber-700">{unitB?.name}</span>
                  <span className="text-amber-500">({pair.sharedSlots.join(', ')})</span>
                </div>
              );
            })}
            {summary.conflicts.length > 10 && (
              <p className="text-[10px] text-amber-500">...y {summary.conflicts.length - 10} más</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
