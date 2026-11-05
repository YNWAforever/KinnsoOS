import { publicLanguage, type PublicLanguage } from './public-language.ts';

type DestinationLabels = {
  eyebrow: string;
  title: string;
  body: string;
  empty: string;
  guideCount: (count: number) => string;
  experienceCount: (count: number) => string;
  guidesHeading: string;
  emptyGuides: string;
  experiencesHeading: string;
  emptyExperiences: string;
  articlesHeading: string;
  emptyArticles: string;
  sessionsHeading: string;
  emptySessions: string;
  metadataDescription: (name: string) => string;
};

export type PublicLabels = {
  common: {
    unavailable: string;
    retry: string;
    previous: string;
    next: string;
    page: string;
  };
  destinations: DestinationLabels;
  experiences: {
    hostedBy: string;
    priceLabel: string;
    durationLabel: string;
    minutesSuffix: string;
    backToMerchant: string;
    metadataDescription: (name: string, city: string) => string;
  };
  merchants: {
    websiteLabel: string;
    experiencesHeading: string;
    experiencesEmpty: string;
    metadataDescription: (name: string) => string;
  };
  sessions: {
    eyebrow: string;
    title: string;
    body: string;
    upcomingHeading: string;
    emptyUpcoming: string;
    replaysHeading: string;
    emptyReplays: string;
    typeDestinationBriefing: string;
    typeAskACreator: string;
    typeMerchantSpotlight: string;
    typeNewCreatorIntro: string;
    metadataDescription: (title: string, host: string) => string;
  };
  creators: {
    profileLabel: string;
    guidesHeading: string;
    guidesEmpty: string;
    previous: string;
    next: string;
    metadataDescription: (name: string) => string;
  };
  guides: {
    sourceHeading: string;
    structuredItinerary: string;
    readingSummary: string;
    author: string;
    publishedVersion: string;
    publishedAt: string;
    daysStops: string;
    originalLanguage: string;
    verificationDate: string;
    notRecorded: string;
    notice: string;
    checkingBookmark: string;
    signInToBookmark: string;
    bookmarkGuide: string;
    removeBookmark: string;
    bookmarkError: string;
    retryBookmark: string;
    metadataDescription: (title: string) => string;
  };
};

const labels: Record<PublicLanguage, PublicLabels> = {
  en: {
    common: {
      unavailable: 'This content could not be loaded. This is a connection problem, not an empty collection.',
      retry: 'Try again',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
    },
    destinations: {
      eyebrow: 'Destinations',
      title: 'Every city, told by the people who know it.',
      body: 'Browse curated destinations — the guides, published experiences, and live sessions our creators have covered so far.',
      empty: 'New destinations are on the way — check back soon.',
      guideCount: (count) => `${count} guides`,
      experienceCount: (count) => `${count} experiences`,
      guidesHeading: 'Guides',
      emptyGuides: 'No guides for this destination yet.',
      experiencesHeading: 'Experiences',
      emptyExperiences: 'No published experiences here yet.',
      articlesHeading: 'Articles',
      emptyArticles: 'No articles for this destination yet.',
      sessionsHeading: 'Upcoming sessions',
      emptySessions: 'No sessions scheduled for this destination right now.',
      metadataDescription: (name) => `Discover guides, experiences, articles, and sessions for ${name}.`,
    },
    experiences: {
      hostedBy: 'Hosted by',
      priceLabel: 'From',
      durationLabel: 'Duration',
      minutesSuffix: 'min',
      backToMerchant: 'Back to',
      metadataDescription: (name, city) => `${name} in ${city}.`,
    },
    merchants: {
      websiteLabel: 'Website',
      experiencesHeading: 'Experiences',
      experiencesEmpty: 'No experiences published yet.',
      metadataDescription: (name) => `Published experiences from ${name}.`,
    },
    sessions: {
      eyebrow: 'Community Sessions',
      title: 'Live briefings from creators on the ground.',
      body: 'Ask questions, get real answers, and watch replays from the creators behind our guides.',
      upcomingHeading: 'Upcoming',
      emptyUpcoming: 'No sessions scheduled right now — check back soon.',
      replaysHeading: 'Replays',
      emptyReplays: 'No session replays are available yet.',
      typeDestinationBriefing: 'Destination briefing',
      typeAskACreator: 'Ask a creator',
      typeMerchantSpotlight: 'Merchant spotlight',
      typeNewCreatorIntro: 'New creator intro',
      metadataDescription: (title, host) => `${title}, hosted by ${host}.`,
    },
    creators: {
      profileLabel: 'Public creator profile',
      guidesHeading: 'Published guides',
      guidesEmpty: 'No published guides yet.',
      previous: 'Previous',
      next: 'Next',
      metadataDescription: (name) => `${name} on Kinnso.`,
    },
    guides: {
      sourceHeading: 'Guide source',
      structuredItinerary: 'Structured itinerary',
      readingSummary: 'Reading summary — no structured itinerary',
      author: 'Author',
      publishedVersion: 'Published version',
      publishedAt: 'Published at',
      daysStops: 'Days / stops',
      originalLanguage: 'Original content language',
      verificationDate: 'Place verification date',
      notRecorded: 'Not recorded',
      notice: 'Publication time is not a verification date. Check current place facts and their sources before travel. Author content is not automatically translated.',
      checkingBookmark: 'Checking bookmark status…',
      signInToBookmark: 'Sign in to bookmark this guide',
      bookmarkGuide: 'Bookmark guide',
      removeBookmark: 'Remove bookmark',
      bookmarkError: 'Bookmark was not confirmed. Retry.',
      retryBookmark: 'Retry bookmark change',
      metadataDescription: (title) => `${title} on Kinnso.`,
    },
  },
  'zh-HK': {
    common: {
      unavailable: '暫時未能載入內容。呢個係連線問題，唔代表內容為空。',
      retry: '重試',
      previous: '上一頁',
      next: '下一頁',
      page: '第',
    },
    destinations: {
      eyebrow: '目的地',
      title: '每個城市，由最熟路嘅人講畀你聽。',
      body: '瀏覽精選目的地——睇吓我哋創作者目前為每個地方整理咗嘅攻略、已發布體驗同直播活動。',
      empty: '更多目的地即將上線，記得返嚟睇吓。',
      guideCount: (count) => `${count} 篇攻略`,
      experienceCount: (count) => `${count} 個體驗`,
      guidesHeading: '攻略',
      emptyGuides: '呢個目的地暫時未有攻略。',
      experiencesHeading: '體驗',
      emptyExperiences: '呢度暫時未有已發布嘅體驗。',
      articlesHeading: '文章',
      emptyArticles: '呢個目的地暫時未有文章。',
      sessionsHeading: '即將舉行嘅活動',
      emptySessions: '呢個目的地暫時未有安排活動。',
      metadataDescription: (name) => `探索${name}嘅攻略、體驗、文章同活動。`,
    },
    experiences: {
      hostedBy: '主辦：',
      priceLabel: '起',
      durationLabel: '時長',
      minutesSuffix: '分鐘',
      backToMerchant: '返回',
      metadataDescription: (name, city) => `${city}嘅${name}。`,
    },
    merchants: {
      websiteLabel: '網站',
      experiencesHeading: '體驗',
      experiencesEmpty: '仲未有已發布嘅體驗。',
      metadataDescription: (name) => `${name}已發布嘅體驗。`,
    },
    sessions: {
      eyebrow: '社群活動',
      title: '創作者現場連線，畀你第一手旅遊情報。',
      body: '提問、聽真人解答，仲可以睇返寫攻略嘅創作者嘅活動重溫。',
      upcomingHeading: '即將舉行',
      emptyUpcoming: '暫時未有活動——遲啲再嚟睇睇啦。',
      replaysHeading: '活動重溫',
      emptyReplays: '暫時未有活動重溫。',
      typeDestinationBriefing: '目的地情報分享',
      typeAskACreator: '問創作者',
      typeMerchantSpotlight: '商戶焦點',
      typeNewCreatorIntro: '新晉創作者介紹',
      metadataDescription: (title, host) => `${host}主辦嘅${title}。`,
    },
    creators: {
      profileLabel: '創作者公開檔案',
      guidesHeading: '已發布攻略',
      guidesEmpty: '尚未有已發布攻略。',
      previous: '上一頁',
      next: '下一頁',
      metadataDescription: (name) => `Kinnso 創作者 ${name}。`,
    },
    guides: {
      sourceHeading: '攻略來源',
      structuredItinerary: '結構化行程',
      readingSummary: '閱讀摘要——未提供結構化行程',
      author: '作者',
      publishedVersion: '發布版本',
      publishedAt: '發布時間',
      daysStops: '日數／站點',
      originalLanguage: '內容原文語言',
      verificationDate: '地點查核日期',
      notRecorded: '未記錄',
      notice: '發布時間不等於查核日期。出發前請核對最新地點資料及來源。作者內容不會自動翻譯。',
      checkingBookmark: '正在核對收藏狀態…',
      signInToBookmark: '登入以收藏呢篇攻略',
      bookmarkGuide: '收藏攻略',
      removeBookmark: '取消收藏',
      bookmarkError: '未確認收藏結果，請重試。',
      retryBookmark: '重試收藏變更',
      metadataDescription: (title) => `Kinnso 攻略：${title}。`,
    },
  },
  'zh-tw': {
    common: {
      unavailable: '暫時無法載入內容。這是連線問題，不代表內容為空。',
      retry: '重試',
      previous: '上一頁',
      next: '下一頁',
      page: '第',
    },
    destinations: {
      eyebrow: '目的地',
      title: '每座城市，由最懂它的人來說。',
      body: '瀏覽精選目的地——查看我們的創作者目前為每個地方整理的攻略、已發布體驗與直播活動。',
      empty: '更多目的地即將上線，敬請期待。',
      guideCount: (count) => `${count} 篇攻略`,
      experienceCount: (count) => `${count} 個體驗`,
      guidesHeading: '攻略',
      emptyGuides: '這個目的地目前還沒有攻略。',
      experiencesHeading: '體驗',
      emptyExperiences: '這裡目前還沒有已發布的體驗。',
      articlesHeading: '文章',
      emptyArticles: '這個目的地目前還沒有文章。',
      sessionsHeading: '即將舉行的活動',
      emptySessions: '這個目的地目前還沒有安排活動。',
      metadataDescription: (name) => `探索${name}的攻略、體驗、文章與活動。`,
    },
    experiences: {
      hostedBy: '主辦方：',
      priceLabel: '起',
      durationLabel: '時長',
      minutesSuffix: '分鐘',
      backToMerchant: '返回',
      metadataDescription: (name, city) => `${city}的${name}。`,
    },
    merchants: {
      websiteLabel: '網站',
      experiencesHeading: '體驗',
      experiencesEmpty: '尚無已發布的體驗。',
      metadataDescription: (name) => `${name}已發布的體驗。`,
    },
    sessions: {
      eyebrow: '社群活動',
      title: '來自現場創作者的即時分享。',
      body: '提出問題、獲得真實解答，並回顧撰寫攻略的創作者主持的活動重播。',
      upcomingHeading: '即將舉行',
      emptyUpcoming: '目前尚無排定的活動——請稍後再來看看。',
      replaysHeading: '活動重播',
      emptyReplays: '目前尚無活動重播。',
      typeDestinationBriefing: '目的地情報分享',
      typeAskACreator: '創作者問答',
      typeMerchantSpotlight: '商家焦點',
      typeNewCreatorIntro: '新銳創作者介紹',
      metadataDescription: (title, host) => `由${host}主持的${title}。`,
    },
    creators: {
      profileLabel: '創作者公開檔案',
      guidesHeading: '已發佈指南',
      guidesEmpty: '尚未有已發佈的指南。',
      previous: '上一頁',
      next: '下一頁',
      metadataDescription: (name) => `Kinnso 創作者 ${name}。`,
    },
    guides: {
      sourceHeading: '攻略來源',
      structuredItinerary: '結構化行程',
      readingSummary: '閱讀摘要——未提供結構化行程',
      author: '作者',
      publishedVersion: '發布版本',
      publishedAt: '發布時間',
      daysStops: '天數／站點',
      originalLanguage: '內容原文語言',
      verificationDate: '地點查核日期',
      notRecorded: '未記錄',
      notice: '發布時間不等於查核日期。出發前請核對最新地點資料及來源。作者內容不會自動翻譯。',
      checkingBookmark: '正在核對收藏狀態…',
      signInToBookmark: '登入以收藏這篇攻略',
      bookmarkGuide: '收藏攻略',
      removeBookmark: '取消收藏',
      bookmarkError: '未確認收藏結果，請重試。',
      retryBookmark: '重試收藏變更',
      metadataDescription: (title) => `Kinnso 攻略：${title}。`,
    },
  },
  'zh-cn': {
    common: {
      unavailable: '暂时无法加载内容。这是连接问题，不代表内容为空。',
      retry: '重试',
      previous: '上一页',
      next: '下一页',
      page: '第',
    },
    destinations: {
      eyebrow: '目的地',
      title: '每座城市，都由最懂它的人来讲述。',
      body: '浏览精选目的地——查看我们的创作者目前为每个地方整理的攻略、已发布体验和直播活动。',
      empty: '更多目的地即将上线，敬请期待。',
      guideCount: (count) => `${count} 篇攻略`,
      experienceCount: (count) => `${count} 个体验`,
      guidesHeading: '攻略',
      emptyGuides: '这个目的地暂时还没有攻略。',
      experiencesHeading: '体验',
      emptyExperiences: '这里暂时还没有已发布的体验。',
      articlesHeading: '文章',
      emptyArticles: '这个目的地暂时还没有文章。',
      sessionsHeading: '即将举行的活动',
      emptySessions: '这个目的地暂时还没有安排活动。',
      metadataDescription: (name) => `探索${name}的攻略、体验、文章和活动。`,
    },
    experiences: {
      hostedBy: '主办方：',
      priceLabel: '起',
      durationLabel: '时长',
      minutesSuffix: '分钟',
      backToMerchant: '返回',
      metadataDescription: (name, city) => `${city}的${name}。`,
    },
    merchants: {
      websiteLabel: '网站',
      experiencesHeading: '体验',
      experiencesEmpty: '尚无已发布的体验。',
      metadataDescription: (name) => `${name}已发布的体验。`,
    },
    sessions: {
      eyebrow: '社区活动',
      title: '来自一线创作者的实时分享。',
      body: '提问、获得真实解答，还能回看撰写攻略的创作者主持的活动回放。',
      upcomingHeading: '即将开始',
      emptyUpcoming: '暂时没有安排的活动——请稍后再来看看。',
      replaysHeading: '活动回放',
      emptyReplays: '暂时没有活动回放。',
      typeDestinationBriefing: '目的地情报分享',
      typeAskACreator: '创作者问答',
      typeMerchantSpotlight: '商家焦点',
      typeNewCreatorIntro: '新晋创作者介绍',
      metadataDescription: (title, host) => `由${host}主持的${title}。`,
    },
    creators: {
      profileLabel: '创作者公开档案',
      guidesHeading: '已发布指南',
      guidesEmpty: '还没有已发布的指南。',
      previous: '上一页',
      next: '下一页',
      metadataDescription: (name) => `Kinnso 创作者 ${name}。`,
    },
    guides: {
      sourceHeading: '攻略来源',
      structuredItinerary: '结构化行程',
      readingSummary: '阅读摘要——未提供结构化行程',
      author: '作者',
      publishedVersion: '发布版本',
      publishedAt: '发布时间',
      daysStops: '天数／站点',
      originalLanguage: '内容原文语言',
      verificationDate: '地点核验日期',
      notRecorded: '未记录',
      notice: '发布时间不等同于核验日期。出发前请核对最新地点资料及来源。作者内容不会自动翻译。',
      checkingBookmark: '正在检查收藏状态…',
      signInToBookmark: '登录以收藏这篇攻略',
      bookmarkGuide: '收藏攻略',
      removeBookmark: '取消收藏',
      bookmarkError: '未能确认收藏结果，请重试。',
      retryBookmark: '重试收藏变更',
      metadataDescription: (title) => `Kinnso 攻略：${title}。`,
    },
  },
  ja: {
    common: {
      unavailable: 'コンテンツを読み込めませんでした。これは接続の問題で、空の一覧ではありません。',
      retry: '再試行',
      previous: '前へ',
      next: '次へ',
      page: 'ページ',
    },
    destinations: {
      eyebrow: '旅行先',
      title: 'その街を一番知る人が、その街を語る。',
      body: '厳選された旅行先を見てみましょう——クリエイターがこれまでにまとめたガイド、公開済みの体験、ライブセッションをご覧いただけます。',
      empty: '新しい旅行先を準備中です。近日公開をお楽しみに。',
      guideCount: (count) => `${count}件のガイド`,
      experienceCount: (count) => `${count}件の体験`,
      guidesHeading: 'ガイド',
      emptyGuides: 'この旅行先のガイドはまだありません。',
      experiencesHeading: '体験',
      emptyExperiences: 'この旅行先で公開されている体験はまだありません。',
      articlesHeading: '記事',
      emptyArticles: 'この旅行先の記事はまだありません。',
      sessionsHeading: '開催予定のセッション',
      emptySessions: 'この旅行先で予定されているセッションは現在ありません。',
      metadataDescription: (name) => `${name}のガイド、体験、記事、セッションを見つけよう。`,
    },
    experiences: {
      hostedBy: '主催：',
      priceLabel: '〜',
      durationLabel: '所要時間',
      minutesSuffix: '分',
      backToMerchant: '戻る',
      metadataDescription: (name, city) => `${city}の${name}。`,
    },
    merchants: {
      websiteLabel: 'ウェブサイト',
      experiencesHeading: '体験',
      experiencesEmpty: 'まだ公開された体験はありません。',
      metadataDescription: (name) => `${name}が公開した体験。`,
    },
    sessions: {
      eyebrow: 'コミュニティセッション',
      title: '現地クリエイターによるライブブリーフィング。',
      body: '質問して、本音の答えをもらおう。ガイドを書いたクリエイターによるアーカイブ映像も見られます。',
      upcomingHeading: '開催予定',
      emptyUpcoming: '現在予定されているセッションはありません。近日中にまたチェックしてください。',
      replaysHeading: 'アーカイブ',
      emptyReplays: '現在アーカイブはありません。',
      typeDestinationBriefing: '目的地ブリーフィング',
      typeAskACreator: 'クリエイターに質問',
      typeMerchantSpotlight: '店舗スポットライト',
      typeNewCreatorIntro: '新人クリエイター紹介',
      metadataDescription: (title, host) => `${host}主催の${title}。`,
    },
    creators: {
      profileLabel: '公開クリエイタープロフィール',
      guidesHeading: '公開済みガイド',
      guidesEmpty: 'まだ公開されたガイドはありません。',
      previous: '前へ',
      next: '次へ',
      metadataDescription: (name) => `Kinnsoのクリエイター、${name}。`,
    },
    guides: {
      sourceHeading: 'ガイドの出典',
      structuredItinerary: '構造化された旅程',
      readingSummary: '読むための要約 — 構造化された旅程はありません',
      author: '作者',
      publishedVersion: '公開バージョン',
      publishedAt: '公開日時',
      daysStops: '日数 / 立ち寄り先',
      originalLanguage: '元のコンテンツ言語',
      verificationDate: '場所の確認日',
      notRecorded: '記録なし',
      notice: '公開日時は確認日ではありません。旅行前に最新の場所情報と出典を確認してください。作者の内容は自動翻訳されません。',
      checkingBookmark: '保存状態を確認中…',
      signInToBookmark: 'ログインしてこのガイドを保存',
      bookmarkGuide: 'ガイドを保存',
      removeBookmark: '保存を解除',
      bookmarkError: '保存を確認できませんでした。再試行してください。',
      retryBookmark: '保存を再試行',
      metadataDescription: (title) => `Kinnsoのガイド、${title}。`,
    },
  },
  ko: {
    common: {
      unavailable: '콘텐츠를 불러오지 못했습니다. 연결 문제이며 빈 목록이 아닙니다.',
      retry: '다시 시도',
      previous: '이전',
      next: '다음',
      page: '페이지',
    },
    destinations: {
      eyebrow: '여행지',
      title: '그 도시를 가장 잘 아는 사람이 들려주는 이야기.',
      body: '엄선된 여행지를 둘러보세요 — 크리에이터들이 지금까지 정리한 가이드, 공개된 체험, 라이브 세션을 확인할 수 있어요.',
      empty: '새로운 여행지를 준비 중이에요. 곧 다시 확인해 주세요.',
      guideCount: (count) => `가이드 ${count}개`,
      experienceCount: (count) => `체험 ${count}개`,
      guidesHeading: '가이드',
      emptyGuides: '이 여행지의 가이드가 아직 없어요.',
      experiencesHeading: '체험',
      emptyExperiences: '이 여행지에 공개된 체험이 아직 없어요.',
      articlesHeading: '아티클',
      emptyArticles: '이 여행지의 아티클이 아직 없어요.',
      sessionsHeading: '예정된 세션',
      emptySessions: '이 여행지에서 예정된 세션이 현재 없어요.',
      metadataDescription: (name) => `${name}의 가이드, 체험, 아티클, 세션을 확인해 보세요.`,
    },
    experiences: {
      hostedBy: '주최:',
      priceLabel: '~부터',
      durationLabel: '소요 시간',
      minutesSuffix: '분',
      backToMerchant: '돌아가기',
      metadataDescription: (name, city) => `${city}의 ${name}.`,
    },
    merchants: {
      websiteLabel: '웹사이트',
      experiencesHeading: '체험',
      experiencesEmpty: '아직 게시된 체험이 없습니다.',
      metadataDescription: (name) => `${name}이 게시한 체험.`,
    },
    sessions: {
      eyebrow: '커뮤니티 세션',
      title: '현지 크리에이터의 라이브 브리핑.',
      body: '질문하고 진짜 답을 들어보세요. 가이드를 쓴 크리에이터의 다시보기 영상도 볼 수 있어요.',
      upcomingHeading: '예정된 세션',
      emptyUpcoming: '지금은 예정된 세션이 없어요 — 곧 다시 확인해 주세요.',
      replaysHeading: '다시보기',
      emptyReplays: '아직 다시보기가 없습니다.',
      typeDestinationBriefing: '여행지 브리핑',
      typeAskACreator: '크리에이터에게 질문하기',
      typeMerchantSpotlight: '매장 스포트라이트',
      typeNewCreatorIntro: '신규 크리에이터 소개',
      metadataDescription: (title, host) => `${host}이 주최하는 ${title}.`,
    },
    creators: {
      profileLabel: '공개 크리에이터 프로필',
      guidesHeading: '발행한 가이드',
      guidesEmpty: '아직 발행한 가이드가 없습니다.',
      previous: '이전',
      next: '다음',
      metadataDescription: (name) => `Kinnso 크리에이터 ${name}.`,
    },
    guides: {
      sourceHeading: '가이드 출처',
      structuredItinerary: '구조화된 일정',
      readingSummary: '읽기 요약 — 구조화된 일정 없음',
      author: '작성자',
      publishedVersion: '게시 버전',
      publishedAt: '게시 시간',
      daysStops: '일수 / 방문지',
      originalLanguage: '원본 콘텐츠 언어',
      verificationDate: '장소 확인일',
      notRecorded: '기록 없음',
      notice: '게시 시간은 확인일이 아닙니다. 여행 전에 최신 장소 정보와 출처를 확인하세요. 작성자 콘텐츠는 자동 번역되지 않습니다.',
      checkingBookmark: '저장 상태 확인 중…',
      signInToBookmark: '로그인하여 이 가이드 저장',
      bookmarkGuide: '가이드 저장',
      removeBookmark: '저장 취소',
      bookmarkError: '저장을 확인하지 못했습니다. 다시 시도해 주세요.',
      retryBookmark: '저장 다시 시도',
      metadataDescription: (title) => `Kinnso 가이드: ${title}.`,
    },
  },
  th: {
    common: {
      unavailable: 'ไม่สามารถโหลดเนื้อหาได้ นี่คือปัญหาการเชื่อมต่อ ไม่ใช่รายการว่าง',
      retry: 'ลองอีกครั้ง',
      previous: 'ก่อนหน้า',
      next: 'ถัดไป',
      page: 'หน้า',
    },
    destinations: {
      eyebrow: 'จุดหมาย',
      title: 'ทุกเมือง เล่าโดยคนที่รู้จักมันดีที่สุด',
      body: 'สำรวจจุดหมายที่คัดสรรมาแล้ว — ดูไกด์ ประสบการณ์ที่เผยแพร่ และเซสชันสดที่ครีเอเตอร์ของเรารวบรวมไว้จนถึงตอนนี้',
      empty: 'จุดหมายใหม่ ๆ กำลังจะมา แวะมาดูอีกครั้งเร็ว ๆ นี้',
      guideCount: (count) => `${count} ไกด์`,
      experienceCount: (count) => `${count} ประสบการณ์`,
      guidesHeading: 'ไกด์',
      emptyGuides: 'จุดหมายนี้ยังไม่มีไกด์',
      experiencesHeading: 'ประสบการณ์',
      emptyExperiences: 'ที่นี่ยังไม่มีประสบการณ์ที่เผยแพร่',
      articlesHeading: 'บทความ',
      emptyArticles: 'จุดหมายนี้ยังไม่มีบทความ',
      sessionsHeading: 'เซสชันที่จะถึงนี้',
      emptySessions: 'ขณะนี้ยังไม่มีเซสชันที่กำหนดไว้สำหรับจุดหมายนี้',
      metadataDescription: (name) => `สำรวจไกด์ ประสบการณ์ บทความ และเซสชันสำหรับ${name}`,
    },
    experiences: {
      hostedBy: 'จัดโดย',
      priceLabel: 'เริ่มต้น',
      durationLabel: 'ระยะเวลา',
      minutesSuffix: 'นาที',
      backToMerchant: 'กลับไปที่',
      metadataDescription: (name, city) => `${name} ใน${city}`,
    },
    merchants: {
      websiteLabel: 'เว็บไซต์',
      experiencesHeading: 'ประสบการณ์',
      experiencesEmpty: 'ยังไม่มีประสบการณ์ที่เผยแพร่',
      metadataDescription: (name) => `ประสบการณ์ที่เผยแพร่โดย${name}`,
    },
    sessions: {
      eyebrow: 'คอมมูนิตี้เซสชัน',
      title: 'ไลฟ์สดจากครีเอเตอร์ตัวจริงในพื้นที่',
      body: 'ถามคำถาม รับคำตอบจริง และดูวิดีโอย้อนหลังจากครีเอเตอร์เจ้าของไกด์',
      upcomingHeading: 'เซสชันที่กำลังจะมาถึง',
      emptyUpcoming: 'ตอนนี้ยังไม่มีเซสชันที่กำหนดไว้ — กลับมาดูใหม่เร็ว ๆ นี้',
      replaysHeading: 'วิดีโอย้อนหลัง',
      emptyReplays: 'ยังไม่มีวิดีโอย้อนหลัง',
      typeDestinationBriefing: 'บรีฟจุดหมายปลายทาง',
      typeAskACreator: 'ถามครีเอเตอร์',
      typeMerchantSpotlight: 'สปอตไลท์ร้านค้า',
      typeNewCreatorIntro: 'แนะนำครีเอเตอร์ใหม่',
      metadataDescription: (title, host) => `${title} โดย${host}`,
    },
    creators: {
      profileLabel: 'โปรไฟล์ครีเอเตอร์สาธารณะ',
      guidesHeading: 'ไกด์ที่เผยแพร่',
      guidesEmpty: 'ยังไม่มีไกด์ที่เผยแพร่',
      previous: 'ก่อนหน้า',
      next: 'ถัดไป',
      metadataDescription: (name) => `ครีเอเตอร์ Kinnso ${name}`,
    },
    guides: {
      sourceHeading: 'แหล่งที่มาของไกด์',
      structuredItinerary: 'แผนเดินทางแบบโครงสร้าง',
      readingSummary: 'สรุปสำหรับอ่าน — ไม่มีแผนเดินทางแบบโครงสร้าง',
      author: 'ผู้เขียน',
      publishedVersion: 'เวอร์ชันที่เผยแพร่',
      publishedAt: 'เวลาเผยแพร่',
      daysStops: 'จำนวนวัน / จุดแวะ',
      originalLanguage: 'ภาษาต้นฉบับของเนื้อหา',
      verificationDate: 'วันที่ตรวจสอบสถานที่',
      notRecorded: 'ไม่ได้บันทึก',
      notice: 'เวลาเผยแพร่ไม่ใช่วันที่ตรวจสอบ โปรดตรวจสอบข้อมูลสถานที่และแหล่งที่มาล่าสุดก่อนเดินทาง เนื้อหาของผู้เขียนไม่ได้แปลโดยอัตโนมัติ',
      checkingBookmark: 'กำลังตรวจสอบสถานะการบันทึก…',
      signInToBookmark: 'เข้าสู่ระบบเพื่อบันทึกไกด์นี้',
      bookmarkGuide: 'บันทึกไกด์',
      removeBookmark: 'ยกเลิกการบันทึก',
      bookmarkError: 'ยังไม่ยืนยันการบันทึก โปรดลองอีกครั้ง',
      retryBookmark: 'ลองบันทึกอีกครั้ง',
      metadataDescription: (title) => `ไกด์ Kinnso: ${title}`,
    },
  },
};

export function publicLabels(locale: string): PublicLabels | null {
  const language = publicLanguage(locale);
  return language ? labels[language] : null;
}
