import { blankBadge, MAX_BADGES } from '../../domain/badges';
import type { SlideBadge } from '../../domain/lessonModels';
import { isPearlShade, PEARL_SHADES } from '../../domain/pearlShades';
import { t } from '../../i18n';
import { DirectedBox } from '../forms/DirectedBox';
import { Select } from '../forms/Select';

const SHADE_OPTIONS = PEARL_SHADES.map((shade) => ({ value: shade, label: t.common.pearlShade[shade] }));
const f = t.slides.field;

interface BadgesFieldProps {
  badges: readonly SlideBadge[];
  onChange: (badges: SlideBadge[]) => void;
}

/** The editor of a slide's extra badges: a text and a pearl colour per row. */
export function BadgesField({ badges, onChange }: BadgesFieldProps) {
  const edit = (index: number, change: Partial<SlideBadge>) => onChange(badges.map((badge, i) => (i === index ? { ...badge, ...change } : badge)));
  return (
    <fieldset className="field">
      <legend className="field__label">{f.badges}</legend>
      {badges.map((badge, index) => (
        <div className="field__list-row" key={index}>
          <DirectedBox
            className="input"
            aria-label={f.badgeText(index + 1)}
            placeholder={f.badgeText(index + 1)}
            value={badge.text}
            onChange={(text) => edit(index, { text })}
          />
          <Select
            aria-label={f.badgeColor(index + 1)}
            options={SHADE_OPTIONS}
            value={badge.color}
            onChange={(color) => isPearlShade(color) && edit(index, { color })}
          />
          <button type="button" className="btn btn--small" onClick={() => onChange(badges.filter((_, i) => i !== index))}>
            {t.common.remove}
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--small" disabled={badges.length >= MAX_BADGES} onClick={() => onChange([...badges, blankBadge()])}>
        {t.common.add}
      </button>
    </fieldset>
  );
}
