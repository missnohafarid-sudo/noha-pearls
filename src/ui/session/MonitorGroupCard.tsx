import type { MonitorGroup } from "../../domain/analytics";
import type { RewardIndex } from "../../domain/analytics";
import type { Id } from "../../domain/models";
import { pearlsEarned } from "../../domain/scoring";
import { t } from "../../i18n";
import { shownAnswer } from "../../domain/resultRows";
import { AnswerLabel } from "../common/AnswerLabel";
import { HeartButton } from "../common/HeartButton";
import { PearlString } from "../common/PearlString";
import { toneStyle } from "../common/tone";
import { MonitorCell } from "./MonitorCell";
import { StudentStatus } from "./StudentStatus";

interface Props {
  entry: MonitorGroup;
  rewards: RewardIndex;
  /** How many individual questions count in this class. */
  possible: number;
  onGive: (studentId: Id) => void;
  /** Absent when the class takes no more changes: the roll is then only shown. */
  onSetPresent?: (studentId: Id, present: boolean) => void;
}

/** One group: its score, the per-student answer table and the group's shared answers. */
export function MonitorGroupCard({ entry, rewards, possible, onGive, onSetPresent }: Props) {
  const { group, rows, groupCells } = entry;
  const columns = rows[0]?.cells ?? [];
  const joined = rows.filter((r) => r.joined).length;

  return (
    <section className="card card--tone stack" style={toneStyle(group.color)}>
      <div className="row row--between">
        <h2 className="card__title">{group.name}</h2>
        <PearlString earned={pearlsEarned({ groupId: group.id, score: entry.score, max: entry.maxScore })} />
        <span className="chip chip--accent">
          {t.common.scoreOf(entry.score, entry.maxScore)}
        </span>
        <span className="muted">
          {t.monitor.joinedCount(joined, rows.length)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t.monitor.noStudents}</p>
      ) : (
        <div className="monitor__scroll">
          <table className="table table--nowrap">
            <thead>
              <tr>
                <th>{t.monitor.card}</th>
                <th>{t.monitor.student}</th>
                <th>{t.monitor.presence}</th>
                <th>{t.monitor.joined}</th>
                {columns.map((cell) => (
                  <th key={cell.slide.id}>{cell.slide.title}</th>
                ))}
                <th>{t.monitor.interaction}</th>
                <th>{t.monitor.points}</th>
                <th>{t.common.hearts}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.student.id}>
                  <td>{row.student.cardNumber}</td>
                  <td>{row.student.name}</td>
                  <td>
                    <StudentStatus
                      present={row.present}
                      unresponsive={row.unresponsive}
                      onSetPresent={onSetPresent && ((present) => onSetPresent(row.student.id, present))}
                    />
                  </td>
                  <td>
                    <span className={row.joined ? "chip chip--ok" : "chip"}>
                      {row.joined ? t.monitor.joined : t.monitor.notJoined}
                    </span>
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.slide.id}>
                      <MonitorCell cell={cell} />
                    </td>
                  ))}
                  <td>{t.common.interactionsOf(row.answered, possible)}</td>
                  <td>{row.points}</td>
                  <td>
                    <HeartButton
                      owner={row.student.name}
                      count={
                        rewards.of({ kind: "student", id: row.student.id })
                          .total
                      }
                      onGive={() => onGive(row.student.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="stack stack--tight">
        <h3 className="card__title">{t.monitor.groupAnswers}</h3>
        {groupCells.length === 0 && (
          <p className="muted">{t.monitor.noGroupAnswers}</p>
        )}
        {groupCells.map((cell) => (
          <p key={cell.slide.id}>
            <strong>{cell.slide.title}: </strong>
            <span>{cell.answer ? <AnswerLabel answer={shownAnswer(cell.slide, cell.answer)} /> : t.monitor.dash}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
