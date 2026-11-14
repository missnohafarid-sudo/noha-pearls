import { useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { Checkbox } from './Checkbox';
import { Select } from './Select';
import { Stepper } from './Stepper';
import './forms.css';

/** The mark a slide-text box carries, for the tools bar that works on the box she was last in. */
export const SLIDE_TEXT_ATTRIBUTE = 'data-slide-text';

export interface SelectOption {
  value: string | number | boolean | null;
  label: string;
}

interface FieldBase<T> {
  key: keyof T & string;
  hint?: string;
}

type Labelled<T> = FieldBase<T> & { label: string };

/** Describes one editable field of a `T`. A page's whole editing form is a list of these. */
export type FieldSpec<T> =
  | (Labelled<T> & { kind: 'boolean' })
  /** `slideText` marks the text of a slide, where the editor's hide button works. */
  | (Labelled<T> & { kind: 'textarea'; slideText?: true })
  /** `ltr` writes an address or a code left to right, even in a right-to-left form. */
  | (Labelled<T> & { kind: 'text'; ltr?: true })
  | (Labelled<T> & { kind: 'number'; min?: number; max?: number })
  | (Labelled<T> & { kind: 'select'; options: (value: T) => SelectOption[] })
  /** A field whose editor is its own component: it draws itself, its label included, from the record and reports its new value. */
  | (FieldBase<T> & { kind: 'custom'; render: (record: T, onChange: (value: unknown) => void) => ReactNode })
  | (Labelled<T> & { kind: 'list'; min: number; max: number; itemLabel: (index: number) => string;
      /** As for `text`: the items are addresses. */
      ltr?: true;
      /** Removes one item; use it when the record has other fields that depend on the item's position. */
      removeItem?: (record: T, index: number) => T;
    });

interface SchemaFormProps<T> {
  fields: readonly FieldSpec<T>[];
  value: T;
  /** Called with the whole updated value on every edit. */
  onChange: (next: T) => void;
  /** Change it when the form should show a different record (e.g. the record's id). */
  resetKey: string;
  /** The record's own repair rule, applied to every edit so the form shows what will be saved. */
  normalize?: (value: T) => T;
}

/**
 * The one generic editing form behind every admin panel. It keeps its own draft
 * while typing, so a slow or live-updating store never moves the caret.
 * `T` must be exactly what this form owns: the draft is saved whole.
 */
export function SchemaForm<T extends object>({ fields, value, onChange, resetKey, normalize }: SchemaFormProps<T>) {
  const [edit, setEdit] = useState({ key: resetKey, draft: value });
  // A different record replaces the draft at once: the fields may not even fit the old one.
  if (edit.key !== resetKey) setEdit({ key: resetKey, draft: value });
  const draft = edit.key === resetKey ? edit.draft : value;

  const replace = (edited: T) => {
    const next = normalize ? normalize(edited) : edited;
    setEdit({ key: resetKey, draft: next });
    onChange(next);
  };
  const set = (key: keyof T & string, fieldValue: unknown) => replace({ ...draft, [key]: fieldValue });

  return (
    <div className="stack">
      {fields.map((field) => (
        <Field
          key={`${resetKey}:${field.key}`}
          field={field}
          record={draft}
          onChange={(v) => set(field.key, v)}
          onReplace={(next) => replace(next)}
        />
      ))}
    </div>
  );
}

interface FieldProps<T> {
  field: FieldSpec<T>;
  record: T;
  onChange: (value: unknown) => void;
  /** Replaces the whole record (for edits that touch more than this field). */
  onReplace: (next: T) => void;
}

function Field<T extends object>({ field, record, onChange, onReplace }: FieldProps<T>) {
  const value: unknown = record[field.key];
  const hint = field.hint ? <span className="field__hint">{field.hint}</span> : null;

  switch (field.kind) {
    case 'text':
      return (
        <label className="field">
          <span className="field__label">{field.label}</span>
          <input className="input" dir={field.ltr ? 'ltr' : undefined} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </label>
      );
    case 'textarea':
      return (
        <label className="field">
          <span className="field__label">{field.label}</span>
          <textarea className="input" rows={5} {...(field.slideText ? { [SLIDE_TEXT_ATTRIBUTE]: '' } : {})} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </label>
      );
    case 'number':
      return (
        <div className="field">
          <span className="field__label">{field.label}</span>
          <Stepper
            label={field.label}
            decreaseLabel={t.common.decrease}
            increaseLabel={t.common.increase}
            min={field.min}
            max={field.max}
            value={Number(value ?? 0)}
            onChange={onChange}
          />
          {hint}
        </div>
      );
    case 'boolean':
      return (
        <div className="field">
          <Checkbox checked={Boolean(value)} onChange={onChange} label={field.label} />
          {hint}
        </div>
      );
    case 'select': {
      const options = field.options(record);
      const selected = options.findIndex((option) => option.value === value);
      return (
        <label className="field">
          <span className="field__label">{field.label}</span>
          <Select
            options={options.map((option, index) => ({ value: String(index), label: option.label }))}
            value={String(selected)}
            onChange={(index) => onChange(options[Number(index)].value)}
          />
          {hint}
        </label>
      );
    }
    case 'custom':
      return (
        <div className="field">
          {field.render(record, onChange)}
          {hint}
        </div>
      );
    case 'list': {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="field">
          <legend className="field__label">{field.label}</legend>
          {items.map((item, index) => (
            <div className="field__list-row" key={index}>
              <input
                className="input"
                dir={field.ltr ? 'ltr' : undefined}
                aria-label={field.itemLabel(index)}
                placeholder={field.itemLabel(index)}
                value={item}
                onChange={(e) => onChange(items.map((old, i) => (i === index ? e.target.value : old)))}
              />
              <button
                type="button"
                className="btn btn--small"
                disabled={items.length <= field.min}
                onClick={() => (field.removeItem ? onReplace(field.removeItem(record, index)) : onChange(items.filter((_, i) => i !== index)))}
              >
                {t.common.remove}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--small"
            disabled={items.length >= field.max}
            onClick={() => onChange([...items, ''])}
          >
            {t.common.add}
          </button>
          {hint}
        </fieldset>
      );
    }
  }
}
