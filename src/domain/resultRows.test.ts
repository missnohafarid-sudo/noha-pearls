import { describe, expect, it } from 'vitest';
import { studentReport } from './analytics';
import { resultsReport, shownAnswer } from './resultRows';
import type { QuestionSlide } from './models';
import { answers, lesson, live, reveal2, roster, students } from './visibility.fixtures';

describe('the results a line draws', () => {
  const report = studentReport(lesson, { ...live, reveals: reveal2 }, roster, students[0], answers);
  const rows = resultsReport(report);

  it('keeps her points and one row per result, in order', () => {
    expect(rows.points).toBe(report.points);
    expect(rows.results.map((row) => row.slideId)).toEqual(report.results.map(({ slide }) => slide.id));
  });

  it('carries the title, the answer as given, the verdict and whose answer it was, and no slide', () => {
    expect(rows.results[0]).toEqual({ slideId: 'q1', title: 'Q1', answer: { kind: 'choice', index: 1, option: 'b' }, verdict: 'correct', byGroup: false });
    expect(JSON.stringify(rows)).not.toContain('correctIndex');
  });

  it('shows a choice by its place and option, and anything else as text', () => {
    const choice = lesson.slides.find((slide) => slide.kind === 'choice') as QuestionSlide;
    expect(shownAnswer(choice, { ...answers[0], value: 0 })).toEqual({ kind: 'choice', index: 0, option: 'a' });
    expect(shownAnswer(choice, { ...answers[0], value: 'free' })).toEqual({ kind: 'text', text: 'free' });
  });
});
