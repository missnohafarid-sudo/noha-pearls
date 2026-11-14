---
name: content-is-edited-in-the-site
description: Use when the teacher asks to change a lesson, add or fix a question or slide, create a lesson, change a student's name or group, add a student, or change the home page text (school name, title, intro). These are edited inside the website by the admin, not in code. Arabic phrasings - غيّري نص الدرس، أضيفي سؤالاً، صحّحي اسم طالبة، انقلي طالبة إلى مجموعة، غيّري عنوان الصفحة الرئيسية، أريد درساً جديداً، احذفي الدرس. English - edit the lesson, fix the question, change a student name, change the home page text.
---

# Content is edited in the site

Change NO code. Tell her how to do it herself, in Arabic, step by step, then stop. Do not run `ship`.

Say it like this, adapted to what she asked:

1. Open the site (if it runs on her laptop: ask her to say so and run `npm run dev`; the address is printed in the terminal; otherwise she opens the published site).
2. Admin mode: press the «دخول المعلّمة» button at the top-left of any page. A window asks for the password and the 6-digit code from the authenticator app on her phone. After signing in, an editing panel (لوحة التحرير) appears at the side and the badge «وضع الإدارة» shows. To leave: «خروج من الإدارة».
3. What to do for each request:

| Request | Where in the site |
|---|---|
| Home page text (school name, title, tagline, intro, teacher name) | الرئيسية: panel «محتوى الصفحة الرئيسية» |
| A lesson's title, subject, grade, publish or hide | open the lesson: panel «الدرس»; tick «منشور للزوار» to publish |
| A slide or a question (text, options, correct answer, points, who answers) | open the lesson, panel «الشرائح»: press a slide in the list; its fields then appear in panel «تعديل الشريحة». Buttons «نقل لأعلى» «نقل لأسفل» «حذف»; under «إضافة شريحة» the «+» buttons add a slide |
| A new lesson, written by hand | الرئيسية: panel «الدروس»: «درس جديد» |
| A coloured badge beside a slide's tag (for example «الهدف الأول») | open the slide, panel «تعديل الشريحة»: under «شارات إضافية» press «إضافة», write the badge's text and pick its colour; up to six |
| Part of a slide's text hidden until a button is pressed, anywhere in the text and as often as she likes | panel «تعديل الشريحة», box «النص»: select the lines and press «إخفاء المحدَّد» at the top of the panel (it puts a line of `+++` before and after them). The box «معلومة مخفية في آخر الشريحة» still hides one part at the end |
| A picture inside the text or inside a hidden part | box «النص»: paste the picture's public https link alone on its own line. A choice question and a written question also have «روابط الصور» |
| A symbol or an equation (°C, ², ×, Δ ...) | panel «تعديل الشريحة»: put the caret in the box, press «رموز» at the top of the panel and press the symbol. Write equations with these symbols as plain text; the site keeps them in the right order inside Arabic |
| The site's colours (its look), a night look | the round pearl button at the far end of the top bar (teacher only): pick one of the seven pearls; everyone sees it within a moment. The black pearl is the night look |
| A new lesson with an AI assistant | الرئيسية: «استيراد درس»: step 1 «نسخ التعليمات», paste into any AI assistant and attach the lesson's presentation file (or write the lesson material under it), answer its questions by number; step 2 paste its final reply; press «استيراد». It opens unpublished: check it, check any verse against the Mushaf, then tick «منشور للزوار» |
| Students and groups (add, rename, change card number, change group, delete) | «الطالبات والمجموعات» in the menu: pick a group or student, then edit in the panel |
| Many students at once (a whole class from Excel or a text file; card number, name, group) | «الطالبات والمجموعات»: panel «استيراد قائمة صف»: paste the three columns or choose a file, press «إضافة إلى القائمة». The number is the student's printed card number. Content, not code |
| Delete a lesson | the lesson, panel «الدرس»: «حذف الدرس» (asks to confirm) |

4. Tell her the changes save as she types and show on every device within a moment.

If she says it did not work, or the panel does not appear, ask her what she sees on the screen. If she cannot open admin mode, hand over to the maintainer. Do not edit `src/services/seed.ts` or `src/domain/sampleLesson.json` to change her lessons or students: they are only the starting sample.
