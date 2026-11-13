import { describe, expect, it } from 'vitest';
import { classroom } from './classKit';
import { connect } from './hubHarness';

const WATCHERS = 500;
const address = (n: number) => `10.${Math.floor(n / 250)}.${n % 250}.1`;

describe('visitors watching a class by its code', () => {
  it('cost one read of the class’s row for a join and for a leave, however many devices watch', async () => {
    const { harness, session, students } = await classroom();
    for (let n = 0; n < WATCHERS; n += 1) await connect(harness, `v-${n}`, null, address(n)).watch(1, 'classLookup', 'watchByCode', session.code);
    const phone = connect(harness, 'joiner', null, '10.200.0.1');
    harness.sql.reset();
    await phone.call(1, 'participants', 'join', session.code, students[0].groupId, students[0].id);
    const joined = harness.sql.rowsRead;
    harness.sql.reset();
    await phone.call(2, 'participants', 'leave', session.id);
    expect(joined).toBeLessThanOrEqual(6);
    expect(harness.sql.rowsRead).toBeLessThanOrEqual(6);
  });

  it('cost nothing at a slide change when the code names no class', async () => {
    const { harness, admin, session } = await classroom();
    for (let n = 0; n < WATCHERS; n += 1) await connect(harness, `w-${n}`, null, address(n)).watch(1, 'classLookup', 'watchByCode', `QQ${String(n).padStart(4, '0')}`);
    harness.sql.reset();
    await admin.call(5, 'sessions', 'goTo', session.id, 1);
    const withInvented = harness.sql.statements;
    const quiet = await classroom();
    quiet.harness.sql.reset();
    await quiet.admin.call(5, 'sessions', 'goTo', quiet.session.id, 1);
    expect(withInvented).toBe(quiet.harness.sql.statements);
  });
});
