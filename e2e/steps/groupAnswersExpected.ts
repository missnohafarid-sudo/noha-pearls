import type { World } from '../world';
import { storedRecords } from '../world';

/** What the walkthrough expects of a class, worked out from what is stored, with its own copy of the rule under test. */

export interface StoredSlide {
  id: string;
  kind: string;
  scope?: string;
  points?: number;
  correctIndex?: number | null;
}

export interface StoredAnswer {
  sessionId: string;
  slideId: string;
  subject: { kind: string; id: string };
  value: number | string;
}

export interface Data {
  slides: StoredSlide[];
  reveals: Record<string, { correctIndex: number | null }>;
  groups: { id: string; name: string }[];
  students: { id: string; name: string; groupId: string; cardNumber: number }[];
  present: string[] | null;
  answers: StoredAnswer[];
}

export type Mark = 'answered' | 'waiting' | null;
export type Found = { value: number | string; byGroup: boolean } | null;

export const sortedEntries = (marks: Record<string, Mark>) => Object.entries(marks).sort(([a], [b]) => a.localeCompare(b));
export const isQuestion = (slide: StoredSlide) => slide.kind === 'choice' || slide.kind === 'text';

export const loadClass = async (world: World): Promise<Data> => {
  const sessions = await storedRecords<{ id: string; code: string; lessonId: string; reveals: Data['reveals'] }>(world.admin, 'sessions');
  const session = sessions.find((candidate) => candidate.code === world.firstClassCode)!;
  const lessons = await storedRecords<{ id: string; slides: StoredSlide[] }>(world.admin, 'lessons');
  const roster = (await storedRecords<{ id: string; groups: Data['groups']; students: Data['students']; present: string[] | null }>(world.admin, 'rosters')).find((candidate) => candidate.id === session.id)!;
  const answers = (await storedRecords<StoredAnswer>(world.admin, 'answers')).filter((answer) => answer.sessionId === session.id);
  const students = [...roster.students].sort((a, b) => a.cardNumber - b.cardNumber);
  return { slides: lessons.find((lesson) => lesson.id === session.lessonId)!.slides, reveals: session.reveals, groups: roster.groups, students, present: roster.present, answers };
};
export type StoredStudent = Data['students'][number];

export const here = (data: Data, id: string) => data.present === null || data.present.includes(id);
export const answersOn = (data: Data, slideId: string) => data.answers.filter((answer) => answer.slideId === slideId);

export const ownAnswer = (data: Data, slideId: string, student: StoredStudent) =>
  answersOn(data, slideId).find((answer) => answer.subject.kind === 'student' && answer.subject.id === student.id);

/** Her own answer, else her group's when she is on the roll. */
export const countedFor = (data: Data, slideId: string, student: Data['students'][number]): Found => {
  const given = answersOn(data, slideId);
  const own = given.find((answer) => answer.subject.kind === 'student' && answer.subject.id === student.id);
  if (own) return { value: own.value, byGroup: false };
  const byGroup = here(data, student.id) ? given.find((answer) => answer.subject.kind === 'group' && answer.subject.id === student.groupId) : undefined;
  return byGroup ? { value: byGroup.value, byGroup: true } : null;
};
export const individualSlides = (data: Data) => data.slides.filter((slide) => isQuestion(slide) && slide.scope === 'individual');
export const pointsOf = (data: Data, slide: StoredSlide, found: Found) => {
  if (!found) return 0;
  const key = slide.kind === 'choice' ? (data.reveals[slide.id]?.correctIndex ?? slide.correctIndex ?? null) : null;
  return key === null || found.value === key ? (slide.points ?? 0) : 0;
};
export const studentPoints = (data: Data, student: Data['students'][number]) =>
  individualSlides(data).reduce((sum, slide) => sum + pointsOf(data, slide, countedFor(data, slide.id, student)), 0);
export const groupScore = (data: Data, groupId: string) => {
  const present = data.students.filter((student) => student.groupId === groupId && here(data, student.id));
  const average = present.length > 0 ? present.reduce((sum, student) => sum + studentPoints(data, student), 0) / present.length : 0;
  const shared = data.slides
    .filter((slide) => isQuestion(slide) && slide.scope === 'group')
    .reduce((sum, slide) => {
      const given = answersOn(data, slide.id).find((answer) => answer.subject.kind === 'group' && answer.subject.id === groupId);
      return sum + pointsOf(data, slide, given ? { value: given.value, byGroup: false } : null);
    }, 0);
  return Math.round((average + shared) * 10) / 10;
};
export const maxScore = (data: Data) => data.slides.filter(isQuestion).reduce((sum, slide) => sum + (slide.points ?? 0), 0);

export const expectedAnswered = (data: Data, slideId: string): [number, number] => {
  const present = data.students.filter((student) => here(data, student.id));
  return [present.filter((student) => countedFor(data, slideId, student)).length, present.length];
};
export const expectedTally = (data: Data, slideId: string, options: number): number[] => {
  const counts = Array.from({ length: options }, () => 0);
  for (const student of data.students.filter((candidate) => here(data, candidate.id))) {
    const found = countedFor(data, slideId, student);
    if (found && typeof found.value === 'number') counts[found.value] += 1;
  }
  return counts;
};
