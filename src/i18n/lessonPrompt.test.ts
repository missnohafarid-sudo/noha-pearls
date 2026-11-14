import { describe, expect, it } from 'vitest';
import sampleLesson from '../domain/sampleLesson.json';
import { LESSON_FORMAT, exportLesson, importLesson } from '../domain/lessonFormat';
import { SLIDE_KIND_NAMES, slideKindSpec } from '../domain/slideKinds';
import { HIDDEN_FENCE, slideTextBlocks } from '../domain/slideText';
import { lessonPrompt } from './lessonPrompt';
import exampleLesson from './lessonPromptExample.json';

const example = JSON.stringify(exampleLesson, null, 2);
const prompt = lessonPrompt.build();

describe('sample lesson', () => {
  it('is a valid lesson with 13 slides', () => {
    const result = importLesson(JSON.stringify(sampleLesson));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lesson.slides).toHaveLength(13);
  });
});

describe('the example lesson of the prompt', () => {
  const imported = importLesson(example);

  it('is a valid lesson, written exactly as the site exports it', () => {
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(exportLesson(imported.lesson)).toBe(example);
  });

  it('names every slide by a stage of the prompt, and marks the slides of each objective with one badge colour', () => {
    const colourOf = new Map<string, string>();
    for (const slide of exampleLesson.slides) {
      expect(prompt).toContain(`(${slide.tag})`);
      for (const badge of slide.badges) {
        expect(colourOf.get(badge.text) ?? badge.color).toBe(badge.color);
        colourOf.set(badge.text, badge.color);
      }
    }
    expect(colourOf.size).toBe(2);
  });

  it('shows a part hidden inside the text, a part hidden at the end and a question of every kind', () => {
    const bodies = exampleLesson.slides.flatMap((slide) => (typeof slide.body === 'string' ? [slide.body] : []));
    expect(bodies.some((body) => slideTextBlocks(body).some((block) => block.kind === 'hidden'))).toBe(true);
    expect(exampleLesson.slides.some((slide) => typeof slide.hidden === 'string' && slide.hidden !== '')).toBe(true);
    for (const kind of SLIDE_KIND_NAMES) expect(exampleLesson.slides.some((slide) => slide.kind === kind)).toBe(true);
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

  it('works in three stages from the attached presentation, one question per message', () => {
    for (const stage of ['المرحلة الأولى: قراءة العرض التقديمي', 'المرحلة الثانية: الحوار', 'المرحلة الثالثة: كتابة ملف الدرس']) expect(prompt).toContain(stage);
    expect(prompt).toContain('سؤالاً واحداً فقط');
    expect(prompt).toContain('لا تتجاهل أي معلومة في العرض التقديمي المرفق');
  });

  it('asks for verses and hadiths to be checked at their sources', () => {
    expect(prompt).toContain('المصحف');
    expect(prompt).toContain('من أخرجه');
  });

  it('interviews the teacher for her links, lets the assistant suggest real ones, and never lets it invent one', () => {
    expect(prompt).toContain('"kind": "media"');
    expect(prompt).toContain('هل لديكِ روابط تريدين عرضها داخل الدرس؟');
    expect(prompt).toContain('هل لديكِ رابط…؟');
    expect(prompt).toContain('لا تخترع رابطاً ولا تخمّنه');
    expect(prompt).toContain('اقترحتَه أنت فوافقت عليه المعلّمة');
    expect(prompt).toContain('لا تخترع رابط صورة أبداً');
    expect(prompt).toContain('بلا وسيط');
    expect(prompt).toContain('أي شخص لديه الرابط');
    expect(prompt).toContain('لا تنسخ أي رابط منه إلى درس آخر');
  });

  it('teaches the text the site draws: hidden parts by the fence it reads, plain symbols and never LaTeX', () => {
    expect(prompt).toContain(`سطراً ليس فيه إلا ${HIDDEN_FENCE}`);
    expect(prompt).toContain('\\circ');
    expect(prompt).toContain('(-53°C)');
  });

  it('repeats the stages of an objective for each objective and marks its slides with a badge', () => {
    expect(prompt).toContain('كرّر الخطوات من 4 إلى 8 لكل هدف');
    expect(prompt).toContain('الحقل badges');
  });

  it('asks the teacher which extra badges she wants and adds none of its own', () => {
    expect(prompt).toContain('هل تريدين شارات إضافية على بعض الشرائح؟');
    expect(prompt).toContain('فلا تضف شارة من عندك');
  });

  it('teaches the table rows, the fraction and the picture option the site draws', () => {
    expect(prompt).toContain('|---|---|');
    expect(prompt).toContain('{البسط/المقام}');
    expect(prompt).toContain('فيظهر الخيار صورة');
  });
});
