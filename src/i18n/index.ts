import { board } from './board';
import { cards } from './cards';
import { common } from './common';
import { home } from './home';
import { join } from './join';
import { lesson } from './lesson';
import { lessonFile } from './lessonFile';
import { lessonPrompt } from './lessonPrompt';
import { library } from './library';
import { monitor } from './monitor';
import { pearlPanel } from './pearlPanel';
import { retention } from './retention';
import { roster } from './roster';
import { scanner } from './scanner';
import { session } from './session';
import { shell } from './shell';
import { slides } from './slides';
import { standings } from './standings';

/**
 * Every word the interface shows. The platform is Arabic-only, so this is a
 * plain typed object: one file per feature, no translation machinery.
 */
export const t = { common, shell, slides, lessonFile, lessonPrompt, home, lesson, library, session, monitor, pearlPanel, join, board, roster, cards, scanner, standings, retention } as const;

export { choiceLetter } from './common';
