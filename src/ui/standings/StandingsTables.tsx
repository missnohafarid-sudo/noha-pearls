import type { GroupStanding, Standings } from '../../domain/standings';
import { t } from '../../i18n';
import { HeartButton } from '../common/HeartButton';
import './standings.css';

const ts = t.standings;

/** The groups' cumulative points and hearts, scrolling sideways when the screen is narrow. */
export function GroupStandingsTable({ groups }: { groups: readonly GroupStanding[] }) {
  return (
    <div className="standings__scroll">
      <table className="table table--nowrap">
        <thead>
          <tr>
            <th>{ts.groups.name}</th>
            <th>{ts.groups.score}</th>
            <th>{ts.groups.hearts}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupId}>
              <td>{group.name}</td>
              <td>{t.common.scoreOf(group.score, group.max)}</td>
              <td>
                <HeartButton owner={group.name} count={group.hearts} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The groups' table and the students' table. */
export function StandingsTables({ standings }: { standings: Standings }) {
  return (
    <>
      <section className="card stack">
        <h2 className="card__title">{ts.groups.title}</h2>
        <GroupStandingsTable groups={standings.groups} />
      </section>
      <section className="card stack">
        <h2 className="card__title">{ts.students.title}</h2>
        <div className="standings__scroll">
          <table className="table table--nowrap">
            <thead>
              <tr>
                <th>{ts.students.name}</th>
                <th>{ts.students.attendance}</th>
                <th>{ts.students.answered}</th>
                <th>{ts.students.points}</th>
                <th>{ts.students.hearts}</th>
                <th>{ts.students.unresponsive}</th>
              </tr>
            </thead>
            <tbody>
              {standings.students.map((student) => (
                <tr key={student.studentId}>
                  <td>{student.name}</td>
                  <td>{t.common.attendedOf(student.attended, student.classes)}</td>
                  <td>{student.answered}</td>
                  <td>{student.points}</td>
                  <td>
                    <HeartButton owner={student.name} count={student.hearts} />
                  </td>
                  <td>{student.unresponsive === 0 ? t.monitor.dash : student.unresponsive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
