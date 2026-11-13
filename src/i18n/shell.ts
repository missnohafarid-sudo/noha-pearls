/** The one name of the page of school classes, groups and students: the menu shows it and every sentence that points there uses it. */
export const ROSTER_PAGE_NAME = 'الطالبات والمجموعات';

export const shell = {
  nav: {
    home: 'الرئيسية',
    board: 'لوحة التعزيز',
    session: 'الحصة المباشرة',
    monitor: 'متابعة المجموعات',
    roster: ROSTER_PAGE_NAME,
    cards: 'بطاقات الإجابة',
    standings: 'النتائج التراكمية',
  },
  menu: 'القائمة',
  adminBadge: 'وضع الإدارة',
  signIn: 'دخول المعلّمة',
  signOut: 'خروج من الإدارة',
  panelLabel: 'لوحة التحرير',
  unlock: {
    title: 'دخول الإدارة',
    password: 'كلمة المرور',
    submit: 'دخول',
    code: 'رمز التحقق (٦ أرقام من تطبيق المصادقة)',
    wrong: 'كلمة المرور أو رمز التحقق غير صحيح',
    checking: 'جارٍ التحقق…',
  },
} as const;
