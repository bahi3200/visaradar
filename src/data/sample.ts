import type { Job } from "@/components/JobCard";

export const sampleJobs: Job[] = [
  {
    id: "1",
    titleAr: "عامل مستودع",
    titleFr: "Agent d'entrepôt",
    countryCode: "CA",
    contractType: "LMIA",
    salaryText: "2,900 CAD",
    detailsUrl: "https://www.jobbank.gc.ca/",
    sourceName: "Job Bank Canada",
    isFeatured: true,
    descriptionAr: "مطلوب عامل مستودع للعمل في مستودعات كبرى بمقاطعة أونتاريو، كندا. يشمل العمل استلام البضائع، ترتيب المخزون، تجهيز الطلبات للشحن، واستخدام معدات الرفع. بيئة عمل منظمة مع فريق متعدد الجنسيات.",
    requirementsAr: [
      "خبرة لا تقل عن سنة في العمل بالمستودعات",
      "القدرة على حمل أوزان تصل إلى 25 كجم",
      "رخصة قيادة رافعة شوكية (ميزة إضافية)",
      "مستوى أساسي في اللغة الإنجليزية أو الفرنسية",
      "جواز سفر ساري المفعول",
    ],
    benefitsAr: ["تأمين صحي شامل", "إقامة عمل LMIA مدفوعة", "إمكانية التقدم للإقامة الدائمة بعد سنتين"],
  },
  {
    id: "2",
    titleAr: "عامل فلاحي موسمي",
    titleFr: "Ouvrier agricole saisonnier",
    countryCode: "FR",
    contractType: "Saisonnier",
    salaryText: "1,820 EUR",
    detailsUrl: "https://eures.europa.eu/",
    sourceName: "EURES",
    isFeatured: false,
    descriptionAr: "فرصة عمل موسمية في الزراعة بجنوب فرنسا لمدة 6 أشهر. يشمل العمل جني المحاصيل، العناية بالأشجار المثمرة، وتعبئة المنتجات الزراعية. يتم توفير السكن والنقل.",
    requirementsAr: [
      "لياقة بدنية جيدة للعمل في الهواء الطلق",
      "الاستعداد للعمل في ظروف مناخية مختلفة",
      "مستوى A2 في اللغة الفرنسية على الأقل",
      "جواز سفر ساري المفعول + تأشيرة عمل موسمي",
    ],
    benefitsAr: ["سكن مجاني مؤثث", "نقل من وإلى مكان العمل", "وجبات مدعومة"],
  },
  {
    id: "3",
    titleAr: "مطوّر ويب Full Stack",
    titleFr: "Développeur Web Full Stack",
    countryCode: "DE",
    contractType: "CDI",
    salaryText: "4,200 EUR",
    detailsUrl: "https://www.make-it-in-germany.com/",
    sourceName: "Make it in Germany",
    isFeatured: true,
    descriptionAr: "شركة تقنية ناشئة في برلين تبحث عن مطور ويب Full Stack للانضمام لفريق التطوير. ستعمل على بناء وتطوير منصة SaaS باستخدام React و Node.js. بيئة عمل مرنة مع إمكانية العمل عن بُعد جزئياً.",
    requirementsAr: [
      "خبرة 3+ سنوات في تطوير الويب",
      "إتقان React.js و Node.js و TypeScript",
      "خبرة في قواعد البيانات (PostgreSQL / MongoDB)",
      "مستوى B1 في اللغة الألمانية أو الإنجليزية",
      "شهادة جامعية في علوم الحاسب أو ما يعادلها",
    ],
    benefitsAr: ["تأشيرة عمل مدعومة من الشركة", "عمل هجين (3 أيام مكتب + 2 عن بُعد)", "30 يوم إجازة سنوية", "ميزانية تعلّم وتطوير"],
  },
  {
    id: "4",
    titleAr: "ممرض/ممرضة",
    titleFr: "Infirmier/Infirmière",
    countryCode: "CA",
    contractType: "LMIA",
    salaryText: "3,600 CAD",
    detailsUrl: "https://www.jobbank.gc.ca/",
    sourceName: "Job Bank Canada",
    isFeatured: false,
    descriptionAr: "مستشفى كبير في مدينة مونتريال يبحث عن ممرضين وممرضات للعمل في أقسام مختلفة. العمل يشمل رعاية المرضى، إدارة الأدوية، والتنسيق مع الفريق الطبي.",
    requirementsAr: [
      "شهادة تمريض معترف بها دولياً",
      "خبرة سنتين على الأقل في المستشفيات",
      "مستوى B2 في اللغة الفرنسية",
      "معادلة الشهادة من OIIQ (يتم المساعدة فيها)",
      "جواز سفر ساري المفعول",
    ],
    benefitsAr: ["راتب تنافسي مع علاوات ليلية", "تأمين صحي شامل للعائلة", "دعم الهجرة والإقامة الدائمة"],
  },
  {
    id: "5",
    titleAr: "فني كهرباء صناعية",
    titleFr: "Technicien électricité industrielle",
    countryCode: "FR",
    contractType: "CDI",
    salaryText: "2,400 EUR",
    detailsUrl: "https://eures.europa.eu/",
    sourceName: "EURES",
    isFeatured: false,
    descriptionAr: "مصنع كبير في ليون يبحث عن فني كهرباء صناعية للصيانة الوقائية والتصحيحية للمعدات الكهربائية. العمل ضمن فريق الصيانة مع نظام مناوبات.",
    requirementsAr: [
      "شهادة في الكهرباء الصناعية أو ما يعادلها",
      "خبرة 2+ سنوات في الصيانة الصناعية",
      "معرفة بأنظمة PLC وقراءة المخططات الكهربائية",
      "مستوى B1 في اللغة الفرنسية",
    ],
    benefitsAr: ["عقد دائم CDI", "تأمين صحي + تقاعد", "علاوات مناوبات"],
  },
  {
    id: "6",
    titleAr: "طبّاخ في فندق 5 نجوم",
    titleFr: "Cuisinier hôtel 5 étoiles",
    countryCode: "AU",
    contractType: "Visa 482",
    salaryText: "3,100 AUD",
    detailsUrl: "https://immi.homeaffairs.gov.au/",
    sourceName: "Home Affairs AU",
    isFeatured: true,
    descriptionAr: "فندق فاخر في سيدني يبحث عن طبّاخ محترف للعمل في مطبخه الرئيسي. ستعمل على تحضير أطباق عالمية ومحلية لضيوف الفندق مع فريق طهاة دولي.",
    requirementsAr: [
      "شهادة في فنون الطهي أو خبرة 4+ سنوات",
      "خبرة في المطابخ الفندقية أو المطاعم الراقية",
      "معرفة بمعايير سلامة الغذاء HACCP",
      "مستوى متوسط في اللغة الإنجليزية",
      "جواز سفر ساري + القدرة على الحصول على تأشيرة 482",
    ],
    benefitsAr: ["وجبات مجانية أثناء العمل", "تأشيرة 482 مدعومة", "إمكانية الترقي لرئيس طهاة", "إكراميات مشتركة"],
  },
];

export type VisaSource = {
  id: string;
  name: string;
  countryCode: string;
  centerName?: string;
  officialUrl: string;
};

export const sampleVisaSources: VisaSource[] = [
  { id: "1", name: "VFS Global", countryCode: "FR", centerName: "France", officialUrl: "https://visa.vfsglobal.com/" },
  { id: "2", name: "TLScontact", countryCode: "FR", centerName: "France", officialUrl: "https://fr.tlscontact.com/" },
  { id: "3", name: "IRCC", countryCode: "CA", centerName: "Canada", officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship.html" },
];
