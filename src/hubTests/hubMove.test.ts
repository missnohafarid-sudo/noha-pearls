import { describe, expect, it, vi } from 'vitest';
import { migrate, readMeta, writeMeta } from '../infrastructure/sql/schema';
import { restoreSnapshot, takeSnapshot } from '../infrastructure/sql/snapshot';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { HUB_NAME } from '../server/hubName';
import { HubMove, type FormerHub } from '../server/HubMove';
import { memoryKv } from './memoryKv';

function hub() {
  const db = new NodeSqlDatabase();
  migrate(db);
  const kv = memoryKv();
  return { db, kv, move: new HubMove(kv, db) };
}

const isEmpty = (db: NodeSqlDatabase) => Object.values(takeSnapshot(db)).every((rows) => rows.length === 0);

/** The former hub as the new one reaches it, counting what it is asked; `fail` makes that many retires or clears fail first. */
function reachable(former: ReturnType<typeof hub>, fail: { retire?: number; clear?: number } = {}) {
  const asked = { giveData: 0, retire: 0, clear: 0 };
  const stub: FormerHub = {
    giveData: async () => (asked.giveData += 1, former.move.giveData()),
    retire: async () => {
      asked.retire += 1;
      if (asked.retire <= (fail.retire ?? 0)) throw new Error('the former hub did not answer');
      former.move.retire();
    },
    clear: async () => {
      asked.clear += 1;
      if (asked.clear <= (fail.clear ?? 0)) throw new Error('the former hub did not answer');
      if (!former.move.mayClear()) throw new Error('refused');
      former.db.transaction(() => restoreSnapshot(former.db, {}));
    },
  };
  return { asked, formerHub: () => stub };
}

describe('the hub moving nearer the school', () => {
  it('takes all the former hub’s data on its first start; the former hub then answers nothing, also when built again, and keeps nothing', async () => {
    const former = hub();
    writeMeta(former.db, 'device-key', 'the key devices hold');
    former.db.run("INSERT INTO documents (collection, id, body) VALUES ('teachers', 't1', '{}')");
    const before = takeSnapshot(former.db);
    const fresh = hub();
    const { asked, formerHub } = reachable(former);

    await fresh.move.moveIn(HUB_NAME, formerHub);

    expect(takeSnapshot(fresh.db)).toEqual(before);
    expect(readMeta(fresh.db, 'device-key')).toBe('the key devices hold');
    expect(isEmpty(former.db), 'the former hub still keeps the school').toBe(true);
    expect(asked).toEqual({ giveData: 1, retire: 1, clear: 1 });
    expect(fresh.move.handedOver()).toBe(false);
    expect(former.move.handedOver()).toBe(true);
    expect(new HubMove(former.kv, former.db).handedOver(), 'the former hub answered again once built again').toBe(true);
  });

  it('moves once: a later start copies nothing again', async () => {
    const former = hub();
    const fresh = hub();
    const { asked, formerHub } = reachable(former);
    await fresh.move.moveIn(HUB_NAME, formerHub);
    fresh.db.run("INSERT INTO documents (collection, id, body) VALUES ('teachers', 'after', '{}')");

    await new HubMove(fresh.kv, fresh.db).moveIn(HUB_NAME, formerHub);

    expect(asked.giveData).toBe(1);
    expect(fresh.db.all("SELECT id FROM documents WHERE id = 'after'")).toHaveLength(1);
  });

  it('does not start when retiring the former hub fails, keeps the data it took, and retires it on the next start without copying again', async () => {
    const former = hub();
    former.db.run("INSERT INTO documents (collection, id, body) VALUES ('teachers', 't1', '{}')");
    const fresh = hub();
    const { asked, formerHub } = reachable(former, { retire: 1 });

    await expect(fresh.move.moveIn(HUB_NAME, formerHub)).rejects.toThrow();
    expect(takeSnapshot(fresh.db)).toEqual(takeSnapshot(former.db));
    expect(new HubMove(former.kv, former.db).handedOver()).toBe(false);
    expect(asked.clear, 'a hub that has not handed over was asked to delete the school').toBe(0);

    await new HubMove(fresh.kv, fresh.db).moveIn(HUB_NAME, formerHub);
    expect(asked).toEqual({ giveData: 1, retire: 2, clear: 1 });
    expect(new HubMove(former.kv, former.db).handedOver()).toBe(true);
  });

  it('starts when deleting the former hub’s copy fails, and deletes it on the next start; after that it asks nothing', async () => {
    const former = hub();
    former.db.run("INSERT INTO documents (collection, id, body) VALUES ('teachers', 't1', '{}')");
    const fresh = hub();
    const { asked, formerHub } = reachable(former, { clear: 1 });
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await fresh.move.moveIn(HUB_NAME, formerHub);
    expect(reported).toHaveBeenCalledOnce();
    expect(isEmpty(former.db)).toBe(false);
    reported.mockRestore();

    await new HubMove(fresh.kv, fresh.db).moveIn(HUB_NAME, formerHub);
    expect(isEmpty(former.db)).toBe(true);
    await new HubMove(fresh.kv, fresh.db).moveIn(HUB_NAME, formerHub);
    expect(asked).toEqual({ giveData: 1, retire: 1, clear: 2 });
    expect(isEmpty(fresh.db)).toBe(false);
  });

  it('lets only a hub that has handed over for good delete what it keeps', () => {
    const former = hub();
    expect(former.move.mayClear()).toBe(false);
    former.move.giveData();
    expect(former.move.mayClear(), 'a hub still giving its data may lose the only copy').toBe(false);
    former.move.retire();
    expect(former.move.mayClear()).toBe(true);
  });

  it('leaves a hub of another name as it is, and refuses to start a hub that does not know its name before it has moved', async () => {
    const former = hub();
    const { asked, formerHub } = reachable(former);
    await former.move.moveIn('school', formerHub);
    expect(asked).toEqual({ giveData: 0, retire: 0, clear: 0 });
    await expect(hub().move.moveIn(undefined, formerHub)).rejects.toThrow();

    const moved = hub();
    await moved.move.moveIn(HUB_NAME, formerHub);
    await expect(new HubMove(moved.kv, moved.db).moveIn(undefined, formerHub)).resolves.toBeUndefined();
  });
});
