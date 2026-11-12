import { sortByOrder } from '../domain/lists';
import type { ClassRoster, Group, Id, SchoolClass, Student } from '../domain/models';
import {
  createGroup,
  createSchoolClass,
  createStudent,
  isCardNumberFree,
  rosterOf,
} from '../domain/roster';
import { applyRoster, exportRosterText, parseRosterText, type ImportMode, type RosterChanges, type RosterIssue } from '../domain/rosterFormat';
import { canRemoveClass } from '../domain/sessions';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import type { ClassRosterSource } from './ClassRosterSource';
import { requireName } from './requireName';

export type RosterErrorCode = 'group-not-empty' | 'card-number-taken' | 'group-missing' | 'class-missing' | 'class-in-use';

export class RosterError extends Error {
  constructor(readonly code: RosterErrorCode) {
    super(code);
    this.name = 'RosterError';
  }
}

export type RosterImportResult = { ok: true; changes: RosterChanges } | { ok: false; issues: RosterIssue[] };

/** Classes, their groups and their students. */
export class RosterService implements ClassRosterSource {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
  ) {}

  watchClasses(listener: (classes: SchoolClass[]) => void): Unsubscribe {
    return this.store.watch('classes', {}, (classes) => listener(sortByOrder(classes)));
  }

  /** The groups of one class and the students in them, each in its order. */
  watchRoster(classId: Id, listener: (roster: ClassRoster) => void): Unsubscribe {
    let groups: Group[] | null = null;
    let students: Student[] | null = null;
    const emit = () => {
      if (groups && students) listener(rosterOf(groups, students));
    };
    const stops = [
      this.store.watch('groups', { classId }, (docs) => {
        groups = docs;
        emit();
      }),
      this.store.watch('students', {}, (docs) => {
        students = docs;
        emit();
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }

  async addClass(name: string): Promise<SchoolClass> {
    requireAdmin(this.caller);
    const schoolClass = createSchoolClass(requireName(name), await this.store.list('classes'));
    await this.store.put('classes', schoolClass);
    return schoolClass;
  }

  async renameClass(classId: Id, name: string): Promise<void> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    await this.store.update('classes', classId, (current) => ({ ...current, name: cleaned }));
  }

  /** Removes the class with its groups and students, unless a running class belongs to it. */
  async removeClass(classId: Id): Promise<void> {
    requireAdmin(this.caller);
    if (!canRemoveClass(classId, await this.store.list('sessions'))) throw new RosterError('class-in-use');
    const { groups, students } = await this.rosterOfClass(classId);
    for (const student of students) await this.store.remove('students', student.id);
    for (const group of groups) await this.store.remove('groups', group.id);
    await this.store.remove('classes', classId);
  }

  async addGroup(classId: Id, name: string): Promise<Group> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    await this.requireClass(classId);
    const group = createGroup(cleaned, classId, (await this.rosterOfClass(classId)).groups);
    await this.store.put('groups', group);
    return group;
  }

  /** Saves the group's own fields; the class it belongs to cannot be changed here. */
  async saveGroup(group: Group): Promise<void> {
    requireAdmin(this.caller);
    const name = requireName(group.name);
    await this.store.update('groups', group.id, (current) => ({ ...group, name, classId: current.classId }));
  }

  async removeGroup(groupId: Id): Promise<void> {
    requireAdmin(this.caller);
    const members = await this.store.list('students', { groupId });
    if (members.length > 0) throw new RosterError('group-not-empty');
    await this.store.remove('groups', groupId);
  }

  async addStudent(name: string, groupId: Id): Promise<Student> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    const classmates = await this.classmatesOfGroup(groupId);
    const student = createStudent(cleaned, groupId, classmates);
    await this.store.put('students', student);
    return student;
  }

  async saveStudent(student: Student): Promise<void> {
    requireAdmin(this.caller);
    const name = requireName(student.name);
    const stored = await this.store.get('students', student.id);
    const [storedGroup, newGroup] = await Promise.all([stored && this.store.get('groups', stored.groupId), this.store.get('groups', student.groupId)]);
    if (!newGroup || (storedGroup && storedGroup.classId !== newGroup.classId)) throw new RosterError('group-missing');
    const classmates = (await this.rosterOfClass(newGroup.classId)).students;
    if (!isCardNumberFree(student.cardNumber, student.id, classmates)) throw new RosterError('card-number-taken');
    await this.store.put('students', { ...student, name });
  }

  async removeStudent(studentId: Id): Promise<void> {
    requireAdmin(this.caller);
    await this.store.remove('students', studentId);
  }

  /** Reads a class list (pasted or uploaded) into the class. Changes nothing unless every line is valid. */
  async importFromText(classId: Id, text: string, mode: ImportMode): Promise<RosterImportResult> {
    requireAdmin(this.caller);
    await this.requireClass(classId);
    const parsed = parseRosterText(text);
    if (!parsed.ok) return parsed;
    const { groups: oldGroups, students: oldStudents } = await this.rosterOfClass(classId);
    const applied = applyRoster(parsed.entries, classId, oldGroups, oldStudents, mode);
    const kept = (list: readonly { id: Id }[]) => new Set(list.map((item) => item.id));
    const keptGroups = kept(applied.groups);
    const keptStudents = kept(applied.students);
    for (const student of oldStudents) if (!keptStudents.has(student.id)) await this.store.remove('students', student.id);
    for (const group of oldGroups) if (!keptGroups.has(group.id)) await this.store.remove('groups', group.id);
    for (const group of applied.groups) await this.store.put('groups', group);
    for (const student of applied.students) await this.store.put('students', student);
    return { ok: true, changes: applied.changes };
  }

  /** `header` names the columns in a comment line on top; the caller supplies its words. */
  async exportToText(classId: Id, header: string): Promise<string> {
    const { groups, students } = await this.rosterOfClass(classId);
    return exportRosterText(groups, students, header);
  }

  /** The groups and students of the class as stored right now, each in its order. */
  async rosterOfClass(classId: Id): Promise<ClassRoster> {
    const [groups, students] = await Promise.all([this.store.list('groups', { classId }), this.store.list('students')]);
    return rosterOf(groups, students);
  }

  private async requireClass(classId: Id): Promise<void> {
    if (!(await this.store.get('classes', classId))) throw new RosterError('class-missing');
  }

  /** The students of the class that owns the group; fails when the group is not stored. */
  private async classmatesOfGroup(groupId: Id): Promise<Student[]> {
    const group = await this.store.get('groups', groupId);
    if (!group) throw new RosterError('group-missing');
    return (await this.rosterOfClass(group.classId)).students;
  }
}
