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

function validateUnitLabel(label: string): string | undefined {
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 20) return 'Unit label cannot exceed 20 characters';
  if (/[<>&"']/.test(trimmed)) {
    return 'Unit label cannot contain special characters < > & " \'';
  }
  return undefined;
}

export function TagConfigurationContent() {
  const { toast } = useToast();
  const { preferences, isLoading, error } = useStudyPreferences();
  const [unitByTag, setUnitByTag] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!preferences) return;

    const nextUnits = Object.fromEntries(
      preferences.customTags.map((tag) => {
        const key = normalizeStudyTagKey(tag);
        return [key, preferences.tagConfigs?.[key]?.unitLabel ?? ''];
      }),
    );

    setUnitByTag(nextUnits);
    setFieldErrors({});
  }, [preferences]);

  const hasValidationErrors = useMemo(
    () => Object.values(fieldErrors).some((errorMsg) => !!errorMsg),
    [fieldErrors],
  );

  const isDirty = useMemo(() => {
    if (!preferences) return false;

    const current = Object.fromEntries(
      Object.entries(unitByTag)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
    const saved = Object.fromEntries(
      Object.entries(preferences.tagConfigs ?? {})
        .map(([key, cfg]) => [normalizeStudyTagKey(key), cfg.unitLabel.trim()])
        .filter(([, value]) => value.length > 0),
    );

    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [preferences, unitByTag]);

  const handleUnitChange = (tag: string, value: string) => {
    const tagKey = normalizeStudyTagKey(tag);
    setUnitByTag((prev) => ({ ...prev, [tagKey]: value }));
    setFieldErrors((prev) => ({
      ...prev,
      [tagKey]: validateUnitLabel(value),
    }));
  };

  const handleSave = async () => {
    if (!preferences || hasValidationErrors) return;

    const nextTagConfigs = Object.fromEntries(
      preferences.customTags
        .map((tag) => {
          const key = normalizeStudyTagKey(tag);
          return [key, unitByTag[key]?.trim() ?? ''] as const;
        })
        .filter(([, unitLabel]) => unitLabel.length > 0)
        .map(([key, unitLabel]) => [key, { unitLabel }]),
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
        Optionally set a unit label per tag (for example, chapters or variations). Leave blank to
        keep minute-only logging.
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
                value={unitByTag[key] ?? ''}
                onChange={(e) => handleUnitChange(tag, e.target.value)}
                placeholder="Optional unit label (e.g. chapters)"
                maxLength={20}
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
