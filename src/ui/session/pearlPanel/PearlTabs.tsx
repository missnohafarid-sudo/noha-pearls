import { useRef, type KeyboardEvent } from 'react';
import type { Group, Id } from '../../../domain/models';
import { movedTabIndex } from '../../../domain/listNavigation';
import { t } from '../../../i18n';
import { toneStyle } from '../../common/tone';
import { PEARL_TABPANEL_ID, pearlTabId } from './panelId';
import './pearlTabs.css';

interface Props {
  groups: readonly Group[];
  /** The shown tab: a group's id, or null for the overview. */
  selected: Id | null;
  onSelect: (group: Id | null) => void;
}

/** The overview tab and one tab per group, each marked with its colour; the arrow keys move between them. */
export function PearlTabs({ groups, selected, onSelect }: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const keys: (Id | null)[] = [null, ...groups.map((group) => group.id)];
  const current = keys.indexOf(selected);

  /** The arrows belong to the tabs here: they must not also turn the slide. */
  const move = (event: KeyboardEvent) => {
    const next = movedTabIndex(event.key, current, keys.length);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(keys[next]);
    tabs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t.pearlPanel.tabs} className="pearl-tabs" onKeyDown={move}>
      {keys.map((key, index) => {
        const group = groups.find((candidate) => candidate.id === key);
        return (
          <button
            key={key ?? 'all'}
            ref={(button) => {
              tabs.current[index] = button;
            }}
            id={pearlTabId(key)}
            type="button"
            role="tab"
            className="pearl-tab"
            aria-selected={index === current}
            aria-controls={PEARL_TABPANEL_ID}
            tabIndex={index === current ? 0 : -1}
            onClick={() => onSelect(key)}
          >
            {group && <span className="pearl-tab__dot" style={toneStyle(group.color)} aria-hidden="true" />}
            {group ? group.name : t.pearlPanel.all}
          </button>
        );
      })}
    </div>
  );
}
