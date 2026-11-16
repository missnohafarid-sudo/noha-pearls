import { describe, expect, it, vi } from 'vitest';
import { migrate, readMeta, writeMeta } from '../infrastructure/sql/schema';
import { takeSnapshot } from '../infrastructure/sql/snapshot';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { HUB_NAME } from './hubName';
import { HubMove, type FormerHub } from './HubMove';

function memoryKv() {
  const kept = new Map<string, unknown>();
  return { get: <T>(key: string) => kept.get(key) as T | undefined, put: <T>(key: string, value: T) => void kept.set(key, value) };
}

function hub() {
  const db = new NodeSqlDatabase();
  migrate(db);
  const kv = memoryKv();
  return { db, kv, move: new HubMove(kv, db) };
}

/** The former hub as the new one reaches it, counting what it is asked; `failRetire` makes that many retires fail first. */
function reachable(former: ReturnType<typeof hub>, failRetire = 0) {
  const asked = { giveData: 0, retire: 0 };
  const stub: FormerHub = {
    giveData: async () => (asked.giveData += 1, former.move.giveData()),
    retire: async () => {
      asked.retire += 1;
      if (asked.retire <= failRetire) throw new Error('the former hub did not answer');
      former.move.retire();
    },
  };
  return { asked, formerHub: () => stub };
}

describe('the hub moving nearer the school', () => {
  it('takes all the former hub’s data on its first start, and the former hub answers nothing from then on, also when built again', async () => {
    const former = hub();
    writeMeta(former.db, 'device-key', 'the key devices hold');
    former.db.run("INSERT INTO documents (collection, id, body) VALUES ('teachers', 't1', '{}')");
    const fresh = hub();
    const { asked, formerHub } = reachable(former);

    await fresh.move.moveIn(HUB_NAME, formerHub);

    expect(takeSnapshot(fresh.db)).toEqual(takeSnapshot(former.db));
    expect(readMeta(fresh.db, 'device-key')).toBe('the key devices hold');
    expect(asked).toEqual({ giveData: 1, retire: 1 });
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

  it('keeps the data when retiring the former hub fails, and retires it on a later start without copying again', async () => {
    const former = hub();
    const fresh = hub();
    const { asked, formerHub } = reachable(former, 1);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await fresh.move.moveIn(HUB_NAME, formerHub);
    expect(new HubMove(former.kv, former.db).handedOver()).toBe(false);

    await new HubMove(fresh.kv, fresh.db).moveIn(HUB_NAME, formerHub);
    expect(asked).toEqual({ giveData: 1, retire: 2 });
    expect(new HubMove(former.kv, former.db).handedOver()).toBe(true);
  });

  it('leaves a hub of another name as it is, and refuses to start a hub that does not know its name before it has moved', async () => {
    const former = hub();
    const { asked, formerHub } = reachable(former);
    await former.move.moveIn('school', formerHub);
    expect(asked).toEqual({ giveData: 0, retire: 0 });
    await expect(hub().move.moveIn(undefined, formerHub)).rejects.toThrow();

    const moved = hub();
    await moved.move.moveIn(HUB_NAME, formerHub);
    await expect(new HubMove(moved.kv, moved.db).moveIn(undefined, formerHub)).resolves.toBeUndefined();
  });
});
