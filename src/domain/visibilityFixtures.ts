import type { Answer, ChoiceSlide, ContentSlide, Group, Lesson, Participant, Reward, Session, SessionRoster, Student, TextSlide } from './models';
import type { ClassData } from './visibility';

/** One small class shared by the reading-rule tests: two groups, three students, a lesson with a key. */

export const groups: Group[] = [
  { id: 'g1', classId: 'c1', name: 'Pearl', color: '#000', order: 1 },
  { id: 'g2', classId: 'c1', name: 'Coral', color: '#111', order: 2 },
];
export const students: Student[] = [
  { id: 's1', name: 'Sara', cardNumber: 1, groupId: 'g1' },
  { id: 's2', name: 'Noor', cardNumber: 2, groupId: 'g1' },
  { id: 's3', name: 'Reem', cardNumber: 4, groupId: 'g2' },
];
export const roster: SessionRoster = { id: 'x', groups, students, present: null };

export const intro: ContentSlide = { id: 'c1', kind: 'content', title: 'Intro', tag: '', body: 'hello', images: ['https://a.example/p.png'], hidden: 'secret text' };
export const q1: ChoiceSlide = {
  id: 'q1', kind: 'choice', title: 'Q1', tag: '', prompt: '?', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'because', scope: 'individual', points: 2,
};
export const q2: TextSlide = { id: 'q2', kind: 'text', title: 'Q2', tag: '', prompt: '?', placeholder: '', images: [], scope: 'group', points: 3 };
export const q3: ChoiceSlide = {
  id: 'q3', kind: 'choice', title: 'Q3', tag: '', prompt: '?', options: ['a', 'b'], correctIndex: 0, explanation: 'since', scope: 'group', points: 1,
};
export const lesson: Lesson = { id: 'l1', folderId: null, title: 'Lesson', subject: 'Maths', grade: '7', published: true, slides: [intro, q1, q2, q3], updatedAt: 5 };

export const live: Session = {
  id: 'x', code: 'ABC234', lessonId: 'l1', classId: 'c1', className: '11-3', teacherId: 't1', teacherName: 'Huda', status: 'live', slideIndex: 1,
  reveals: {}, pacing: {}, message: null, startedAt: 0,
};
export const ended: Session = { ...live, status: 'ended' };

export const answer = (slideId: string, kind: 'student' | 'group', id: string, value: number | string): Answer => ({
  id: `${slideId}:${kind}:${id}`, sessionId: 'x', slideId, subject: { kind, id }, value, source: 'device', at: 0,
});
export const heart = (kind: 'student' | 'group', id: string, source: Reward['source']): Reward => ({
  id: `${kind}:${id}:${source}`, sessionId: 'x', target: { kind, id }, source, at: 0,
});
export const seatOf = (id: string, groupId: string, studentId: string | null, admitted = true, joinedAt = 0): Participant => ({
  id, sessionId: 'x', groupId, studentId, joinedAt, admitted,
});

/** Sara is right, the shared device of Pearl chose a, Reem is wrong; Pearl's shared device wrote the text answer. */
export const answers: Answer[] = [
  answer('q1', 'student', 's1', 1),
  answer('q1', 'group', 'g1', 0),
  answer('q1', 'student', 's3', 0),
  answer('q2', 'group', 'g1', 'text'),
];
export const hearts: Reward[] = [heart('student', 's1', 'teacher'), heart('student', 's1', 'peer'), heart('group', 'g1', 'teacher'), heart('student', 's3', 'peer')];
export const reveal1 = { q1: { correctIndex: 1, explanation: 'because' } };
export const reveal2 = { ...reveal1, q2: { correctIndex: null, explanation: '' } };

export function classData(over: Partial<ClassData> = {}): ClassData {
  return { session: live, lesson, roster, answers, rewards: hearts, ...over };
}
