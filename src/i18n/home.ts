import { listed } from './common';

/** "The teacher" in the singular, the dual and the plural. */
const TEACHERS_LABEL = ['المعلّمة', 'المعلّمتان', 'المعلّمات'] as const;

/** The places Cloudflare may run the hub in, by the code of the data centre; a code not here is shown as it is. */
const HUB_PLACES: Readonly<Record<string, string>> = {
  DOH: 'الدوحة، قطر', BAH: 'المنامة، البحرين', DXB: 'دبي، الإمارات', AUH: 'أبوظبي، الإمارات', KWI: 'الكويت', MCT: 'مسقط، عُمان',
  RUH: 'الرياض، السعودية', JED: 'جدة، السعودية', DMM: 'الدمام، السعودية', AMM: 'عمّان، الأردن', CAI: 'القاهرة، مصر', IST: 'إسطنبول، تركيا',
  FRA: 'فرانكفورت، ألمانيا', DUS: 'دوسلدورف، ألمانيا', HAM: 'هامبورغ، ألمانيا', MUC: 'ميونخ، ألمانيا', BER: 'برلين، ألمانيا',
  AMS: 'أمستردام، هولندا', BRU: 'بروكسل، بلجيكا', LHR: 'لندن، بريطانيا', MAN: 'مانشستر، بريطانيا', DUB: 'دبلن، أيرلندا',
  CDG: 'باريس، فرنسا', MRS: 'مرسيليا، فرنسا', MAD: 'مدريد، إسبانيا', LIS: 'لشبونة، البرتغال', MXP: 'ميلانو، إيطاليا', FCO: 'روما، إيطاليا',
  ZRH: 'زيورخ، سويسرا', VIE: 'فيينا، النمسا', PRG: 'براغ، التشيك', WAW: 'وارسو، بولندا', BUD: 'بودابست، المجر', OTP: 'بوخارست، رومانيا',
  SOF: 'صوفيا، بلغاريا', ATH: 'أثينا، اليونان', ARN: 'ستوكهولم، السويد', CPH: 'كوبنهاغن، الدنمارك', HEL: 'هلسنكي، فنلندا', OSL: 'أوسلو، النرويج',
  BOM: 'مومباي، الهند', DEL: 'دلهي، الهند', MAA: 'تشيناي، الهند', BLR: 'بنغالور، الهند', SIN: 'سنغافورة', HKG: 'هونغ كونغ',
  NRT: 'طوكيو، اليابان', KIX: 'أوساكا، اليابان', ICN: 'سيول، كوريا الجنوبية', SYD: 'سيدني، أستراليا', JNB: 'جوهانسبرغ، جنوب أفريقيا',
  IAD: 'واشنطن، الولايات المتحدة', EWR: 'نيوارك، الولايات المتحدة', ORD: 'شيكاغو، الولايات المتحدة', ATL: 'أتلانتا، الولايات المتحدة',
  MIA: 'ميامي، الولايات المتحدة', DFW: 'دالاس، الولايات المتحدة', LAX: 'لوس أنجلوس، الولايات المتحدة', SJC: 'سان خوسيه، الولايات المتحدة',
  SEA: 'سياتل، الولايات المتحدة', YYZ: 'تورونتو، كندا', GRU: 'ساو باولو، البرازيل',
};

/** Text for the home page. */
export const home = {
  liveNowVisitor: 'هناك حصة مباشرة الآن. للانضمام امسحي رمز QR الخاص بمجموعتكِ، أو اكتبي رمز الحصة.',
  join: {
    submit: 'انضمام',
    ended: 'انتهت هذه الحصة.',
    wrongCode: 'هذا الرمز غير صحيح. اطلبي رمز الحصة من المعلّمة.',
    chooseGroup: 'اختاري مجموعتكِ',
  },
  lessonsTitle: 'الدروس',
  /** The note at the foot of the home page about who sees the students' data. */
  dataNote: 'بيانات الطالبات لا يتم الوصول لها إلا بعد الدخول والمصادقة وتظهر للمعلمات فقط',
  /** The dot beside the note: its name, and its tip saying where the hub runs now. */
  hubPlaceName: 'مكان الخادم',
  hubPlace: (code: string) => `مكان الخادم الآن: ${HUB_PLACES[code] ?? `مركز البيانات ${code}`}`,
  noLessons: 'لا توجد دروس بعد.',
  unpublished: 'غير منشور',
  questionCount: (n: number) => `${n} سؤال`,
  panel: {
    site: 'محتوى الصفحة الرئيسية',
    lessons: 'الدروس',
    newLesson: 'درس جديد',
    newLessonTitle: 'درس جديد',
    importLesson: 'استيراد درس',
  },
  /** The teachers' line under the introduction: the label agrees with how many names follow; nothing when there are none. */
  teachersLine: (names: readonly string[]) => (names.length === 0 ? '' : `${TEACHERS_LABEL[Math.min(names.length, 3) - 1]}: ${listed(names)}`),
  siteField: {
    schoolName: 'اسم المدرسة',
    title: 'العنوان',
    tagline: 'العبارة التعريفية',
    intro: 'مقدمة',
  },
} as const;
