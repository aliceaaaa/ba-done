import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useOptionalListService, type ListSummary } from '@/entities/list';
import {
  DAY_PERIOD_LABELS,
  PriorityPicker,
  formatReminder,
  formatTaskDate,
  useTaskService,
  type PrioritySlot,
} from '@/entities/task';
import { addMinutesToLocalDateTime } from '@/shared/lib/local-date';
import { formatLocalTime } from '@/shared/lib/picker-values';
import { VOICE_CONFIG } from '@/shared/config/voice-config';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { DateField } from '@/shared/ui/date-field';
import { DateTimeField } from '@/shared/ui/date-time-field';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import type { VoiceAmbiguity, VoiceField } from '../model/voice-command';
import { useVoice, useVoiceSessionState } from '../model/voice-context';
import type { VoiceExecutionFailure } from '../model/voice-command-executor';
import type { PendingVoiceCommand } from '../model/voice-command-session';
import {
  PREVIEW_KIND_LABELS,
  previewValuesFromDraft,
  saveInputFromPreview,
  type PreviewKind,
  type VoicePreviewValues,
} from '../model/voice-preview-values';
import { destinationHref } from './voice-host';

export const PREVIEW_TEXT = {
  title: 'Voice command',
  youSaid: 'You said',
  type: 'Type',
  warnings: 'Check before saving',
  missing: 'Missing',
  cancel: 'Cancel',
  save: 'Save',
  list: 'List',
  createList: 'Create list',
  newListName: 'New list name',
  quantity: 'Quantity',
  unit: 'Unit',
  itemTitle: 'Title',
  date: 'Date',
  chooseDate: 'Choose date',
  chooseStart: 'Choose start',
  priority: 'Priority',
  reminder: 'Reminder',
  removeReminder: 'Remove reminder',
  time: 'Time',
  clearTime: 'Clear time',
  allDay: 'All day',
  startDate: 'Start date',
  startTime: 'Start time',
  endDate: 'End date',
  endTime: 'End time',
  empty: 'No voice command is open.',
  close: 'Close',
  pastDate: 'This date is in the past.',
} as const;

const FIELD_LABELS: Record<VoiceField, string> = {
  kind: 'Type',
  title: 'Title',
  targetList: 'List',
  date: 'Date',
  priority: 'Priority',
  eventStart: 'Start',
  eventEnd: 'End',
  reminder: 'Reminder',
};

const KIND_OPTIONS: readonly ChipOption<PreviewKind | 'none'>[] = (
  Object.keys(PREVIEW_KIND_LABELS) as PreviewKind[]
).map((kind) => ({ value: kind, label: PREVIEW_KIND_LABELS[kind] }));

export function describeAmbiguity(ambiguity: VoiceAmbiguity): string {
  switch (ambiguity.type) {
    case 'taskOrEvent':
      return 'Is this a task or an event? Choose the type.';
    case 'listNotFound':
      return `There is no list named “${ambiguity.listName}”. Choose a list or create it.`;
    case 'multipleLists':
      return `Several lists match “${ambiguity.listName}”. Choose the exact list.`;
    case 'eventEndSuggested':
      return `The end was not said. Suggested end: ${formatLocalTime(ambiguity.suggestedEnd.slice(11))}, ${VOICE_CONFIG.suggestedEventMinutes} minutes after the start.`;
    case 'unrecognizedDate':
      return `Could not understand the date “${ambiguity.text}”. Choose it below.`;
    case 'unrecognizedTime':
      return `Could not understand the time “${ambiguity.text}”. Choose it below.`;
  }
}

function FieldMessage({ message }: { message: string | undefined }) {
  return message === undefined ? null : (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

type PreviewFormProps = {
  pending: PendingVoiceCommand;
  onClose: () => void;
};

function PreviewForm({ pending, onClose }: PreviewFormProps) {
  const services = useVoice();
  const tasks = useTaskService();
  const listService = useOptionalListService();
  const router = useRouter();
  const today = useMemo(() => tasks.getToday(), [tasks]);
  const { draft } = pending;
  const [values, setValues] = useState<VoicePreviewValues>(() =>
    previewValuesFromDraft(draft, today),
  );
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [slots, setSlots] = useState<PrioritySlot[] | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [general, setGeneral] = useState<string | null>(pending.error);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (listService === null) {
      return;
    }
    let active = true;
    void listService
      .getLists()
      .then((next) => {
        if (active) {
          setLists(next);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [listService]);

  useEffect(() => {
    if (values.kind !== 'rankedTask' || !values.dateSet) {
      return;
    }
    let active = true;
    void tasks
      .getPriorityAvailability(values.date)
      .then((next) => {
        if (active) {
          setSlots(next);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tasks, values.kind, values.date, values.dateSet, slotsVersion]);

  const candidateIds = draft.ambiguities.flatMap((item) =>
    item.type === 'multipleLists' ? item.candidateIds : [],
  );
  const orderedLists = [
    ...lists.filter((list) => candidateIds.includes(list.id)),
    ...lists.filter((list) => !candidateIds.includes(list.id)),
  ];
  const spokenListName = draft.ambiguities.flatMap((item) =>
    item.type === 'listNotFound' ? [item.listName] : [],
  )[0];

  function update(patch: Partial<VoicePreviewValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function changeKind(kind: PreviewKind) {
    setErrors({});
    if (
      kind === 'calendarEvent' &&
      !values.startSet &&
      draft.date !== null &&
      draft.exactTime !== null
    ) {
      const start = `${draft.date}T${draft.exactTime}`;
      const end = addMinutesToLocalDateTime(start, VOICE_CONFIG.suggestedEventMinutes);
      update({
        kind,
        startSet: true,
        startDate: draft.date,
        startTime: draft.exactTime,
        endDate: end.slice(0, 10),
        endTime: end.slice(11),
      });
      return;
    }
    update({ kind });
  }

  function showFailure(failure: VoiceExecutionFailure) {
    setErrors(failure.fields);
    if (failure.conflict !== null) {
      const { conflict } = failure;
      setGeneral(
        `Priority ${conflict.priority} is taken by “${conflict.occupiedBy.title}”. Free priorities: ${
          conflict.freePriorities.length === 0 ? 'none' : conflict.freePriorities.join(', ')
        }.`,
      );
      update({ priority: null });
      setSlotsVersion((version) => version + 1);
      return;
    }
    setGeneral(Object.keys(failure.fields).length > 0 ? null : failure.message);
  }

  async function save() {
    const prepared = saveInputFromPreview(values);
    if (!prepared.ok) {
      setErrors({ [prepared.field]: prepared.message });
      setGeneral(null);
      return;
    }
    setSaving(true);
    const result = await services.executor.execute(pending.commandId, prepared.input);
    setSaving(false);
    if (!result.ok) {
      showFailure(result);
      return;
    }
    services.session.closePreview();
    services.session.showNotice({ message: result.message, undo: result.undo, destination: null });
    onClose();
    router.navigate(destinationHref(result.destination));
  }

  const missing = draft.missingFields.map((field) => FIELD_LABELS[field]);
  const warnings = draft.ambiguities.map(describeAmbiguity);
  if (values.kind === 'rankedTask' && values.dateSet && values.date < today) {
    warnings.push(PREVIEW_TEXT.pastDate);
  }
  const isMissing = (field: VoiceField) => draft.missingFields.includes(field);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="voice-command-preview"
    >
      <View style={styles.transcript}>
        <Text style={styles.label}>{PREVIEW_TEXT.youSaid}</Text>
        <Text style={styles.transcriptText} testID="voice-transcript">
          {draft.transcript}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, isMissing('kind') && styles.missingLabel]}>
          {PREVIEW_TEXT.type}
        </Text>
        <ChipRow
          accessibilityLabel={PREVIEW_TEXT.type}
          options={KIND_OPTIONS}
          selected={values.kind ?? 'none'}
          onSelect={(kind) => kind !== 'none' && changeKind(kind)}
        />
        <FieldMessage message={errors.kind} />
      </View>

      {warnings.length > 0 ? (
        <View style={styles.warnings} accessibilityRole="alert" testID="voice-warnings">
          <Text style={styles.warningTitle}>{PREVIEW_TEXT.warnings}</Text>
          {warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              • {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {missing.length > 0 ? (
        <Text style={styles.missing} testID="voice-missing">
          {PREVIEW_TEXT.missing}: {missing.join(', ')}
        </Text>
      ) : null}

      <View style={[styles.field, isMissing('title') && styles.missingField]}>
        <LabeledInput
          label={PREVIEW_TEXT.itemTitle}
          value={values.title}
          onChangeText={(title) => update({ title })}
        />
        <FieldMessage message={errors.title} />
      </View>

      {values.kind === 'listItem' ? (
        <>
          <View style={[styles.field, isMissing('targetList') && styles.missingField]}>
            <Text style={styles.label}>{PREVIEW_TEXT.list}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={PREVIEW_TEXT.list}
              style={styles.chips}
            >
              {orderedLists.map((list) => {
                const selected =
                  values.listChoice?.type === 'existing' && values.listChoice.listId === list.id;
                return (
                  <Pressable
                    key={list.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={list.title}
                    onPress={() => update({ listChoice: { type: 'existing', listId: list.id } })}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {list.title}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: values.listChoice?.type === 'new' }}
                accessibilityLabel={PREVIEW_TEXT.createList}
                onPress={() =>
                  update({
                    listChoice: {
                      type: 'new',
                      title: spokenListName ?? draft.targetListName ?? '',
                    },
                  })
                }
                style={[styles.chip, values.listChoice?.type === 'new' && styles.chipSelected]}
              >
                <Text
                  style={[
                    styles.chipText,
                    values.listChoice?.type === 'new' && styles.chipTextSelected,
                  ]}
                >
                  + {PREVIEW_TEXT.createList}
                </Text>
              </Pressable>
            </View>
            {values.listChoice?.type === 'new' ? (
              <LabeledInput
                label={PREVIEW_TEXT.newListName}
                value={values.listChoice.title}
                onChangeText={(title) => update({ listChoice: { type: 'new', title } })}
              />
            ) : null}
            <FieldMessage message={errors.targetList} />
          </View>
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <LabeledInput
                label={PREVIEW_TEXT.quantity}
                keyboardType="decimal-pad"
                value={values.quantityText}
                onChangeText={(quantityText) => update({ quantityText })}
              />
              <FieldMessage message={errors.quantity} />
            </View>
            <View style={styles.pairItem}>
              <LabeledInput
                label={PREVIEW_TEXT.unit}
                value={values.unit}
                onChangeText={(unit) => update({ unit })}
              />
            </View>
          </View>
        </>
      ) : null}

      {values.kind === 'rankedTask' ? (
        <>
          <View
            style={[
              styles.field,
              (isMissing('date') || errors.date !== undefined) && styles.missingField,
            ]}
          >
            {values.dateSet ? (
              <DateField
                label={PREVIEW_TEXT.date}
                date={values.date}
                today={today}
                onChange={(date) => update({ date, priority: null })}
              />
            ) : (
              <TextButton
                label={PREVIEW_TEXT.chooseDate}
                onPress={() => update({ dateSet: true })}
              />
            )}
            <FieldMessage message={errors.date ?? errors.scheduledDate} />
          </View>
          {values.dateSet && slots !== null ? (
            <View style={[styles.field, isMissing('priority') && styles.missingField]}>
              <Text style={styles.label}>
                {PREVIEW_TEXT.priority}, {formatTaskDate(values.date)}
              </Text>
              <PriorityPicker
                slots={slots}
                selected={values.priority}
                onSelect={(priority) => update({ priority })}
              />
              <FieldMessage message={errors.priority} />
            </View>
          ) : null}
        </>
      ) : null}

      {(values.kind === 'rankedTask' || values.kind === 'futureTask') &&
      (values.exactTime !== null || values.dayPeriod !== null) ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summary}>
            {PREVIEW_TEXT.time}:{' '}
            {values.exactTime !== null
              ? formatLocalTime(values.exactTime)
              : DAY_PERIOD_LABELS[values.dayPeriod ?? 'morning']}
          </Text>
          <TextButton
            label={PREVIEW_TEXT.clearTime}
            onPress={() => update({ exactTime: null, dayPeriod: null })}
          />
        </View>
      ) : null}

      {values.kind === 'calendarEvent' ? (
        <View
          style={[
            styles.field,
            (isMissing('eventStart') || errors.eventStart !== undefined) && styles.missingField,
          ]}
        >
          {values.startSet ? (
            <>
              <View style={styles.switchRow}>
                <Text style={styles.summary}>{PREVIEW_TEXT.allDay}</Text>
                <Switch
                  accessibilityLabel={PREVIEW_TEXT.allDay}
                  value={values.allDay}
                  onValueChange={(allDay) => update({ allDay })}
                />
              </View>
              <View style={styles.pair}>
                <DateTimeField
                  mode="date"
                  label={PREVIEW_TEXT.startDate}
                  value={values.startDate}
                  onChange={(startDate) => update({ startDate })}
                />
                {values.allDay ? null : (
                  <DateTimeField
                    mode="time"
                    label={PREVIEW_TEXT.startTime}
                    value={values.startTime}
                    onChange={(startTime) => update({ startTime })}
                  />
                )}
              </View>
              <FieldMessage message={errors.start} />
              <View style={styles.pair}>
                <DateTimeField
                  mode="date"
                  label={PREVIEW_TEXT.endDate}
                  value={values.endDate}
                  onChange={(endDate) => update({ endDate })}
                />
                {values.allDay ? null : (
                  <DateTimeField
                    mode="time"
                    label={PREVIEW_TEXT.endTime}
                    value={values.endTime}
                    onChange={(endTime) => update({ endTime })}
                  />
                )}
              </View>
              <FieldMessage message={errors.end} />
            </>
          ) : (
            <TextButton
              label={PREVIEW_TEXT.chooseStart}
              onPress={() => update({ startSet: true })}
            />
          )}
          <FieldMessage message={errors.eventStart} />
        </View>
      ) : null}

      {values.reminder !== null && values.kind !== 'listItem' ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summary}>
            {PREVIEW_TEXT.reminder}:{' '}
            {formatReminder({ ...values.reminder, timeZone: tasks.getTimeZone() })}
          </Text>
          <TextButton
            label={PREVIEW_TEXT.removeReminder}
            onPress={() => update({ reminder: null })}
          />
          <FieldMessage message={errors.reminder} />
        </View>
      ) : null}

      {general === null ? null : (
        <Text accessibilityRole="alert" style={styles.error} testID="voice-preview-error">
          {general}
        </Text>
      )}

      <View style={styles.actions}>
        <TextButton
          label={PREVIEW_TEXT.cancel}
          onPress={() => {
            services.session.closePreview();
            onClose();
          }}
        />
        <TextButton
          label={PREVIEW_TEXT.save}
          variant="primary"
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
    </ScrollView>
  );
}

export function VoiceCommandPreviewScreen() {
  const services = useVoice();
  const router = useRouter();
  const { pending } = useVoiceSessionState(services);
  const [openedId] = useState(pending?.commandId ?? null);

  function close() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  if (pending === null || pending.commandId !== openedId) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.summary}>{PREVIEW_TEXT.empty}</Text>
        <TextButton label={PREVIEW_TEXT.close} onPress={close} />
      </View>
    );
  }

  return <PreviewForm key={pending.commandId} pending={pending} onClose={close} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 96,
  },
  transcript: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  transcriptText: {
    fontSize: 17,
    color: colors.text,
  },
  field: {
    gap: spacing.sm,
  },
  missingField: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    paddingLeft: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  missingLabel: {
    color: colors.danger,
  },
  warnings: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.eventSurface,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  warningText: {
    fontSize: 15,
    color: colors.text,
  },
  missing: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.onAccent,
  },
  pair: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  pairItem: {
    flexGrow: 1,
    flexBasis: 140,
    gap: spacing.xs,
  },
  summaryRow: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  summary: {
    fontSize: 16,
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: {
    fontSize: 14,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
