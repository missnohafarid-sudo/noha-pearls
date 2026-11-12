import { useMemo } from 'react';
import type { Group, Id, SchoolClass, Student } from '../../domain/models';
import { choiceLetter, t } from '../../i18n';
import type { CardCodec } from '../../services/Services';
import { Loading } from '../common/PageState';
import { useCardCodec, useClassRoster } from '../hooks/data';
import { useShownClass } from '../roster/useShownClass';
import './cards.css';

/** Physical edges in marker order (0 = top, then clockwise). Letters are not right-to-left. */
const EDGES = ['top', 'right', 'bottom', 'left'] as const;

/** Printable answer cards of one class, one per student, two to an A4 page. */
export function CardsPage({ classId }: { classId: Id | undefined }) {
  const found = useShownClass('cards', classId);
  if (!found) return <Loading />;
  if (!found.shown) return <p className="page muted">{classId === undefined ? t.cards.noClass : t.roster.classNotFound}</p>;
  return <ClassCards schoolClass={found.shown} />;
}

function ClassCards({ schoolClass }: { schoolClass: SchoolClass }) {
  const codec = useCardCodec();
  const roster = useClassRoster(schoolClass.id);
  const groupNames = useMemo(() => new Map((roster?.groups ?? []).map((g: Group) => [g.id, g.name])), [roster]);

  if (!codec || !roster) return <Loading />;
  const { students } = roster;

  return (
    <div className="page">
      <div className="cards-toolbar no-print stack">
        <h1 className="page__title">{t.cards.title(schoolClass.name)}</h1>
        <p className="muted">{t.cards.howTo}</p>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            {t.cards.print}
          </button>
        </div>
      </div>
      {students.length === 0 && <p className="muted no-print">{t.cards.empty}</p>}
      <div className="cards-sheet">
        {students.map((student) => (
          <AnswerCard key={student.id} student={student} groupName={groupNames.get(student.groupId) ?? ''} codec={codec} />
        ))}
      </div>
    </div>
  );
}

interface AnswerCardProps {
  student: Student;
  groupName: string;
  codec: CardCodec;
}

/** One student's card: the marker, a letter beside each edge, and a footer with who it belongs to. */
function AnswerCard({ student, groupName, codec }: AnswerCardProps) {
  const svg = useMemo(() => codec.markerSvg(student.cardNumber), [codec, student.cardNumber]);
  return (
    <article className="answer-card" dir="ltr">
      <div className="answer-card__frame">
        <div
          className="answer-card__marker"
          role="img"
          aria-label={t.cards.markerLabel(student.cardNumber)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {EDGES.map((edge, index) => (
          <span key={edge} className={`answer-card__letter answer-card__letter--${edge}`}>
            {choiceLetter(index)}
          </span>
        ))}
      </div>
      <footer className="answer-card__footer" dir="auto">
        <strong>{student.cardNumber}</strong>
        <span>{student.name}</span>
        <span>{groupName}</span>
      </footer>
    </article>
  );
}
