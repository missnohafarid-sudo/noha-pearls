import { MAX_CARD_NUMBER, MIN_CARD_NUMBER, type DetectedMarker } from './cards';
import { newId } from './ids';
import { nextOrder, sortByOrder } from './lists';
import { cleanName } from './text';
import type { ClassRoster, Group, Id, SchoolClass, Student, SubjectRef } from './models';

/** Rules for the class list. */

export const GROUP_COLORS = ['#c25e7a', '#2e8b80', '#7e6bc4', '#b8860b', '#3b6fb6', '#5a7d2b'] as const;

export function createSchoolClass(name: string, existing: readonly SchoolClass[]): SchoolClass {
  return { id: newId(), name, order: nextOrder(existing) };
}

/** The class a page about one class shows: the one the address names, else the first by order; none when the address names a class that is not stored. */
export function schoolClassForPage(classes: readonly SchoolClass[], classId: Id | undefined): SchoolClass | null {
  return classId === undefined ? (sortByOrder(classes)[0] ?? null) : (classes.find((schoolClass) => schoolClass.id === classId) ?? null);
}

/** `existing` are the groups of the class the new group joins. */
export function createGroup(name: string, classId: Id, existing: readonly Group[]): Group {
  return { id: newId(), classId, name, color: GROUP_COLORS[existing.length % GROUP_COLORS.length], order: nextOrder(existing) };
}

/** A class's roster from its groups and any students: a student belongs to the class through her group. */
export function rosterOf(classGroups: readonly Group[], students: readonly Student[]): ClassRoster {
  const groupIds = new Set(classGroups.map((group) => group.id));
  return {
    groups: sortByOrder(classGroups),
    students: students.filter((student) => groupIds.has(student.groupId)).sort((a, b) => a.cardNumber - b.cardNumber),
  };
}

/** The lowest card number not yet taken in the class (`students` are its students), so reprinting is never needed for existing students. */
export function nextCardNumber(students: readonly Student[]): number {
  const taken = new Set(students.map((s) => s.cardNumber));
  for (let n = MIN_CARD_NUMBER; n <= MAX_CARD_NUMBER; n += 1) {
    if (!taken.has(n)) return n;
  }
  throw new Error('No free card numbers left');
}

/** `existing` are the students of the class whose group the new student joins. */
export function createStudent(name: string, groupId: Id, existing: readonly Student[]): Student {
  return { id: newId(), name, groupId, cardNumber: nextCardNumber(existing) };
}

export function isCardNumberFree(cardNumber: number, studentId: Id, students: readonly Student[]): boolean {
  return (
    Number.isInteger(cardNumber) &&
    cardNumber >= MIN_CARD_NUMBER &&
    cardNumber <= MAX_CARD_NUMBER &&
    !students.some((s) => s.cardNumber === cardNumber && s.id !== studentId)
  );
}

/** The student who holds this answer card, if any. */
export function studentByCard(students: readonly Student[], cardNumber: number): Student | null {
  return students.find((s) => s.cardNumber === cardNumber) ?? null;
}

/** The label drawn over a card the camera sees: its number when it belongs to a student, otherwise none. */
export function cardLabel(students: readonly Student[], marker: DetectedMarker): string | null {
  return studentByCard(students, marker.id) ? String(marker.id) : null;
}

/** The student with this id, if she is on the roster; null for no id (a shared device). */
export function studentById<S extends Pick<Student, 'id'>>(students: readonly S[], id: Id | null): S | null {
  return id === null ? null : (students.find((s) => s.id === id) ?? null);
}

/** The group with this id, if it is among `groups`. */
export function groupById(groups: readonly Group[], id: Id): Group | null {
  return groups.find((group) => group.id === id) ?? null;
}

export function membersOf<S extends { groupId: Id }>(groupId: Id, students: readonly S[]): S[] {
  return students.filter((student) => student.groupId === groupId);
}

function hasGroup(roster: ClassRoster, groupId: Id): boolean {
  return groupById(roster.groups, groupId) !== null;
}

/** Whether the student or group is on this roster. */
export function isOnRoster(roster: ClassRoster, subject: SubjectRef): boolean {
  return subject.kind === 'student' ? studentById(roster.students, subject.id) !== null : hasGroup(roster, subject.id);
}

/** The roster with the student in another of its groups; null when she or the group is not on it. */
export function moveStudent(roster: ClassRoster, studentId: Id, groupId: Id): ClassRoster | null {
  if (!hasGroup(roster, groupId) || studentById(roster.students, studentId) === null) return null;
  return rosterOf(roster.groups, roster.students.map((s) => (s.id === studentId ? { ...s, groupId } : s)));
}

/** The roster with a new student in one of its groups, holding the lowest card number free in it; null for a blank name or a group not on it. */
export function addStudentToRoster(roster: ClassRoster, name: string, groupId: Id): { roster: ClassRoster; student: Student } | null {
  const cleaned = cleanName(name);
  if (cleaned === null || !hasGroup(roster, groupId)) return null;
  const student = createStudent(cleaned, groupId, roster.students);
  return { roster: rosterOf(roster.groups, [...roster.students, student]), student };
}

/** The roster with one group renamed; null for a blank name or a group not on it. */
export function renameGroupIn(roster: ClassRoster, groupId: Id, name: string): ClassRoster | null {
  const cleaned = cleanName(name);
  if (cleaned === null || !hasGroup(roster, groupId)) return null;
  return rosterOf(roster.groups.map((g) => (g.id === groupId ? { ...g, name: cleaned } : g)), roster.students);
}

/** The display name of whoever gave an answer or received a heart; empty when no longer on the roster. */
export function subjectName(subject: SubjectRef, students: readonly Student[], groups: readonly Group[]): string {
  const list: readonly { id: Id; name: string }[] = subject.kind === 'student' ? students : groups;
  return list.find((entry) => entry.id === subject.id)?.name ?? '';
}
