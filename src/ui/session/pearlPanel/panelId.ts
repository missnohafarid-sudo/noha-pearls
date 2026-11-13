import type { Id } from '../../../domain/models';

export const PEARL_PANEL_ID = 'pearl-panel';
export const PEARL_TABPANEL_ID = 'pearl-tabpanel';

/** The id of a tab: the group's, or the overview's when `group` is null. */
export const pearlTabId = (group: Id | null): string => `pearl-tab-${group ?? 'all'}`;
