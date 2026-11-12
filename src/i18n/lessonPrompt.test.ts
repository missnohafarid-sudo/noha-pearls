import { describe, expect, it } from 'vitest';
import sampleLesson from './sampleLesson.json';
import { LESSON_FORMAT, importLesson } from '../domain/lessonFormat';
import { SLIDE_KIND_NAMES, slideKindSpec } from '../domain/slideKinds';
import { lessonPrompt } from './lessonPrompt';

const example = JSON.stringify(sampleLesson, null, 2);
const prompt = lessonPrompt.build();

describe('sample lesson', () => {
  it('is a valid lesson with 13 slides', () => {
    const result = importLesson(JSON.stringify(sampleLesson));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lesson.slides).toHaveLength(13);
  });
});

describe('lesson prompt', () => {
  it('describes the format, every slide kind and every field, and embeds the example', () => {
    expect(prompt).toContain(LESSON_FORMAT);
    for (const kind of SLIDE_KIND_NAMES) {
      expect(prompt).toContain(`"kind": "${kind}"`);
      for (const field of slideKindSpec(kind).fileFields) expect(prompt).toContain(`"${field.name}"`);
    }
    expect(prompt).toContain(example);
  });

  it('asks for the verse to be checked and for one question per message', () => {
    expect(prompt).toContain('المصحف');
    expect(prompt).toContain('سؤالاً واحداً فقط');
  });

  it('interviews the teacher for her links before writing, and never lets the assistant invent one', () => {
    expect(prompt).toContain('"kind": "media"');
    for (const field of ['url', 'media', 'body']) expect(prompt).toContain(`"${field}"`);
    expect(prompt).toContain('هل لديكِ روابط تريدين عرضها داخل الدرس؟');
    expect(prompt).toContain('هل لديكِ رابط…؟');
    expect(prompt).toContain('لا تخترع رابطاً ولا تخمّنه ولا تبحث عنه أبداً');
    expect(prompt).toContain('بلا وسيط');
    expect(prompt).toContain('أي شخص لديه الرابط');
    expect(prompt).toContain('https');
  });
});
