import { useEffect, useMemo, useState } from 'react';
import { normalizeStudyTagKey } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useStudyPreferences, updateStudyPreferences } from '@/hooks/use-study-preferences';

interface FieldErrorMap {
  [tagKey: string]: string | undefined;
}

interface TagConfigDraft {
  unitLabel: string;
  minutesPerUnit: string;
}

function validateUnitLabel(label: string): string | undefined {
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 20) return 'Unit label cannot exceed 20 characters';
  if (/[<>&"']/.test(trimmed)) {
    return 'Unit label cannot contain special characters < > & " \'';
  }
  return undefined;
}

function validateMinutesPerUnit(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 'Minutes per unit must be a valid number';
  if (parsed <= 0) return 'Minutes per unit must be greater than 0';
  if (parsed > 999) return 'Minutes per unit cannot exceed 999';
  return undefined;
}

export function TagConfigurationContent() {
  const { toast } = useToast();
  const { preferences, isLoading, error } = useStudyPreferences();
  const [configByTag, setConfigByTag] = useState<Record<string, TagConfigDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!preferences) return;

    const nextConfigs = Object.fromEntries(
      preferences.customTags.map((tag) => {
        const key = normalizeStudyTagKey(tag);
        return [
          key,
          {
            unitLabel: preferences.tagConfigs?.[key]?.unitLabel ?? '',
            minutesPerUnit:
              preferences.tagConfigs?.[key]?.minutesPerUnit !== undefined
                ? String(preferences.tagConfigs[key].minutesPerUnit)
                : '',
          } satisfies TagConfigDraft,
        ];
      }),
    );

    setConfigByTag(nextConfigs);
    setFieldErrors({});
  }, [preferences]);

  const hasValidationErrors = useMemo(
    () => Object.values(fieldErrors).some((errorMsg) => !!errorMsg),
    [fieldErrors],
  );

  const isDirty = useMemo(() => {
    if (!preferences) return false;

    const current = Object.entries(configByTag).reduce<Record<string, TagConfigDraft>>(
      (acc, [key, value]) => {
        const unitLabel = value.unitLabel.trim();
        const minutesPerUnit = value.minutesPerUnit.trim();
        if (unitLabel.length > 0 && minutesPerUnit.length > 0) {
          acc[key] = { unitLabel, minutesPerUnit };
        }
        return acc;
      },
      {},
    );

    const saved = Object.entries(preferences.tagConfigs ?? {}).reduce<Record<string, TagConfigDraft>>(
      (acc, [key, cfg]) => {
        const unitLabel = cfg.unitLabel.trim();
        const minutesPerUnit =
          cfg.minutesPerUnit !== undefined ? String(cfg.minutesPerUnit).trim() : '';
        if (unitLabel.length > 0 && minutesPerUnit.length > 0) {
          acc[normalizeStudyTagKey(key)] = { unitLabel, minutesPerUnit };
        }
        return acc;
      },
      {},
    );

    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [configByTag, preferences]);

  const validateTagConfigRow = (nextValue: TagConfigDraft) => {
    const labelError = validateUnitLabel(nextValue.unitLabel);
    const minutesError = validateMinutesPerUnit(nextValue.minutesPerUnit);

    if (labelError) return labelError;
    if (minutesError) return minutesError;

    const hasLabel = nextValue.unitLabel.trim().length > 0;
    const hasMinutes = nextValue.minutesPerUnit.trim().length > 0;
    if (hasLabel !== hasMinutes) {
      return 'Set both unit label and minutes per unit, or leave both blank';
    }

    return undefined;
  };

  const handleUnitChange = (tag: string, value: string) => {
    const tagKey = normalizeStudyTagKey(tag);
    setConfigByTag((prev) => {
      const nextValue = {
        ...(prev[tagKey] ?? { unitLabel: '', minutesPerUnit: '' }),
        unitLabel: value,
      };
      setFieldErrors((prevErrors) => ({
        ...prevErrors,
        [tagKey]: validateTagConfigRow(nextValue),
      }));
      return { ...prev, [tagKey]: nextValue };
    });
  };

  const handleMinutesChange = (tag: string, value: string) => {
    const tagKey = normalizeStudyTagKey(tag);
    setConfigByTag((prev) => {
      const nextValue = {
        ...(prev[tagKey] ?? { unitLabel: '', minutesPerUnit: '' }),
        minutesPerUnit: value,
      };
      setFieldErrors((prevErrors) => ({
        ...prevErrors,
        [tagKey]: validateTagConfigRow(nextValue),
      }));
      return { ...prev, [tagKey]: nextValue };
    });
  };

  const handleSave = async () => {
    if (!preferences || hasValidationErrors) return;

    const nextTagConfigs = Object.fromEntries(
      preferences.customTags
        .map((tag) => {
          const key = normalizeStudyTagKey(tag);
          const draft = configByTag[key] ?? { unitLabel: '', minutesPerUnit: '' };
          return [key, draft] as const;
        })
        .map(([key, draft]) => ({
          key,
          unitLabel: draft.unitLabel.trim(),
          minutesPerUnit: draft.minutesPerUnit.trim(),
        }))
        .filter((cfg) => cfg.unitLabel.length > 0 && cfg.minutesPerUnit.length > 0)
        .map((cfg) => [cfg.key, { unitLabel: cfg.unitLabel, minutesPerUnit: Number(cfg.minutesPerUnit) }]),
    );

    setIsSaving(true);
    try {
      await updateStudyPreferences({
        ...preferences,
        tagConfigs: nextTagConfigs,
      });
      toast({
        title: 'Saved',
        description: 'Tag configuration updated.',
      });
    } catch (saveError) {
      toast({
        title: 'Error',
        description:
          saveError instanceof Error ? saveError.message : 'Failed to save tag configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-600">Loading tag configuration...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">Failed to load tag configuration: {error}</div>;
  }

  if (!preferences || preferences.customTags.length === 0) {
    return <div className="text-sm text-gray-600">No tags configured yet.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Optionally set a unit label and conversion rate per tag. Example: variations at 0.25
        minutes per unit. Leave both blank to keep minute-only logging.
      </p>

      <div className="space-y-3">
        {preferences.customTags.map((tag) => {
          const key = normalizeStudyTagKey(tag);
          const errorMessage = fieldErrors[key];

          return (
            <div key={tag} className="space-y-1">
              <Label htmlFor={`tag-unit-${key}`} className="text-sm font-medium text-gray-700">
                {tag}
              </Label>
              <Input
                id={`tag-unit-${key}`}
                value={configByTag[key]?.unitLabel ?? ''}
                onChange={(e) => handleUnitChange(tag, e.target.value)}
                placeholder="Optional unit label (e.g. chapters)"
                maxLength={20}
              />
              <Input
                id={`tag-minutes-${key}`}
                type="number"
                step="0.01"
                min="0.01"
                value={configByTag[key]?.minutesPerUnit ?? ''}
                onChange={(e) => handleMinutesChange(tag, e.target.value)}
                placeholder="Minutes per unit (e.g. 0.25)"
              />
              {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={!isDirty || hasValidationErrors || isSaving}>
        {isSaving ? 'Saving...' : 'Save tag configuration'}
      </Button>
    </div>
  );
}

export default TagConfigurationContent;
