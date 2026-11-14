import { MAX_CHOICES, MIN_CHOICES } from '../domain/choices';
import { MAX_BADGES } from '../domain/badges';
import { MEDIA_CHOICES } from '../domain/media';
import { LESSON_FORMAT, LESSON_FORMAT_VERSION, type ImportIssue } from '../domain/lessonFormat';
import type { IssueCode } from '../domain/slideFile';
import { PEARL_SHADES } from '../domain/pearlShades';
import { MAX_POINTS, MIN_POINTS, SLIDE_KIND_NAMES } from '../domain/slideKinds';

/**
 * Words about the lesson file: what went wrong on import and how to ask the
 * assistant to fix it. The instructions themselves live in lessonPrompt.ts.
 */

const ISSUE_TEXT: Record<IssueCode, string> = {
  'not-json': 'لم نجد في النص المُلصق أي ملف درس. انسخي ردّ المساعد كاملاً من القوس { الأول إلى القوس } الأخير.',
  'wrong-format': `هذا ليس ملف درس لهذه المنصة: يجب أن يحتوي على "format": "${LESSON_FORMAT}".`,
  'unsupported-version': `إصدار الملف غير مدعوم: يجب أن يكون "version": ${LESSON_FORMAT_VERSION}.`,
  'no-slides': 'الدرس لا يحتوي على أي شريحة.',
  'unknown-kind': `نوع الشريحة غير معروف. الأنواع المتاحة: ${SLIDE_KIND_NAMES.join('، ')}.`,
  'missing-field': 'حقل مطلوب ناقص أو فارغ',
  'bad-options': `عدد الخيارات يجب أن يكون بين ${MIN_CHOICES} و${MAX_CHOICES}`,
  'bad-scope': 'الحقل "scope" يجب أن يكون "individual" أو "group" تماماً',
  'bad-points': `الحقل "points" يجب أن يكون عدداً صحيحاً من ${MIN_POINTS} إلى ${MAX_POINTS}`,
  'bad-json': 'تعذّرت قراءة ملف الدرس لأن صياغة JSON فيه معطوبة، وأكثر أسباب ذلك علامة تنصيص مزدوجة مستقيمة (") داخل أحد النصوص. اطلبي من المساعد إعادة كتابة الملف كاملاً بصيغة JSON صحيحة، مع استعمال « » للاقتباس داخل النصوص.',
  'bad-url': 'الرابط يجب أن يكون عنواناً كاملاً يبدأ بـ https://',
  'bad-images': 'الحقل "images" يجب أن يكون قائمة روابط، كل رابط بين علامتي تنصيص',
  'bad-badges': `الحقل "badges" يجب أن يكون قائمة فيها ${MAX_BADGES} شارات على الأكثر، كل شارة على صورة {"text": "نص", "color": "اللون"}، واللون واحد من: ${PEARL_SHADES.map((shade) => `"${shade}"`).join('، ')}`,
  'bad-media': `الحقل "media" يجب أن يكون أحد: ${MEDIA_CHOICES.map((choice) => `"${choice}"`).join('، ')}`,
  'bad-correct': 'رقم الإجابة الصحيحة يجب أن يكون رقم أحد الخيارات (ابتداءً من 1) أو null',
};

export function describeIssue(issue: ImportIssue): string {
  const where = issue.slide === null ? 'الملف' : `الشريحة ${issue.slide}`;
  const field = issue.field ? ` (الحقل "${issue.field}")` : '';
  return `${where}${field}: ${ISSUE_TEXT[issue.code]}`;
}

export const lessonFile = {
  describeIssue,
  /** Prefixed to the issue list when the teacher copies it back to the AI assistant. */
  fixRequest: 'ملف الدرس الذي أنشأتَه فيه الأخطاء الآتية. صحّحها وأعد إرسال ملف JSON كاملاً فقط:',
} as const;
