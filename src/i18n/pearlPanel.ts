import { session } from './session';

const TITLE = 'المجموعات والتعزيز';

/** The panel beside the slide where the teacher sees who answered and gives hearts. */
export const pearlPanel = {
  title: TITLE,
  /** What the pearl button is called: with how many have not answered yet when someone has not. */
  toggle: (waiting: number) => (waiting > 0 ? `${TITLE}، ${session.notAnswered}: ${waiting}` : TITLE),
  /** The quiet button on the stage that opens the panel. */
  notAnsweredCount: (waiting: number) => `${session.notAnswered}: ${waiting}`,
  answered: 'أجابت',
} as const;
