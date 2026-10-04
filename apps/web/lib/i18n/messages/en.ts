export interface MissionsOpsMessages {
  title: string
  subtitle: string
  tabOverview: string
  tabDirectory: string
  kpiTotal: string
  kpiPublished: string
  kpiDraft: string
  kpiPaused: string
  kpiCompleted: string
  kpiCancelled: string
  kpiOpenForApplications: string
  kpiSubmissionsAwaitingReview: string
  trendMissionsCreated: string
  trendSubmissionsReviewed: string
  trendEmpty: string
  atRiskTitle: string
  atRiskEmpty: string
  reasonPublishedNoParticipants: string
  reasonStalledSubmissions: string
  reasonVerificationFailed: string
  colMission: string
  colCreator: string
  colVerification: string
  colActions: string
  queueTitle: string
  queueSubtitle: string
  queueEmpty: string
  waitingOnCreator: string
  actApprove: string
  actReject: string
  actRequestRevision: string
  actCancel: string
  actApply: string
  reasonCategoryPlaceholder: string
  reasonFormat: string
  reasonKeyMessage: string
  reasonCompliance: string
  reasonQuality: string
  reasonOther: string
  reasonUnreadable: string
  reasonWrongVenue: string
  reasonDuplicate: string
  reasonAmountUnclear: string
  viewQueue: string
  confidenceVerified: string
  confidenceNeedsReview: string
  confidenceUnavailable: string
  actRerunVerification: string
  rerunQueued: string
  rerunFailed: string
  autoApprovePolicyLabel: string
  autoApprovePolicyOff: string
  autoApprovePolicyOn: string
  autoApprovePolicySaved: string
  autoApprovePolicyError: string
  attentionOverdueTitle: string
  attentionOverdueEmpty: string
}

export interface MerchantApplyMessages {
  title: string
  subtitle: string
  signedOutTitle: string
  signedOutBody: string
  signInCta: string
  signUpCta: string
  alreadyMerchantTitle: string
  alreadyMerchantBody: string
  alreadyMerchantCta: string
  formCompanyName: string
  formContactName: string
  formContactEmail: string
  formWebsite: string
  formPitch: string
  formPitchPlaceholder: string
  submitCta: string
  errorGeneric: string
  pendingTitle: string
  pendingBody: string
  rejectedTitle: string
  rejectedBody: string
  reapplyCta: string
  decisionReasonLabel: string
}

export interface MerchantApplicationsOpsMessages {
  pendingHeading: string
  pendingEmpty: string
  decidedHeading: string
  decidedEmpty: string
  colApplicant: string
  colEmail: string
  colWebsite: string
  colSubmitted: string
  colStatus: string
  colDecidedBy: string
  statusPending: string
  statusApproved: string
  statusRejected: string
  actApprove: string
  actReject: string
  actCancel: string
  actConfirm: string
  reasonPlaceholder: string
  actionFailed: string
  pitchLabel: string
  noPitch: string
  noWebsite: string
}

export interface BookingsOpsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchantPayout: string
  colCreatorCommission: string
  colKinnsoCommission: string
  colStatus: string
  noCreatorLeg: string
  markPaidButton: string
  reasonPlaceholder: string
  actionFailed: string
}

export interface MerchantDashboardMessages {
  title: string
  subtitle: string
  open: string
  cardPostTitle: string
  cardPostBody: string
  cardMissionsTitle: string
  cardMissionsBody: string
  cardCreatorsTitle: string
  cardCreatorsBody: string
  cardInsightsTitle: string
  cardInsightsBody: string
  cardExperiencesTitle: string
  cardExperiencesBody: string
  cardBookingsTitle: string
  cardBookingsBody: string
  cardOffersTitle: string
  cardOffersBody: string
  cardRedeemTitle: string
  cardRedeemBody: string
  cardProfileTitle: string
  cardProfileBody: string
  cardBudgetTitle: string
  cardBudgetBody: string
  budgetTitle: string
  budgetSubtitle: string
  budgetBalance: string
  budgetEnforcedOn: string
  budgetEnforcedOff: string
  budgetLedgerTitle: string
  budgetLedgerEmpty: string
  budgetNoBudget: string
  kindTopup: string
  kindDebit: string
  kindAdjust: string
  profileTitle: string
  profileSubtitle: string
  slugLabel: string
  slugNote: string
  fieldCompanyName: string
  fieldContactName: string
  fieldContactEmail: string
  fieldWebsite: string
  fieldTagline: string
  fieldCity: string
  fieldLogoUrl: string
  saveCta: string
  savedNote: string
  expTitle: string
  expSubtitle: string
  expNew: string
  expEmpty: string
  colTitle: string
  colCity: string
  colPrice: string
  colStatus: string
  statusDraft: string
  statusPublished: string
  statusPaused: string
  actEdit: string
  actPublish: string
  actPause: string
  formTitleNew: string
  formTitleEdit: string
  fieldTitle: string
  fieldSummary: string
  fieldDescription: string
  fieldExpCity: string
  fieldPrice: string
  fieldCurrency: string
  fieldDuration: string
  fieldCoverUrl: string
  saveDraftCta: string
  publishCta: string
  backToList: string
  errorGeneric: string
  errRequired: string
  errTooLong: string
  errInvalidUrl: string
  errInvalidNumber: string
  actAvailability: string
  availTitle: string
  availSubtitle: string
  availBackToExperience: string
  availAddHeading: string
  fieldDate: string
  fieldCapacity: string
  addDateCta: string
  availEmpty: string
  colDate: string
  colCapacity: string
  colBooked: string
  statusOpen: string
  statusClosed: string
  actClose: string
  errInvalidDate: string
  errDuplicateDate: string
}

export interface MerchantBookingsMessages {
  title: string
  empty: string
  colExperience: string
  colTraveler: string
  colCreator: string
  colQty: string
  colAmount: string
  colStatus: string
  directLabel: string
  markCompleteButton: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
}

export interface TravelerTripsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchant: string
  colQty: string
  colStatus: string
  colAmount: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
  bookedOnLabel: string
  savedGuidesTitle: string
  savedGuidesEmpty: string
  savedExperiencesTitle: string
  savedExperiencesEmpty: string
  reviewCta: string
  reviewedLabel: string
}

export interface MerchantsDirectoryMessages {
  heading: string
  subtitle: string
  empty: string
  viewProfile: string
  newHereNote: string
  newHereCta: string
}

export interface MerchantProfileMessages {
  enquiryCta: string
  featuredGuidesHeading: string
  websiteLabel: string
  experiencesHeading: string
  experiencesEmpty: string
  workWithCreatorsNote: string
  workWithCreatorsCta: string
}

export interface ExperiencePublicMessages {
  hostedBy: string
  priceLabel: string
  durationLabel: string
  minutesSuffix: string
  backToMerchant: string
}

export interface BookingMessages {
  selectDateLabel: string
  noAvailability: string
  qtyLabel: string
  spotsLeftLabel: string
  opensSoonCta: string
  soldOutLabel: string
  guestEmailLabel: string
  guestEmailPlaceholder: string
  guestEmailHint: string
  submitCta: string
  submittingCta: string
  invalidEmail: string
  invalidQty: string
  genericError: string
  rateLimitedError: string
  confirmedTitle: string
  confirmedBody: string
  completedTitle: string
  completedBody: string
  cancelledTitle: string
  cancelledBody: string
  refundedTitle: string
  refundedBody: string
  pendingTitle: string
  pendingBody: string
  refreshCta: string
  notFoundTitle: string
  notFoundBody: string
  summaryQtyLabel: string
  summaryTotalLabel: string
}

export interface Messages {
  brand: string
  categories: { destinations: string; dining: string; shopping: string }
  breadcrumb: { home: string; articles: string }
  article: { youMayLike: string; faqTitle: string; tableOfContents: string; by: string; fallbackNotice: string; guidesNearbyEyebrow: string; guidesNearbyHeading: string; experiencesNearbyEyebrowWaitlist: string; experiencesNearbyHeadingWaitlist: string; experiencesNearbyEyebrowLive: string; experiencesNearbyHeadingLive: string }
  detailError: { title: string; body: string; retry: string; explore: string }
  seo: {
    brandTitle: string
    brandDescription: string
    home: { title: string; description: string }
    explore: { title: string; description: string }
    creators: { title: string; description: string }
    agentLive: { title: string; description: string }
    agentWaitlist: { title: string; description: string }
    about: { title: string; description: string }
    contact: { title: string; description: string }
    merchants: { title: string; description: string }
    terms: { title: string; description: string }
    forCreators: { title: string; description: string }
    forMerchants: { title: string; description: string }
    sessions: { title: string; description: string }
    destinations: { title: string; description: string }
    articles: {
      title: string
      descriptionBookingLive: string
      descriptionBookingWaitlist: string
    }
  }
  listing: { searchPlaceholder: string; filterRegion: string; filterTag: string; noResults: string; resultsCount: string }
  pagination: { prev: string; next: string; page: string }
  auth: {
    signIn: string
    signUp: string
    signOut: string
    email: string
    password: string
    emailSent: string
    emailSentDesc: string
    emailSentNext: string
    emailSentSignIn: string
    emailSentUseAnother: string
    alreadyHaveAccount: string
    noAccount: string
    signUpCreatorTitle: string
    signUpCreatorSubtitle: string
    termsPrefix: string
    termsLink: string
    errorInvalidCredentials: string
    errorEmailTaken: string
    errorInvalidEmail: string
    errorRateLimited: string
    errorGeneric: string
    creatorDashboard: string
    onboardingPlaceholder: string
    forgotPassword: string
    resetPasswordTitle: string
    resetPasswordRequestDesc: string
    resetPasswordSubmit: string
    resetPasswordEmailSentDesc: string
    newPasswordTitle: string
    newPasswordLabel: string
    confirmPasswordLabel: string
    newPasswordSubmit: string
    errorPasswordMismatch: string
    errorPasswordTooShort: string
    resetLinkInvalidTitle: string
    resetLinkInvalidDesc: string
    backToSignIn: string
  }
  onboarding: {
    title: string
    welcomeStep: {
      heading: string
      intro: string
      pointPublic: string
      pointTime: string
      pointEdit: string
      cta: string
      platforms: string
    }
    handlesStep: {
      heading: string
      intro: string
      instagram: string
      youtube: string
      threads: string
      placeholder: string
      add: string
      remove: string
      run: string
      errorEmpty: string
      errorFormat: string
      errorLength: string
      errorDuplicate: string
      needOne: string
    }
    progressStep: {
      heading: string
      phaseQueued: string
      phaseFetching: string
      phaseAnalyzing: string
      phaseReady: string
      phaseFailed: string
      statePending: string
      stateOk: string
      stateFailed: string
      retry: string
      rateLimited: string
      reauth: string
      error: string
      unconfigured: string
      stepFetchingDesc: string
      stepAnalyzingDesc: string
      stepReadyTitle: string
      stepReadyDesc: string
      timeHint: string
      elapsed: string
      continue: string
    }
    signOut: string
  }
  dna: {
    reviewHeading: string
    reviewIntro: string
    thinNotice: string
    bio: string
    niches: string
    contentPillars: string
    tone: string
    topGeos: string
    topLocales: string
    languages: string
    platforms: string
    unverified: string
    listHint: string
    publish: string
    saving: string
    invalid: string
    readBackHeading: string
    readBackIntro: string
    enterStudio: string
  }
  studio: {
    introHeading: string
    introSub: string
    instagram: string
    handlePlaceholder: string
    startScan: string
    scanningHeading: string
    stepConnected: string
    stepFetched: string
    stepClassified: string
    stepCities: string
    stepPhotoScan: string
    stepScoreReady: string
    stepMissionsMatched: string
    reportReadyHeading: string
    lastScanned: string
    postsAnalyzed: string
    rescan: string
    rescanIn: string
    lastScannedAgo: string
    avgLikes: string
    avgSaves: string
    er: string
    travel: string
    commission: string
    scoreBreakdownToggle: string
    scoreBreakdownReach: string
    scoreBreakdownEr: string
    scoreBreakdownTravel: string
    scoreBreakdownDiversity: string
    scoreBreakdownRecency: string
    scoreBreakdownReachTip: string
    scoreBreakdownErTip: string
    scoreBreakdownTravelTip: string
    scoreBreakdownDiversityTip: string
    scoreBreakdownRecencyTip: string
    scoreBreakdownPts: string
    scoreBreakdownTotal: string
    engagementOverTime: string
    yourAudience: string
    audienceOther: string
    whatYouCreate: string
    placesCovered: string
    placesCoveredSub: string
    topVenues: string
    bestTravelPosts: string
    rankedByEngagement: string
    knownFor: string
    matchedForYou: string
    reachToUnlock: string
    viewAllMissions: string
    publishProfile: string
    shareDnaCard: string
    shareDialogTitle: string
    shareCopyLink: string
    shareCopied: string
    deltaUnchanged: string
    deltaSinceLastScan: string
    scanHint: string
    // Slice 2 — DNA core panel
    dnaCoreHeading: string
    dnaBio: string
    dnaNiches: string
    dnaPillars: string
    dnaTone: string
    dnaAudienceGeos: string
    dnaLocales: string
    dnaLanguages: string
    dnaPlatforms: string
    // Slice 2 — sample-metrics labelling
    sampleBadge: string
    sampleNote: string
    demoBanner: string
    // Slice 2 — empty state (no published DNA)
    noDnaHeading: string
    noDnaBody: string
    noDnaCta: string
  }
  creatorProfile: {
    metaTitle: string
    metaDescription: string
    notFoundTitle: string
    follow: string
    following: string
    statGuides: string
    statCountries: string
    statCities: string
    statReach90d: string
    statDrivenGmv: string
    engagementBandSummary: string
    notConnected: string
    followers: string
    avgEng: string
    travelPct: string
    destinationsCovered: string
    destinationsCoveredSub: string
    topPlacesCovered: string
    dnaScore6mo: string
    contentMix: string
    topTags: string
    latestGuides: string
    viewAllGuides: string
    recentPosts: string
    tabAll: string
    tabInstagram: string
    tabThreads: string
    tabYoutube: string
    cityPostsHeading: string
    cityPlacesHeading: string
    cityNoPosts: string
    cityFirstVisited: string
    cityLastVisited: string
    cityPosts: string
    cityAvgEng: string
    cityTotalEngagement: string
    brandWorkWith: string
    brandTierLine: string
    brandReachLine: string
    brandSendBrief: string
    brandSaveToList: string
    brandSignInToContact: string
    nichesHeading: string
    pillarsHeading: string
    toneHeading: string
    audienceRegionsLabel: string
    audienceLocalesLabel: string
    languagesHeading: string
    platformsHeading: string
    verifiedLabel: string
    guidesHeading: string
    guidesEmpty: string
  }
  merchants: {
    heading: string
    sub: string
    yourProfile: string
    searchPlaceholder: string
    filter: string
    tabRecommended: string
    tabSaved: string
    tabWorking: string
    emptyRecommended: string
    emptySaved: string
    emptyWorking: string
    addPrivateNote: string
    statusInProgress: string
    statusDelivered: string
    statusCompleted: string
    matchLabel: string
    reasonCovers: string
    reasonCreator: string
    reasonTier: string
    reasonAudience: string
    cardDna: string
    cardEr: string
    cardGuides: string
    cardReach: string
    cardCountries: string
    viewProfile: string
    sendBrief: string
    save: string
    saved: string
    showDetails: string
    hideDetails: string
    detailTopLocations: string
    detailContentSample: string
    detailEngagementTrend: string
    filterTitle: string
    filterLocation: string
    filterScore: string
    filterMinEr: string
    filterTier: string
    filterCategory: string
    filterAudience: string
    filterPlatforms: string
    filterMinFollowers: string
    filterActivity: string
    followersAny: string
    activity7: string
    activity30: string
    activity90: string
    activityAny: string
    clearAll: string
    applyFilters: string
    close: string
    searchesLeft: string
    invitesLeft: string
    upgradeToGrowth: string
    upgradeBlurb: string
    upgradeCta: string
    lockedFilter: string
    inviteDisabled: string
    resultsCapped: string
  }
  missions: {
    missionQueue: string
    backToQueue: string
    joinMission: string
    applyMission: string
    generatePartnerLink: string
    approve: string
    reject: string
    requestRevision: string
    submitMilestone: string
    participants: string
    pendingApplications: string
    settlement: string
    postHeading: string
    postSub: string
    typeCoupon: string
    typeHybrid: string
    typePaid: string
    typeReceiptCashback: string
    title: string
    summary: string
    couponCode: string
    couponUrl: string
    affiliateCommissionRate: string
    kinnsoCommissionRate: string
    creatorCommissionRate: string
    paidFeeAmount: string
    paidFeeCurrency: string
    receiptCashbackAmount: string
    maxReceiptsPerCreator: string
    milestoneTitle: string
    milestoneDescription: string
    saveDraft: string
    publish: string
    openMission: string
    targetedMission: string
    validationError: string
    myMissions: string
    availableMissions: string
    milestoneProgress: string
    myMissionsEmpty: string
    availableEmpty: string
    viewDetails: string
    postSuccessTitle: string
    postSuccessBody: string
    viewMission: string
    missionsEmptyTitle: string
    missionsEmptyBody: string
    postMissionCta: string
    creatorFallback: string
    locked: string
    lockedHelp: string
    minTierLabel: string
    minTierOpen: string
    minTierRising: string
    minTierPro: string
    minTierElite: string
    invitationsTitle: string
    acceptInvite: string
    acceptInviteFailed: string
    fundedBadge: string
    briefDetailsHeading: string
    briefListHint: string
    deliverablesLabel: string
    requirementsLabel: string
    dosLabel: string
    dontsLabel: string
    keyMessagesLabel: string
    referenceLinksLabel: string
    referenceLinksInvalidError: string
    effortLabel: string
    effortUnset: string
    effortLow: string
    effortMedium: string
    effortHigh: string
  }
  missionDetail: {
    back: string
    briefHeading: string
    milestonesHeading: string
    notStarted: string
    dueLabel: string
    join: string
    apply: string
    applyNoteLabel: string
    applyNotePlaceholder: string
    awaitingTitle: string
    awaitingBody: string
    rejectedTitle: string
    rejectedBody: string
    couponHeading: string
    couponCodeLabel: string
    partnerLinksHeading: string
    openLink: string
    proofUrlLabel: string
    proofUrlPlaceholder: string
    submissionNotesLabel: string
    submissionNotesPlaceholder: string
    submitMilestone: string
    resubmitMilestone: string
    submitError: string
    merchantFeedbackLabel: string
    verifying: string
    verifiedSignal: string
    needsReview: string
    couldntVerify: string
    verificationFailed: string
    retry: string
    receiptsHeading: string
    receiptProofUrlLabel: string
    receiptProofUrlPlaceholder: string
    submitReceipt: string
    receiptCountLabel: (count: number, max: number) => string
    receiptCapReached: string
    receiptSubmissionsEmpty: string
    rejectionReasonLabel: string
    receiptReasonUnreadable: string
    receiptReasonWrongVenue: string
    receiptReasonDuplicate: string
    receiptReasonAmountUnclear: string
    receiptReasonOther: string
    deliverablesHeading: string
    requirementsHeading: string
    dosHeading: string
    dontsHeading: string
    keyMessagesHeading: string
    referenceLinksHeading: string
    effortBadgeLabel: (level: 'low' | 'medium' | 'high') => string
  }
  ops: {
    backHome: string
    settlementHeading: string
    settlementSub: string
    markPaid: string
    statusPending: string
    statusPaid: string
  }
  nav: {
    linkCreators: string; linkAgent: string; linkMerchants: string
    linkArticles: string; linkFindCreators: string; linkMissions: string
    linkInsights: string
    linkExplore: string; linkDestinations: string; linkSessions: string
    linkForCreators: string; linkForMerchants: string
    signUp: string; ctaOpenStudio: string; ctaPending: string
    ctaPostMission: string; ctaMyTrips: string
    signIn: string; language: string; menuToggle: string; skipToContent: string
    merchantMenuLabel: string
  }
  footer: {
    tagline: string; colCreators: string; colMerchants: string; colCompany: string
    colExplore: string; colTravellers: string; lGuides: string; lDestinations: string; lArticles: string; lSessions: string; lTrips: string; lSaved: string
    lApply: string; lStudio: string; lMissions: string; lEarnings: string
    lPostMission: string; lPricing: string; lContact: string; lDirectory: string
    lAbout: string; lAgent: string; lLegal: string; rights: string
    lForCreators: string
  }
  analytics: {
    title: string; description: string; accept: string; decline: string; changePreference: string
  }
  home: {
    heroEyebrow: string; heroTitle: string; heroSubtitle: string
    heroPrimaryCta: string; heroSecondaryCta: string
    statCreators: string; statGuides: string; statDestinations: string; statCompletedBookings: string; statUpcomingSessions: string; statGrowingFast: string
    roleCreator: string; roleTraveller: string; roleMerchant: string
    testimonialsHeading: string
    howEyebrow: string; howHeading: string; howSub: string
    howTabTravellers: string; howTabCreators: string; howTabMerchants: string
    howT1Title: string; howT1Desc: string; howT2Title: string; howT2Desc: string; howT3TitleLive: string; howT3TitleWaitlist: string; howT3DescLive: string; howT3DescWaitlist: string
    howC1Title: string; howC1Desc: string; howC2Title: string; howC2Desc: string; howC3Title: string; howC3Desc: string
    howM1Title: string; howM1Desc: string; howM2Title: string; howM2Desc: string; howM3Title: string; howM3Desc: string
    featuredEyebrow: string; featuredHeading: string; featuredSub: string; featuredSeeAll: string; featuredEmpty: string
    agentLiveEyebrow: string; agentLiveTitle: string; agentLiveBodyBookingLive: string; agentLiveBodyBookingWaitlist: string; agentLiveCta: string; agentLiveNote: string
    agentWaitlistEyebrow: string; agentWaitlistTitle: string; agentWaitlistBody: string; agentWaitlistNote: string
    articlesEyebrow: string; articlesHeading: string; articlesSeeAll: string
    sessionsEyebrow: string; sessionsHeading: string; sessionsSub: string
    merchantEyebrow: string; merchantHeading: string
    merchantBullet1: string; merchantBullet2: string; merchantBullet3: string; merchantCta: string
    creatorEyebrow: string; creatorHeading: string
    creatorBullet1: string; creatorBullet2: string; creatorBullet3: string; creatorCta: string
  }
  about: {
    eyebrow: string; title: string; intro: string
    missionHeading: string; missionBody: string
    creatorsHeading: string; creatorsBody: string
    merchantsHeading: string; merchantsBody: string
    ctaHeading: string; ctaBody: string; ctaButton: string
  }
  contact: {
    eyebrow: string; title: string; intro: string
    emailLabel: string; emailCta: string; responseNote: string
  }
  comingSoon: { heading: string; body: string; back: string }
  creatorTerms: {
    eyebrow: string; title: string; draftNotice: string; englishNotice: string; back: string
  }
  agent: {
    eyebrow: string; title: string; bodyBookingLive: string; bodyBookingWaitlist: string
    waitlistTitle: string; waitlistBody: string
    pointsHeading: string
    point1Title: string; point1Body: string
    point2Title: string; point2Body: string
    point3TitleBookingLive: string; point3BodyBookingLive: string
    point3TitleBookingWaitlist: string; point3BodyBookingWaitlist: string
    errorGeneric: string
    inputPlaceholder: string; send: string; toolWorking: string
    ratingUpLabel: string; ratingDownLabel: string
    unconfiguredTitle: string; unconfiguredBody: string
  }
  forCreators: {
    heroEyebrow: string; heroTitle: string; heroSub: string
    heroCtaPrimary: string; heroCtaSecondary: string
    howEyebrow: string; howHeading: string
    step1Title: string; step1Body: string
    step2Title: string; step2Body: string
    step3Title: string; step3Body: string
    whyHeading: string; why1: string; why2: string; why3Waitlist: string; why3Live: string
    testimonialsHeading: string
    ctaTitle: string; ctaBody: string; ctaButton: string
  }
  forMerchants: {
    heroEyebrow: string; heroTitle: string; heroSub: string
    heroCtaPrimary: string; heroCtaSecondary: string
    howEyebrow: string; howHeading: string
    step1Title: string; step1Body: string
    step2Title: string; step2Body: string
    step3Title: string; step3Body: string
    whyHeading: string; why1: string; why2: string; why3Waitlist: string; why3Live: string
    testimonialsHeading: string
    ctaTitle: string; ctaBody: string; ctaButton: string
  }
  studioHome: {
    pill: string; heading: string; subtitle: string
    liveBadge: string; soonBadge: string; open: string
    scanTitle: string; scanDesc: string
    missionsTitle: string; missionsDesc: string
    earningsTitle: string; earningsDesc: string
    offersTitle: string; offersDesc: string
    inboxTitle: string; inboxDesc: string
    guidesTitle: string; guidesDesc: string
    tierTitle: string
    tierDesc: string
    copilotTitle: string
    copilotDesc: string
    perksTitle: string
    perksDesc: string
    insightsTitle: string
    insightsDesc: string
    sessionsTitle: string
    sessionsDesc: string
    unreadBadgeLabel: string
  }
  notifications: {
    heading: string
    subtitle: string
    empty: string
    'submission.approved': string
    'submission.rejected': string
    'submission.revision_requested': string
    'settlement.created': string
    'payout_batch.created': string
    'payout_batch.paid': string
    'payout_batch.cancelled': string
  }
  studioDashboard: {
    greeting: string
    statusActive: string
    dnaSnapshotTitle: string
    dnaLastScanned: string
    dnaNiches: string
    dnaPillars: string
    viewFullReport: string
    checklistTitle: string
    checklistProgress: string
    itemDnaReadyTitle: string
    itemDnaReadyCta: string
    itemWriteGuideTitle: string
    itemWriteGuideCta: string
    itemConnectTitle: string
    itemConnectGap: string
    itemConnectCta: string
    itemConnectAllDone: string
    itemFreshTitle: string
    itemFreshScanned: string
    itemFreshScannedToday: string
    rescanCta: string
    opportunitiesTitle: string
    opportunitiesEmpty: string
    opportunitiesBrowse: string
    earningsTitle: string
    earningsEmpty: string
    earningsView: string
    quickLinksTitle: string
    addHandleTitle: string
    addHandlePlaceholder: string
    addHandleSave: string
    addHandleCancel: string
    addHandleErrorEmpty: string
    addHandleErrorFormat: string
    addHandleErrorLength: string
    nextActionHeading: string
    nextActionAwaitScan: string
    nextActionStartEarning: string
    nextActionPublishGuide: string
    nextActionConnectPlatforms: string
    nextActionRefreshDna: string
    nextActionNothingOpen: string
    nextActionCta: string
    directoryListed: string
    directoryNeedsGuide: string
    directoryNotListed: string
    addHandleSaved: string
  }
  studioGuides: {
    listPill: string; listHeading: string; listSubtitle: string
    newButton: string; emptyTitle: string; emptyBody: string
    statusDraft: string; statusPublished: string
    edit: string; delete: string; deleteConfirm: string
    formNewHeading: string; formEditHeading: string
    titleLabel: string; titlePlaceholder: string
    cityLabel: string; cityPlaceholder: string
    coverLabel: string; coverPlaceholder: string; coverPreviewAlt: string
    summaryLabel: string; summaryPlaceholder: string
    saveDraft: string; publish: string; saving: string
    backToGuides: string
    errorTitleRequired: string; errorSummaryRequired: string; errorCityRequired: string
    errorCoverRequired: string; errorCoverInvalid: string; errorGeneric: string
  }
  studioSessions: {
    listPill: string; listHeading: string; listSubtitle: string
    newButton: string; emptyTitle: string; emptyBody: string
    statusScheduled: string; statusLive: string; statusEnded: string; statusCancelled: string
    edit: string
    formNewHeading: string; formEditHeading: string
    titleLabel: string; descriptionLabel: string; typeLabel: string
    startsAtLabel: string; durationLabel: string
    embedUrlLabel: string; embedUrlPlaceholder: string
    replayUrlLabel: string; replayUrlPlaceholder: string
    destinationTagsLabel: string; destinationTagsPlaceholder: string
    saveButton: string
    typeDestinationBriefing: string; typeAskACreator: string
    typeMerchantSpotlight: string; typeNewCreatorIntro: string
    hostPickerLabel: string; hostPickerPlaceholder: string; hostRequiredError: string
  }
  explore: {
    pill: string; heading: string; subtitle: string
    gridHeading: string
    savesLabel: string; emptyNote: string
    destinationFilterLabel: string; allDestinations: string
    searchLabel: string; searchPlaceholder: string
    sortLabel: string; newest: string; mostSaved: string
    filters: string; filtersDescription: string; activeFilters: string
    resultsLabel: string; showResults: string
    emptyFilteredTitle: string; emptyFilteredBody: string
    resetFilters: string; loadMore: string; closeFilters: string
  }
  feed: {
    pill: string; heading: string; subtitle: string
    savesLabel: string; empty: string
  }
  creatorsLanding: {
    heroPill: string; heroTitle: string; heroSubtitle: string; applyCta: string
    howHeading: string; howSub: string
    step1Title: string; step1Desc: string
    step2Title: string; step2Desc: string
    step3Title: string; step3Desc: string
    step4Title: string; step4Desc: string
    featuredHeading: string; featuredSub: string
    ctaTitle: string; ctaDesc: string; ctaButton: string
    directoryHeading: string
    directorySub: string
    directoryEmpty: string
    viewProfile: string
    guideCount: string
  }
  merchantsDirectory: MerchantsDirectoryMessages
  merchantProfile: MerchantProfileMessages
  experiencePublic: ExperiencePublicMessages
  booking: BookingMessages
  studioOffers: {
    heading: string
    subtitle: string
    empty: string
    join: string
    generateLink: string
    copy: string
    copied: string
    category: string
    commission: string
    viewProgram: string
    setupNotConfigured: string
    trackingId: string
  }
  studioEarnings: {
    heading: string
    subtitle: string
    paid: string
    pending: string
    colMission: string
    colType: string
    colAmount: string
    colStatus: string
    missionsHeading: string
    missionsEmpty: string
    bookingsHeading: string
    bookingsEmpty: string
    colExperience: string
    trackedHeading: string
    trackedNote: string
    trackedEmpty: string
    colGross: string
    colState: string
    payoutBatchesHeading: string
    payoutBatchesEmpty: string
    colTarget: string
    batchCancelled: string
  }
  tier: {
    cardTitle: string
    toNext: string
    maxed: string
    earnHeading: string
    earnGuide: string
    earnMission: string
    earnScan: string
    viewAll: string
    pageHeading: string
    pageSubtitle: string
    currentLabel: string
    allTiersHeading: string
    unlocksHeading: string
    unlocksMissions: string
    unlocksHelp: string
    nextUnlocksHeading: string
    nextUnlocksIntro: string
    nextUnlocksNone: string
    nextUnlocksMaxed: string
    historyHeading: string
    historyEmpty: string
    eventGuide: string
    eventMission: string
    eventScan: string
    pointsSuffix: string
  }
  copilot: {
    title: string; subtitle: string
    inputPlaceholder: string; send: string; newChat: string
    emptyTitle: string; emptyBody: string
    limitTitle: string; limitBody: string; limitUpsell: string
    toolWorking: string
    errorGeneric: string
    unconfiguredTitle: string; unconfiguredBody: string
    disclaimer: string
  }
  admin: {
    navDashboard: string; navPerks: string; navUsers: string; navCreators: string; navMerchants: string; navTeam: string; navMissions: string; navTestimonials: string; navBookings: string; navSessions: string; navEnquiries: string; navAnalytics: string
    dashboardTitle: string; dashboardSubtitle: string
    statCreators: string; statMerchants: string; statOps: string
    statPerksActive: string; statPerksTotal: string; statRedemptions: string
    analyticsTitle: string; analyticsSubtitle: string; analyticsWindow: string; analyticsWindow24h: string; analyticsWindow7d: string; analyticsFilters: string; analyticsAll: string
    analyticsUtcNote: string; analyticsRetentionNote: string; analyticsAttributionNote: string; analyticsSampleFloorNote: string; analyticsHealthTitle: string; analyticsHealthStatus: string; analyticsHealthAvailable: string; analyticsHealthNoMatching: string; analyticsHealthObservedZero: string; analyticsHealthInsufficient: string; analyticsHealthUnavailable: string; analyticsHealthReturnedRows: string; analyticsHealthOkRows: string; analyticsHealthInsufficientRows: string; analyticsHealthObservedZeroRows: string; analyticsTableCaption: string; analyticsMetric: string
    analyticsLocale: string; analyticsEntityType: string; analyticsBookingState: string; analyticsNumerator: string; analyticsDenominator: string; analyticsRate: string; analyticsStatus: string
    analyticsOk: string; analyticsInsufficientSample: string; analyticsUnavailable: string; analyticsRetry: string; analyticsEmpty: string; analyticsObservedZero: string; analyticsEntityGuide: string
    analyticsEntityExperience: string; analyticsEntityCreator: string; analyticsEntityArticle: string; analyticsBookingOff: string; analyticsBookingOn: string; analyticsMetricDiscoveryToEntity: string
    analyticsMetricEntityToAgent: string; analyticsMetricEntityToCta: string; analyticsMetricCtaToWaitlist: string; analyticsMetricCtaToCheckout: string; analyticsMetricAgentStart: string
    analyticsMetricSignupCompletion: string; analyticsMetricErrorInvalid: string; analyticsMetricErrorRateLimited: string; analyticsMetricErrorUnavailable: string; analyticsMetricErrorUnknown: string; analyticsMetricUnknown: string; analyticsNotApplicable: string
  }
  enquiriesAdmin: {
    title: string; subtitle: string; filterActive: string; filterResolved: string; filterSpam: string; filterAllTypes: string
    typeCreator: string; typeMerchant: string; statusNew: string; statusInProgress: string; statusResolved: string; statusSpam: string
    receivedAt: string; target: string; markInProgress: string; markResolved: string; markSpam: string; reopen: string
    reasonLabel: string; reasonRequired: string; empty: string; actionFailed: string; next: string
  }
  creators: {
    title: string; subtitle: string
    kpiTotal: string; kpiActive: string; kpiSuspended: string; kpiOnboarding: string
    kpiNew: string; kpiPayoutsPending: string
    trendSignups: string; trendEngagement: string; trendEmpty: string
    leaderboardTitle: string; leaderboardEmpty: string; points: string
    atRiskTitle: string; atRiskEmpty: string; reasonScanFailed: string; reasonNoMissions: string
    activityTitle: string; activityEmpty: string
    statusOnboarding: string; statusActive: string; statusSuspended: string; statusBanned: string
    tierSeed: string; tierRising: string; tierPro: string; tierElite: string
    verified: string
    dirSearch: string; dirStatus: string; dirTier: string; dirDna: string; dirVerifiedOnly: string
    dirAll: string; dirLoadMore: string; dirEmpty: string
    colName: string; colTier: string; colDna: string; colJoined: string; colActions: string
    dnaPublished: string; dnaDraft: string; dnaNone: string
    actActivate: string; actSuspend: string; actBan: string; actReinstate: string
    actVerify: string; actUnverify: string; actNote: string; actApply: string; actCancel: string
    actListCreator: string; actRemoveListingOverride: string; listingOverrideOn: string; listingGuideBased: string
    reasonPlaceholder: string; notePlaceholder: string
    confirmBan: string; confirmReinstate: string
    bulkApply: string; bulkSelected: string; bulkChooseAction: string
    actionFailed: string
    tabOverview: string; tabDirectory: string
    detailBack: string; detailJoined: string; detailUpdated: string; detailBio: string; detailNoBio: string
    tabProfile: string; tabMissions: string; tabEarnings: string; tabContent: string; tabModeration: string
    secDna: string; secScan: string; secSocials: string; secContribution: string
    dnaNoData: string; scanNoData: string; socialsNoData: string
    scanStatus: string; scanError: string; scanCompleted: string
    colMission: string; colStatus: string; colSource: string; colMilestones: string; missionsNoData: string
    colAmount: string; colPayout: string; colSettlement: string; settlementsNoData: string
    pointsHistory: string; colEvent: string; colPoints: string; pointsNoData: string; totalPoints: string
    colTitle: string; colSaves: string; colStatusContent: string; contentNoData: string
    secAudit: string; auditNoData: string; addNote: string; saveNote: string
    tabPayouts: string
    payoutsQueue: string; payoutsOwed: string; payoutsSettled: string
    setNotStarted: string; setPending: string; setPartiallyPaid: string; setPaid: string; setDisputed: string
    colOpsNote: string
    actMarkPaid: string; actMarkDisputed: string
    confirmMarkPaid: string; confirmMarkDisputed: string
    payoutsEmpty: string
    reasonRequired: string
    batchesHeading: string; batchesSubtitle: string; batchesEmpty: string
    colCreatorId: string; colCurrency: string; colTargetDate: string; colCreatedAt: string
    batchStatusCancelled: string
    actCreateBatch: string; actCancelBatch: string
    formCreatorId: string; formCurrency: string; formAmount: string
    confirmMarkBatchPaid: string; confirmCancelBatch: string
  }
  bookingsOps: BookingsOpsMessages
  merchantApply: MerchantApplyMessages
  merchantApplicationsOps: MerchantApplicationsOpsMessages
  merchantDashboard: MerchantDashboardMessages
  merchantBookings: MerchantBookingsMessages
  trips: TravelerTripsMessages
  merchantsOps: {
    title: string; subtitle: string
    tabOverview: string; tabDirectory: string; tabApplications: string
    kpiTotal: string; kpiActive: string; kpiPaused: string; kpiSuspended: string; kpiArchived: string
    kpiFree: string; kpiGrowth: string; kpiNew: string; kpiMissionsLive: string; kpiSettlementsPending: string
    trendSignups: string; trendMissions: string; trendEmpty: string
    leaderboardTitle: string; leaderboardEmpty: string; lbMissions: string; lbCreators: string
    atRiskTitle: string; atRiskEmpty: string
    reasonGrowthIdle: string; reasonDisputed: string; reasonPendingOverdue: string
    activityTitle: string; activityEmpty: string
    dirSearch: string; dirStatus: string; dirTier: string; dirAll: string
    dirLoadMore: string; dirEmpty: string
    colName: string; colStatus: string; colTier: string; colJoined: string; colActions: string
    statusActive: string; statusPaused: string; statusSuspended: string; statusArchived: string
    tierFree: string; tierGrowth: string
    actSetStatus: string; actSetTier: string; actNote: string; actApply: string; actCancel: string
    reasonPlaceholder: string; notePlaceholder: string
    confirmArchive: string
    bulkApply: string; bulkSelected: string; bulkChooseAction: string
    actionFailed: string
    detailBack: string; detailJoined: string; detailUpdated: string
    tabProfile: string; tabMissions: string; tabCreators: string; tabBilling: string; tabModeration: string
    secContact: string; secWebsite: string; contactName: string; contactEmail: string; noContact: string
    colMission: string; colVisibility: string; colParticipants: string; colMilestones: string; missionsEmpty: string
    secEngaged: string; secSaved: string; colCreator: string; colHandle: string; colParticipantStatus: string
    creatorsEmpty: string; savedCount: string
    billingReadonly: string; colSettlement: string; colPayout: string; colKinnso: string; colAffiliate: string
    colAmount: string; colCurrency: string; settlementsEmpty: string; owedTitle: string; settledTitle: string; moneyEmpty: string
    secAudit: string; auditEmpty: string; addNote: string; saveNote: string
    viewDetail: string
    budgetPanelTitle: string
    budgetBalance: string
    budgetEnforced: string
    budgetNotEnforced: string
    budgetNoRow: string
    budgetCreditLabel: string
    budgetCreditAmountPlaceholder: string
    budgetReasonPlaceholder: string
    budgetCreditSubmit: string
    budgetEnforceOn: string
    budgetEnforceOff: string
    budgetSaved: string
  }
  missionsOps: MissionsOpsMessages
  perks: {
    catalog: {
      heading: string; subtitle: string; empty: string
      lockedBadge: string; requiresTier: string; unlockCta: string
      redeem: string; redeemed: string; reveal: string; hide: string
      copyCode: string; copied: string; openDeal: string; redeemFailed: string
    }
    admin: {
      title: string; subtitle: string; newPerk: string; editPerk: string; empty: string
      fieldPartner: string; fieldTitle: string; fieldSummary: string; fieldCategory: string
      fieldDiscount: string; fieldMinTier: string; fieldRedemptionType: string
      fieldRedemptionValue: string; fieldSortOrder: string; fieldActive: string
      tierOpen: string; tierRising: string; tierPro: string; tierElite: string
      typeCode: string; typeLink: string
      save: string; cancel: string; activate: string; deactivate: string
      statusActive: string; statusInactive: string
    }
    tierLabels: { rising: string; pro: string; elite: string }
  }
  testimonialsAdmin: {
    title: string; subtitle: string; newCta: string; empty: string
    colAuthor: string; colStatus: string
    roleCreator: string; roleTraveller: string; roleMerchant: string; localeAll: string
    statusDraft: string; statusPublished: string
    actPublish: string; actUnpublish: string; actEdit: string; actDelete: string; deleteConfirm: string
    formNewTitle: string; formEditTitle: string
    formQuote: string; formAuthorName: string; formAuthorRole: string
    formLocale: string; formLocaleHint: string; formSortOrder: string
    formSave: string; formCancel: string
  }
  users: {
    title: string; subtitle: string
    sectionCreators: string; sectionMerchants: string; sectionOps: string
    empty: string; joined: string; unnamed: string
    activate: string; suspend: string
    statusActive: string; statusSuspended: string
    statusOnboarding: string; statusPaused: string; statusArchived: string
    errorGeneric: string
    tierLabel: string; tierFree: string; tierGrowth: string
    manageInConsole: string
  }
  team: {
    overviewTitle: string; overviewSubtitle: string
    kpiMembers: string; kpiPending: string
    roleOwner: string; roleAdmin: string; roleModerator: string; roleAnalyst: string
    statusActive: string; statusSuspended: string
    directoryTitle: string
    colName: string; colRole: string; colStatus: string; colJoined: string
    invitePanelTitle: string; inviteEmailLabel: string; inviteRoleLabel: string
    inviteGenerate: string; inviteCopied: string; inviteExpiry: string
    actionSetRole: string; actionSuspend: string; actionReactivate: string
    actionConfirm: string; actionCancel: string; reasonPlaceholder: string
    acceptTitle: string; acceptLoading: string
    acceptSuccess: string; acceptExpired: string
    acceptEmailMismatch: string; acceptNotFound: string; acceptSignInPrompt: string
  }
  merchantSearch: {
    heading: string
    sub: string
    searchPlaceholder: string
    filter: string
    filtersLocked: string
    upgradeTitle: string
    upgradeBlurb: string
    upgradeCta: string
    tabRecommended: string
    tabSaved: string
    tabWorking: string
    emptyRecommended: string
    emptySaved: string
    emptyWorking: string
    resultsCapped: string
    invitesLeft: string
    reasonNiche: string
    reasonGeo: string
    reasonLanguage: string
    reasonPlatform: string
    guidesLabel: string
    viewProfile: string
    save: string
    saved: string
    sendBrief: string
    addNote: string
    pickMissionTitle: string
    pickMissionEmpty: string
    invited: string
    filterNiches: string
    filterGeos: string
    filterLanguages: string
    filterPlatforms: string
    filterHasGuides: string
    inviteQuotaExceeded: string
    alreadyParticipant: string
    inviteFailed: string
  }
  insights: {
    navLabel: string
    empty: string
    creatorTitle: string
    creatorSubtitle: string
    pointsTotal: string
    visitsDriven: string
    pointsTrajectory: string
    pointsByType: string
    typeGuide: string
    typeMission: string
    typeScan: string
    tierProgress: string
    tierAtMax: string
    pointsToNext: string
    guidesPublished: string
    guideSaves: string
    missionsTitle: string
    statusApplied: string
    statusActive: string
    statusInvited: string
    statusRejected: string
    deliverables: string
    creatorEmptyPoints: string
    creatorEmptyMissions: string
    merchantTitle: string
    merchantSubtitle: string
    missionsPublished: string
    participants: string
    inviteAcceptRate: string
    deliveredWork: string
    perMissionTitle: string
    colMission: string
    colInvited: string
    colApplied: string
    colActive: string
    colRejected: string
    colDelivered: string
    merchantEmpty: string
    notApplicable: string
    visitsDrivenTitle: string
    visitsDrivenEmpty: string
    colCreator: string
    colGuide: string
    colRedemptions: string
    colAttributedBookings: string
    unnamed: string
  }
  guideSave: {
    save: string
    saved: string
    signInToSave: string
    saveFailed: string
  }
  experienceSave: {
    save: string
    saved: string
    signInToSave: string
    saveFailed: string
  }
  reviews: {
    formHeading: string
    ratingLabel: string
    bodyLabel: string
    bodyPlaceholder: string
    submitCta: string
    submittingCta: string
    submitted: string
    alreadyReviewed: string
    genericError: string
    ratingAverageLabel: string
    countLabel: string
    emptyState: string
    anonymousReviewer: string
  }
  featureInterest: {
    emailLabel: string
    emailPlaceholder: string
    submitAgent: string
    submitBooking: string
    pending: string
    success: string
    invalidEmail: string
    retry: string
  }
  enquiry: {
    creatorPurpose: string; merchantPurpose: string; dialogTitle: string; dialogDescription: string
    nameLabel: string; emailLabel: string; messageLabel: string; submit: string; submitting: string
    cancel: string; close: string; invalid: string; rateLimited: string; failed: string
    successTitle: string; successBody: string
  }
  sessions: {
    eyebrow: string; title: string; body: string
    upcomingHeading: string; emptyUpcoming: string; replaysHeading: string
    waitlistValue: string; waitlistInvite: string; waitlistFormLabel: string; waitlistEmailLabel: string
    waitlistSubmit: string; waitlistPending: string; waitlistSuccess: string; waitlistInvalid: string
    waitlistRateLimited: string; waitlistRetry: string
    rsvpEmailLabel: string; rsvpSubmit: string; rsvpConfirmed: string; rsvpError: string
    rsvpCancelledNotice: string
    typeDestinationBriefing: string; typeAskACreator: string
    typeMerchantSpotlight: string; typeNewCreatorIntro: string
  }
  destinations: {
    eyebrow: string; title: string; body: string; empty: string
    guideCount: (count: number) => string; experienceCount: (count: number) => string
    guidesHeading: string; emptyGuides: string
    experiencesHeading: string; emptyExperiences: string
    articlesHeading: string; metadataDescription: (name: string) => string
    sessionsHeading: string; emptySessions: string
  }
  sessionsAdmin: {
    title: string; subtitle: string; newCta: string; empty: string
    statusScheduled: string; statusLive: string; statusEnded: string; statusCancelled: string
    typeDestinationBriefing: string; typeAskACreator: string
    typeMerchantSpotlight: string; typeNewCreatorIntro: string
    actEdit: string; actGoLive: string; actEnd: string; actCancel: string
    actViewRsvps: string; actDelete: string; deleteConfirm: string
    rsvpsEmpty: string
    formNewTitle: string; formEditTitle: string; formCancel: string
    titleLabel: string; descriptionLabel: string; typeLabel: string
    startsAtLabel: string; durationLabel: string
    embedUrlLabel: string; embedUrlPlaceholder: string
    replayUrlLabel: string; replayUrlPlaceholder: string
    destinationTagsLabel: string; destinationTagsPlaceholder: string
    saveButton: string
    hostPickerLabel: string; hostPickerPlaceholder: string; hostRequiredError: string
  }
  merchantOffers: {
    title: string
    fieldTitle: string
    fieldTerms: string
    fieldValue: string
    fieldPerVisitorLimit: string
    fieldTotalCap: string
    discountItem: string
    discountPercent: string
    discountAmount: string
    commissionFlat: string
    commissionPercent: string
    publish: string
    yourOffers: string
    claimed: string
    redeemed: string
    totalClaimed: string
    totalRedeemed: string
    actPublish: string
    actPause: string
    actEnd: string
  }
  offerClaim: {
    claimButton: string
    validThrough: string
    heading: string
    showAt: string
    claimFailed: string
  }
  offerRedeem: {
    title: string
    scanning: string
    manualPlaceholder: string
    manualSubmit: string
    amountSpentPrompt: string
    amountSpentSubmit: string
    success: string
    alreadyRedeemed: string
  }
}

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: 'Destinations', dining: 'Dining', shopping: 'Shopping' },
  breadcrumb: { home: 'Home', articles: 'Articles' },
  article: { youMayLike: 'You may like', faqTitle: 'Frequently asked questions', tableOfContents: 'In this article', by: 'By', fallbackNotice: "This article isn't available in your language yet — showing the original version.", guidesNearbyEyebrow: 'Planning a trip here?', guidesNearbyHeading: 'Creator guides for this destination', experiencesNearbyEyebrowWaitlist: 'Experiences nearby', experiencesNearbyHeadingWaitlist: 'Save for your trip', experiencesNearbyEyebrowLive: 'Bookable experiences', experiencesNearbyHeadingLive: 'Ready to book?' },
  detailError: { title: "We couldn't load this page", body: 'A temporary problem interrupted loading. Try again, or keep exploring.', retry: 'Try again', explore: 'Back to Explore' },
  seo: {
    brandTitle: 'KINNSO — Travel creators, real missions',
    brandDescription:
      'KINNSO connects travel and lifestyle creators with real brand missions, affiliate offers, and an AI copilot to grow your audience.',
    home: {
      title: 'Real travel guides by real creators',
      description:
        'Discover city guides from trusted travel creators, plan with the KINNSO AI agent, and book the trip you actually want — all in one place.',
    },
    explore: {
      title: 'Explore creator guides',
      description: 'Browse real travel guides published by KINNSO creators across Asia and beyond.',
    },
    creators: {
      title: 'Discover travel creators',
      description: 'Find travel and lifestyle creators on KINNSO by niche, audience, and platform.',
    },
    agentLive: {
      title: 'KINNSO AI travel agent — plan with real creator guides',
      description: 'Plan your trip with an AI travel agent that searches real KINNSO creator guides, articles, and experiences.',
    },
    agentWaitlist: {
      title: 'KINNSO AI travel agent — join the waitlist',
      description: 'An AI travel agent grounded in real creator guides. Join the waitlist to hear when it opens.',
    },
    about: {
      title: 'About KINNSO',
      description: 'KINNSO is the creator platform connecting travel and lifestyle creators with real brand missions.',
    },
    contact: {
      title: 'Contact KINNSO',
      description: 'Get in touch with the KINNSO team about partnerships, missions, and creator support.',
    },
    merchants: {
      title: 'Merchant Directory',
      description: 'Discover the merchants and experiences building on KINNSO.',
    },
    terms: {
      title: 'Creator Terms',
      description: 'The terms that govern creators using KINNSO.',
    },
    forCreators: {
      title: 'Become a KINNSO travel creator',
      description: 'Publish travel guides, run vetted brand missions, and earn from the places you genuinely recommend.',
    },
    forMerchants: {
      title: 'Work with vetted travel creators — KINNSO for merchants',
      description: 'Brief vetted travel creators, pay on published results, and reach travellers who trust them.',
    },
    sessions: {
      title: 'Community Sessions — KINNSO',
      description: 'Live briefings, Q&As, and replays from the creators behind our guides.',
    },
    destinations: {
      title: 'Destinations — KINNSO',
      description: 'Browse curated destinations and see the guides, bookable experiences, and live sessions our creators have covered so far.',
    },
    articles: {
      title: 'Travel guides, experiences and local recommendations',
      descriptionBookingLive:
        'Discover creator-led travel guides, bookable local experiences, live sessions and trusted recommendations across Asia.',
      descriptionBookingWaitlist:
        'Discover creator-led travel guides, local experiences, live sessions and trusted recommendations across Asia.',
    },
  },
  listing: { searchPlaceholder: 'Search articles', filterRegion: 'Region', filterTag: 'Tag', noResults: 'No articles found.', resultsCount: 'articles' },
  pagination: { prev: 'Previous', next: 'Next', page: 'Page' },
  auth: {
    signIn: 'Sign in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    email: 'Email address',
    password: 'Password',
    emailSent: 'Check your email',
    emailSentDesc: 'We sent you a confirmation link. Click it to activate your account.',
    emailSentNext: 'After confirming, Kinnso will take you to creator setup to connect Instagram, YouTube, or Threads.',
    emailSentSignIn: 'Sign in after confirming',
    emailSentUseAnother: 'Use another email',
    alreadyHaveAccount: 'Already have an account?',
    noAccount: 'Don\'t have an account?',
    signUpCreatorTitle: 'Apply as a creator',
    signUpCreatorSubtitle: 'Create your account, scan your Creator DNA, and start earning with KINNSO.',
    termsPrefix: 'By creating an account you agree to our',
    termsLink: 'Creator Terms',
    errorInvalidCredentials: 'Invalid email or password.',
    errorEmailTaken: 'An account with this email already exists.',
    errorInvalidEmail: 'Enter a valid email address.',
    errorRateLimited: 'Too many sign-up attempts. Please wait a minute and try again.',
    errorGeneric: 'Something went wrong. Please try again.',
    creatorDashboard: 'Creator Dashboard',
    onboardingPlaceholder: 'Onboarding wizard coming in Plan 4.',
    forgotPassword: 'Forgot password?',
    resetPasswordTitle: 'Reset your password',
    resetPasswordRequestDesc: "Enter your email and we'll send you a link to reset your password.",
    resetPasswordSubmit: 'Send reset link',
    resetPasswordEmailSentDesc: "If an account exists for that email, we've sent a link to reset your password.",
    newPasswordTitle: 'Choose a new password',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm password',
    newPasswordSubmit: 'Reset password',
    errorPasswordMismatch: "Passwords don't match.",
    errorPasswordTooShort: 'Password must be at least 8 characters.',
    resetLinkInvalidTitle: 'This link is invalid or has expired',
    resetLinkInvalidDesc: 'Request a new password reset link.',
    backToSignIn: 'Back to sign in',
  },
  onboarding: {
    title: 'Set up your creator profile',
    welcomeStep: {
      heading: "Let's build your creator DNA",
      intro: 'We read your public posts to draft a profile of your niches, audience and reach — so brands can find and work with you.',
      pointPublic: 'Only your public posts — nothing private',
      pointTime: 'Takes about a minute',
      pointEdit: 'You review & edit before anything goes live',
      cta: 'Get started',
      platforms: 'Works with Instagram, YouTube and Threads',
    },
    handlesStep: {
      heading: 'Add your social handles',
      intro: 'Add 1–3 of the accounts below. We scan them to draft your creator DNA.',
      instagram: 'Instagram',
      youtube: 'YouTube',
      threads: 'Threads',
      placeholder: 'handle or profile URL',
      add: 'Add',
      remove: 'Remove',
      run: 'Run scan',
      errorEmpty: 'Enter a handle.',
      errorFormat: 'That handle has invalid characters.',
      errorLength: 'That handle is too long (max 30).',
      errorDuplicate: 'You already added a handle for this platform.',
      needOne: 'Add at least one handle to continue.',
    },
    progressStep: {
      heading: 'Scanning your accounts',
      phaseQueued: 'Queued',
      phaseFetching: 'Fetching your posts',
      phaseAnalyzing: 'Analyzing your content',
      phaseReady: 'Done — your DNA is ready',
      phaseFailed: 'The scan failed',
      statePending: 'Pending',
      stateOk: 'Done',
      stateFailed: 'Failed',
      retry: 'Retry scan',
      rateLimited: "You've scanned too recently. Please try again later.",
      reauth: 'Your session expired. Please sign in again.',
      error: 'Something went wrong starting the scan. Please try again.',
      unconfigured: 'Scanning is temporarily unavailable. Please try again later.',
      stepFetchingDesc: 'Reading your last ~24 posts',
      stepAnalyzingDesc: 'Finding your niches, tone & audience',
      stepReadyTitle: 'Your DNA is ready',
      stepReadyDesc: 'Building your creator profile',
      timeHint: 'Usually under a minute',
      elapsed: 'elapsed',
      continue: 'Continue',
    },
    signOut: 'Sign out',
  },
  dna: {
    reviewHeading: 'Review your creator DNA',
    reviewIntro: 'We drafted this from your accounts. Edit anything, then publish.',
    thinNotice: 'We found limited signal. Add more handles or fill these in manually.',
    bio: 'Bio',
    niches: 'Niches',
    contentPillars: 'Content pillars',
    tone: 'Tone',
    topGeos: 'Top regions',
    topLocales: 'Top locales',
    languages: 'Languages',
    platforms: 'Platforms',
    unverified: 'Unverified',
    listHint: 'Comma-separated',
    publish: 'Publish profile',
    saving: 'Publishing…',
    invalid: 'Please fix the highlighted fields before publishing.',
    readBackHeading: 'Your profile is live',
    readBackIntro: 'Here is your published creator DNA.',
    enterStudio: 'Go to Creator Studio',
  },
  studio: {
    introHeading: 'Add your handles to begin',
    introSub: 'Usually takes 60–90 seconds. Do not close this tab.',
    instagram: 'Instagram',
    handlePlaceholder: 'handle',
    startScan: 'Start scan',
    scanningHeading: 'Scanning your profiles…',
    stepConnected: 'Connected to Instagram',
    stepFetched: 'Fetched 412 posts',
    stepClassified: 'Classified: 286 travel · 126 other',
    stepCities: 'Extracted 41 cities across 12 countries',
    stepPhotoScan: 'Photo scan complete · 22 landmarks identified',
    stepScoreReady: 'Engagement Score: ready',
    stepMissionsMatched: '6 missions matched',
    reportReadyHeading: 'Your Creator DNA is ready 🎉',
    lastScanned: 'Last scanned',
    postsAnalyzed: '412 posts analyzed',
    rescan: 'Rescan',
    rescanIn: 'Rescan in {days}d',
    lastScannedAgo: 'Last scanned {days}d ago',
    avgLikes: 'Avg Likes',
    avgSaves: 'Avg Saves',
    er: 'ER',
    travel: 'Travel',
    commission: 'commission',
    scoreBreakdownToggle: 'How is my score calculated?',
    scoreBreakdownReach: 'Reach',
    scoreBreakdownEr: 'Engagement rate',
    scoreBreakdownTravel: 'Travel content focus',
    scoreBreakdownDiversity: 'Country diversity',
    scoreBreakdownRecency: 'Recent travel activity',
    scoreBreakdownReachTip: 'Based on your total followers across platforms',
    scoreBreakdownErTip: 'Saves weighted 3× — they signal strong intent',
    scoreBreakdownTravelTip: 'Percentage of recent posts classified as travel',
    scoreBreakdownDiversityTip: 'More countries = broader merchant reach (capped at 10)',
    scoreBreakdownRecencyTip: 'Are you still actively posting travel content?',
    scoreBreakdownPts: '{val} / {max} pts',
    scoreBreakdownTotal: 'Total: {total} pts → score {score}',
    engagementOverTime: 'Engagement over time',
    yourAudience: 'Your audience',
    audienceOther: 'Other',
    whatYouCreate: 'What you create',
    placesCovered: "Places you've covered",
    placesCoveredSub: '{countries} countries · {cities} cities — extracted from your posts',
    topVenues: 'Top venues',
    bestTravelPosts: 'Your best travel posts',
    rankedByEngagement: 'Ranked by engagement',
    knownFor: "What you're known for",
    matchedForYou: 'Matched for you · 6 NEW',
    reachToUnlock: 'Reach {tier} to unlock',
    viewAllMissions: 'View all 6 missions',
    publishProfile: 'Publish my profile →',
    shareDnaCard: 'Share DNA card',
    shareDialogTitle: 'Share your DNA card',
    shareCopyLink: 'Copy link',
    shareCopied: 'Copied',
    deltaUnchanged: 'Unchanged',
    deltaSinceLastScan: '{delta} since last scan',
    scanHint: 'We scan your public posts to build your DNA.',
    dnaCoreHeading: 'Your Creator DNA',
    dnaBio: 'Bio',
    dnaNiches: 'Niches',
    dnaPillars: 'Content pillars',
    dnaTone: 'Tone',
    dnaAudienceGeos: 'Top regions',
    dnaLocales: 'Top locales',
    dnaLanguages: 'Languages',
    dnaPlatforms: 'Platforms',
    sampleBadge: 'Sample',
    sampleNote: 'The numbers below are sample data — your real metrics arrive after your first full scan.',
    demoBanner: 'Sample report — sign up and scan to see your own Creator DNA.',
    noDnaHeading: 'Build your Creator DNA',
    noDnaBody: 'Run a scan to generate your real creator DNA, then come back to see your Studio report.',
    noDnaCta: 'Start your scan',
  },
  creatorProfile: {
    metaTitle: '{name} (@{handle}) — Travel Creator · DNA {score} | KINNSO',
    metaDescription: '{category} travel creator based in {city}. {countries} countries · {guides} Guides. DNA Score {score}, {tier} tier.',
    notFoundTitle: 'Creator not found · KINNSO',
    follow: 'Follow',
    following: 'Following',
    statGuides: 'Guides',
    statCountries: 'Countries',
    statCities: 'Cities',
    statReach90d: 'Reach 90d',
    statDrivenGmv: 'Driven GMV',
    engagementBandSummary: 'ER {er}% · Avg 3.4k likes · 980 saves',
    notConnected: 'Not connected',
    followers: 'followers',
    avgEng: 'Avg eng.',
    travelPct: '{pct}% travel',
    destinationsCovered: 'Destinations covered',
    destinationsCoveredSub: '{countries} countries · {cities} cities — extracted from public posts',
    topPlacesCovered: 'Top places covered',
    dnaScore6mo: 'DNA score · 6 months',
    contentMix: 'Content mix',
    topTags: 'Top tags',
    latestGuides: 'Latest Guides',
    viewAllGuides: 'View all guides →',
    recentPosts: 'Recent posts',
    tabAll: 'All',
    tabInstagram: 'Instagram',
    tabThreads: 'Threads',
    tabYoutube: 'YouTube',
    cityPostsHeading: 'Posts from this city',
    cityPlacesHeading: 'Places in this city',
    cityNoPosts: 'No posts yet.',
    cityFirstVisited: 'First visited',
    cityLastVisited: 'Last visited',
    cityPosts: 'Posts',
    cityAvgEng: 'Avg eng.',
    cityTotalEngagement: '{count} total engagement',
    brandWorkWith: 'Work with {name}',
    brandTierLine: '{payout} · {commission} affiliate commission · {tier} tier',
    brandReachLine: '{reach} reach · {countries} countries · DNA {score}',
    brandSendBrief: 'Send a brief →',
    brandSaveToList: 'Save to list',
    brandSignInToContact: 'Sign in as merchant to contact',
    nichesHeading: 'Niches',
    pillarsHeading: 'Content pillars',
    toneHeading: 'Tone',
    audienceRegionsLabel: 'Top regions',
    audienceLocalesLabel: 'Audience locales',
    languagesHeading: 'Languages',
    platformsHeading: 'Platforms',
    verifiedLabel: 'Verified',
    guidesHeading: 'Published guides',
    guidesEmpty: 'No published guides yet.',
  },
  merchants: {
    heading: 'Find the right creator',
    sub: 'Ranked by match score to your business profile. Updated daily.',
    yourProfile: 'Your profile',
    searchPlaceholder: 'Search by name, city, or tag…',
    filter: 'Filter',
    tabRecommended: 'Recommended',
    tabSaved: 'Saved',
    tabWorking: 'Working with',
    emptyRecommended: 'No creators match your filters.',
    emptySaved: "You haven't saved any creators yet.",
    emptyWorking: 'No active collaborations.',
    addPrivateNote: 'Add a private note…',
    statusInProgress: 'in progress',
    statusDelivered: 'delivered',
    statusCompleted: 'completed',
    matchLabel: 'match',
    reasonCovers: 'Covers {city}',
    reasonCreator: '{category} creator',
    reasonTier: '{tier} tier',
    reasonAudience: '{pct}% {country} audience',
    cardDna: 'DNA',
    cardEr: 'ER',
    cardGuides: '{count} Guides',
    cardReach: '{count}k Reach',
    cardCountries: '{count} Countries',
    viewProfile: 'View profile',
    sendBrief: 'Send brief →',
    save: 'Save',
    saved: 'Saved',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    detailTopLocations: 'Top locations',
    detailContentSample: 'Content sample',
    detailEngagementTrend: 'Engagement trend',
    filterTitle: 'Filter creators',
    filterLocation: 'Location',
    filterScore: 'Engagement score',
    filterMinEr: 'Minimum ER %',
    filterTier: 'Tier',
    filterCategory: 'Content category',
    filterAudience: 'Primary audience',
    filterPlatforms: 'Platforms',
    filterMinFollowers: 'Minimum followers',
    filterActivity: 'Activity',
    followersAny: 'Any',
    activity7: 'Posted in last 7 days',
    activity30: 'Last 30 days',
    activity90: 'Last 90 days',
    activityAny: 'Any time',
    clearAll: 'Clear all',
    applyFilters: 'Apply filters',
    close: 'Close',
    searchesLeft: '{count} searches left',
    invitesLeft: '{count} invites left',
    upgradeToGrowth: 'Upgrade to Growth',
    upgradeBlurb: 'Unlock advanced filters, unlimited search, and creator invites with Growth.',
    upgradeCta: 'Upgrade',
    lockedFilter: 'Available on Growth',
    inviteDisabled: 'No invites left this month',
    resultsCapped: 'Showing top results. Upgrade to Growth to see all matches.',
  },
  missions: {
    missionQueue: 'Mission queue', backToQueue: 'Back to queue',
    joinMission: 'Join mission',
    applyMission: 'Apply mission',
    generatePartnerLink: 'Generate partner link',
    approve: 'Approve',
    reject: 'Reject',
    requestRevision: 'Request revision',
    submitMilestone: 'Submit milestone',
    participants: 'Participants',
    pendingApplications: 'Pending applications',
    settlement: 'Settlement',
    postHeading: 'Post a mission',
    postSub: 'Create coupon, hybrid, or paid creator work in one flow.',
    typeCoupon: 'Coupon affiliate',
    typeHybrid: 'Affiliate + paid mission',
    typePaid: 'Paid mission only',
    typeReceiptCashback: 'Receipt cashback',
    title: 'Mission title',
    summary: 'Mission summary',
    couponCode: 'Coupon code',
    couponUrl: 'Coupon URL',
    affiliateCommissionRate: 'Affiliate commission rate',
    kinnsoCommissionRate: 'KINNSO commission rate',
    creatorCommissionRate: 'Creator commission rate',
    paidFeeAmount: 'Paid mission fee',
    paidFeeCurrency: 'Currency',
    receiptCashbackAmount: 'Cashback per receipt',
    maxReceiptsPerCreator: 'Max receipts per creator (optional)',
    milestoneTitle: 'Milestone title',
    milestoneDescription: 'Milestone description',
    saveDraft: 'Save draft',
    publish: 'Publish',
    openMission: 'Open mission',
    targetedMission: 'Targeted invite',
    validationError: 'Check the highlighted fields and try again.',
    myMissions: 'My missions',
    availableMissions: 'Available missions',
    milestoneProgress: 'milestones submitted',
    myMissionsEmpty: "You haven't joined any missions yet.",
    availableEmpty: 'No missions available right now. Check back soon.',
    viewDetails: 'View details',
    postSuccessTitle: 'Mission posted',
    postSuccessBody: 'Your mission is live. Manage applications and submissions from the mission page.',
    viewMission: 'View mission',
    missionsEmptyTitle: 'No missions yet',
    missionsEmptyBody: 'Post your first mission to start working with creators.',
    postMissionCta: 'Post a mission',
    creatorFallback: 'Creator',
    locked: 'Tier locked',
    lockedHelp: 'Reach this tier to unlock this mission.',
    minTierLabel: 'Minimum tier',
    minTierOpen: 'Open to all',
    minTierRising: 'Rising+',
    minTierPro: 'Pro+',
    minTierElite: 'Elite+',
    invitationsTitle: 'Invitations',
    acceptInvite: 'Accept invitation',
    acceptInviteFailed: 'Could not accept this invitation. Please try again.',
    fundedBadge: 'Funded',
    briefDetailsHeading: 'Brief details (optional)',
    briefListHint: 'One item per line',
    deliverablesLabel: 'Deliverables',
    requirementsLabel: 'Requirements',
    dosLabel: "Do's",
    dontsLabel: "Don'ts",
    keyMessagesLabel: 'Key messages',
    referenceLinksLabel: 'Reference links',
    referenceLinksInvalidError: 'Each reference link must be a valid web address (starting with http:// or https://).',
    effortLabel: 'Effort',
    effortUnset: 'Not specified',
    effortLow: 'Low',
    effortMedium: 'Medium',
    effortHigh: 'High',
  },
  missionDetail: {
    back: 'Missions',
    briefHeading: 'Brief',
    milestonesHeading: 'Milestones',
    notStarted: 'Not started',
    dueLabel: 'Due',
    join: 'Join mission',
    apply: 'Apply',
    applyNoteLabel: 'Application note (optional)',
    applyNotePlaceholder: 'Tell the merchant why you are a fit',
    awaitingTitle: 'Awaiting approval',
    awaitingBody: 'The merchant is reviewing your application.',
    rejectedTitle: 'Not selected',
    rejectedBody: 'This application was not accepted.',
    couponHeading: 'Your coupon',
    couponCodeLabel: 'Code',
    partnerLinksHeading: 'Your links',
    openLink: 'Open',
    proofUrlLabel: 'Post URL',
    proofUrlPlaceholder: 'https://www.instagram.com/p/...',
    submissionNotesLabel: 'Notes (optional)',
    submissionNotesPlaceholder: 'Add context for the merchant',
    submitMilestone: 'Submit for review',
    resubmitMilestone: 'Resubmit',
    submitError: 'Submission could not be sent',
    merchantFeedbackLabel: 'Merchant feedback',
    verifying: 'Verifying…',
    verifiedSignal: 'Verified signal',
    needsReview: 'Needs review',
    couldntVerify: "Couldn’t verify",
    verificationFailed: 'Verification failed',
    retry: 'Retry',
    receiptsHeading: 'Submit a receipt',
    receiptProofUrlLabel: 'Receipt photo URL',
    receiptProofUrlPlaceholder: 'https://...',
    submitReceipt: 'Submit receipt',
    receiptCountLabel: (count, max) => `${count} of ${max} receipts submitted`,
    receiptCapReached: "You've reached the receipt limit for this mission",
    receiptSubmissionsEmpty: 'No receipts submitted yet',
    rejectionReasonLabel: 'Reason',
    receiptReasonUnreadable: 'Receipt image is unreadable',
    receiptReasonWrongVenue: 'Wrong venue',
    receiptReasonDuplicate: 'Duplicate receipt',
    receiptReasonAmountUnclear: 'Amount is unclear',
    receiptReasonOther: 'Other',
    deliverablesHeading: 'Deliverables',
    requirementsHeading: 'Requirements',
    dosHeading: "Do's",
    dontsHeading: "Don'ts",
    keyMessagesHeading: 'Key messages',
    referenceLinksHeading: 'Reference links',
    effortBadgeLabel: (level) => (level === 'low' ? 'Low effort' : level === 'medium' ? 'Medium effort' : 'High effort'),
  },
  ops: {
    settlementHeading: 'Settlement queue', backHome: 'Back to home',
    settlementSub: 'Track creator payouts and KINNSO commissions.',
    markPaid: 'Mark paid',
    statusPending: 'Pending',
    statusPaid: 'Paid',
  },
  nav: {
    linkCreators: 'Creators', linkAgent: 'AI Agent', linkMerchants: 'Merchants',
    linkArticles: 'Articles', linkFindCreators: 'Find Creators', linkMissions: 'Missions',
    linkInsights: 'Insights',
    linkExplore: 'Explore', linkDestinations: 'Destinations', linkSessions: 'Sessions', linkForCreators: 'For Creators', linkForMerchants: 'For Merchants',
    signUp: 'Sign up', ctaOpenStudio: 'Open Studio', ctaPending: 'Application pending', ctaPostMission: 'Post a Mission', ctaMyTrips: 'My Trips',
    signIn: 'Sign in', language: 'Language', menuToggle: 'Menu', skipToContent: 'Skip to content',
    merchantMenuLabel: 'Merchant menu',
  },
  footer: {
    tagline: 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo',
    colCreators: 'Creators', colMerchants: 'Merchants', colCompany: 'Company',
    colExplore: 'Explore', colTravellers: 'Travellers', lGuides: 'Guides', lDestinations: 'Destinations', lArticles: 'Articles', lSessions: 'Sessions', lTrips: 'Trips', lSaved: 'Saved',
    lApply: 'Apply', lStudio: 'Studio', lMissions: 'Missions', lEarnings: 'Earnings',
    lPostMission: 'Post a mission', lPricing: 'How it works', lContact: 'Contact', lDirectory: 'Directory',
    lAbout: 'About', lAgent: 'AI Agent', lLegal: 'Legal',
    rights: '© 2026 KINNSO. All rights reserved.',
    lForCreators: 'For Creators',
  },
  analytics: {
    title: 'Help improve KINNSO',
    description: 'Allow privacy-preserving measurement to help us improve traveller journeys.',
    accept: 'Accept measurement',
    decline: 'Decline',
    changePreference: 'Change measurement preference',
  },
  home: {
    heroEyebrow: 'The travel creator marketplace',
    heroTitle: 'Real creators. Real places. Book the trip you actually want.',
    heroSubtitle: 'Discover guides from trusted travel creators. Plan with AI. Book in one place.',
    heroPrimaryCta: 'Start Planning',
    heroSecondaryCta: 'Browse Creators',
    statCreators: 'active creators', statGuides: 'published guides', statDestinations: 'destinations covered', statCompletedBookings: 'completed bookings', statUpcomingSessions: 'live sessions coming up', statGrowingFast: 'Growing fast',
    roleCreator: 'Creator', roleTraveller: 'Traveller', roleMerchant: 'Merchant',
    testimonialsHeading: 'What people say about KINNSO',
    howEyebrow: 'How it works',
    howHeading: 'One platform, three ways in.',
    howSub: 'Travel it, create it, or host it — KINNSO turns real local knowledge into real trips.',
    howTabTravellers: 'For Travellers', howTabCreators: 'For Creators', howTabMerchants: 'For Merchants',
    howT1Title: 'Find your people',
    howT1Desc: 'Browse guides by creators who actually live and travel the places you want to go.',
    howT2Title: 'Save the real spots',
    howT2Desc: 'Every guide is a route of real cafés, streets, and stays — not top-ten filler.',
    howT3TitleLive: 'Plan and book in one place',
    howT3TitleWaitlist: 'Plan now, book when it opens',
    howT3DescLive: 'Shape the trip with AI help, then book your picks without leaving KINNSO.',
    howT3DescWaitlist: 'Booking is not live yet. Join the waitlist and we’ll notify you when it opens.',
    howC1Title: 'Scan your profile',
    howC1Desc: 'Connect your socials and KINNSO maps the cities you genuinely know.',
    howC2Title: 'Publish your guides',
    howC2Desc: 'Turn your routes into guides travellers can follow, save, and book from.',
    howC3Title: 'Earn from your knowledge',
    howC3Desc: 'Brand missions, affiliate offers, and booking commissions — paid honestly.',
    howM1Title: 'Post a mission',
    howM1Desc: 'Brief vetted creators who already cover your city and your kind of customer.',
    howM2Title: 'Get authentic coverage',
    howM2Desc: 'Creators fold your experience into guides that travellers actually trust.',
    howM3Title: 'See what it drives',
    howM3Desc: 'Track creator coverage today — and attributed bookings once direct booking opens.',
    featuredEyebrow: 'Featured guides',
    featuredHeading: 'Guides worth packing.',
    featuredSub: 'The latest city guides published by KINNSO creators.',
    featuredSeeAll: 'See all guides',
    featuredEmpty: 'No published guides yet — the first ones are on their way.',
    agentLiveEyebrow: 'KINNSO AI Agent',
    agentLiveTitle: 'An agent that plans like a local.',
    agentLiveBodyBookingLive: 'Tell it where you are going and how you like to travel — it searches real creator guides, articles, and bookable experiences, live.',
    agentLiveBodyBookingWaitlist: 'Tell it where you are going and how you like to travel — it searches real creator guides, articles, and experiences to shape a plan you can save while booking opens soon.',
    agentLiveCta: 'Try the AI Agent',
    agentLiveNote: 'Live now — ask it to plan your next trip.',
    agentWaitlistEyebrow: 'KINNSO AI Agent',
    agentWaitlistTitle: 'Be first to plan with the KINNSO Agent.',
    agentWaitlistBody: 'Join the list to hear when our travel agent, grounded in real creator guides and articles, is ready for you.',
    agentWaitlistNote: 'We will only email you about Agent availability.',
    articlesEyebrow: 'From the journal',
    articlesHeading: 'Stories from the ground.',
    articlesSeeAll: 'Read all articles',
    sessionsEyebrow: 'Community Sessions',
    sessionsHeading: 'Live from the places you are going.',
    sessionsSub: 'Small live briefings hosted by the creators behind our guides.',
    merchantEyebrow: 'For merchants',
    merchantHeading: 'Put your experience inside the guides travellers trust.',
    merchantBullet1: 'Work with vetted creators who already cover your city.',
    merchantBullet2: 'Reach travellers while they plan — inside real guides, not ad slots.',
    merchantBullet3: 'Follow every collaboration in one transparent pipeline.',
    merchantCta: 'Explore KINNSO for merchants',
    creatorEyebrow: 'For creators',
    creatorHeading: 'Your city knowledge is worth more than exposure.',
    creatorBullet1: 'Publish guides that keep working long after you post them.',
    creatorBullet2: 'Take on missions from merchants who value your route.',
    creatorBullet3: 'Earn honestly — real work, real payouts, no fabricated metrics.',
    creatorCta: 'Apply as a creator',
  },
  about: {
    eyebrow: 'About KINNSO',
    title: 'A creator-first travel & lifestyle community.',
    intro: 'KINNSO helps travel and lifestyle creators turn real expertise into published guides, brand missions, and affiliate earnings — with the tools and the audience to grow.',
    missionHeading: 'What we do',
    missionBody: 'We connect creators with merchants and travellers across Hong Kong, Taipei, Tokyo and beyond. Creators publish guides, join brand missions, and earn through affiliate offers; merchants reach trusted local voices.',
    creatorsHeading: 'For creators',
    creatorsBody: 'Build a public profile, publish guides, and join real missions and affiliate offers — paid honestly, with no fabricated metrics.',
    merchantsHeading: 'For merchants',
    merchantsBody: 'Post a mission, work with vetted creators, and track participation through a transparent pipeline.',
    ctaHeading: 'Want to create with KINNSO?',
    ctaBody: 'Apply as a creator and start building your profile today.',
    ctaButton: 'Apply as a creator',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Get in touch.',
    intro: 'Questions, partnerships, or press? Email us and we’ll get back to you.',
    emailLabel: 'Email',
    emailCta: 'Email us',
    responseNote: 'We typically reply within a few business days.',
  },
  comingSoon: {
    heading: 'Coming soon',
    body: 'This part of KINNSO is on the way. Check back shortly.',
    back: 'Back to home',
  },
  creatorTerms: {
    eyebrow: 'Creator terms',
    title: 'Creator Terms (MVP draft)',
    draftNotice: 'This is an early draft of our creator terms for KINNSO’s soft launch. It is written in plain language, is not a final legal contract, and may change. We’ll notify creators of material updates.',
    englishNotice: 'These terms are currently provided in English only.',
    back: 'Back to home',
  },
  agent: {
    eyebrow: 'KINNSO AI Agent',
    title: 'Your travel agent, grounded in real creator guides',
    bodyBookingLive: 'Tell it where you\'re going and how you like to travel — it searches real published guides, articles, and bookable experiences to help you plan and book.',
    bodyBookingWaitlist: 'Tell it where you\'re going and how you like to travel — it searches real published guides, articles, and experiences to help you plan and save recommendations while booking opens soon.',
    waitlistTitle: 'AI travel planning is opening soon',
    waitlistBody: 'Join the list and we will let you know when the KINNSO Agent is ready to plan with real creator guides and articles.',
    pointsHeading: 'What the agent does',
    point1Title: 'Grounded in real guides', point1Body: 'Every suggestion traces back to a published creator guide, article, or published experience — no invented spots.',
    point2Title: 'Plans around you', point2Body: 'Tell it your destination, dates and pace; it drafts an outline you can actually follow.',
    point3TitleBookingLive: 'Built for booking', point3BodyBookingLive: 'When it surfaces a bookable experience, you can book it right from the conversation.',
    point3TitleBookingWaitlist: 'Save now, book later', point3BodyBookingWaitlist: 'Save recommended experiences from the conversation; direct booking opens soon.',
    errorGeneric: 'Something went wrong — please try again.',
    inputPlaceholder: 'Ask about a destination, dates, or style of trip...',
    send: 'Send',
    toolWorking: 'Searching...',
    ratingUpLabel: 'This response was helpful',
    ratingDownLabel: 'This response was not helpful',
    unconfiguredTitle: 'Agent temporarily unavailable',
    unconfiguredBody: 'The travel agent is temporarily offline — try again shortly, or explore guides and articles directly.',
  },
  forCreators: {
    heroEyebrow: 'For Creators',
    heroTitle: 'Turn your travel taste into income',
    heroSub: 'Publish the guides you already give friends, run real brand missions, and earn from the places you genuinely recommend.',
    heroCtaPrimary: 'Apply as a creator', heroCtaSecondary: 'See creator guides',
    howEyebrow: 'How it works', howHeading: 'Three steps to your first payout',
    step1Title: 'Publish guides', step1Body: 'Turn your favourite city into a guide travellers actually use — your voice, your picks.',
    step2Title: 'Run missions', step2Body: 'Take on briefs from vetted brands that fit your niche. No spray-and-pray sponsorships.',
    step3Title: 'Earn and grow', step3Body: 'Get paid per mission, earn affiliate commissions, and level up to unlock better offers.',
    whyHeading: 'Why creators choose KINNSO',
    why1: 'You keep your voice — merchants brief you, they don’t script you.',
    why2: 'Transparent payouts with a real ledger, not a black box.',
    why3Waitlist: 'Your guides keep earning after the trip ends — bookings are coming, and your recommendations power them.', why3Live: 'Bookings on your recommendations pay you commission.',
    testimonialsHeading: 'Creators on KINNSO',
    ctaTitle: 'Your next trip could pay for itself',
    ctaBody: 'Apply in minutes. Publish your first guide this week.',
    ctaButton: 'Apply as a creator',
  },
  forMerchants: {
    heroEyebrow: 'For Merchants',
    heroTitle: 'Reach travellers through creators they trust',
    heroSub: 'Brief vetted travel creators, pay on published results, and turn their genuine recommendations into your next customers.',
    heroCtaPrimary: 'Post a mission', heroCtaSecondary: 'Talk to us',
    howEyebrow: 'How it works', howHeading: 'Launch a campaign in three steps',
    step1Title: 'Post a brief', step1Body: 'Describe the mission, target cities and payout — it takes minutes.',
    step2Title: 'Creators apply', step2Body: 'Vetted creators who fit your brand pick up the brief and produce real content.',
    step3Title: 'Pay on results', step3Body: 'Approve published work and pay for outcomes — with attribution you can verify.',
    whyHeading: 'Why merchants choose KINNSO',
    why1: 'Creators are vetted with real audience data, not follower counts.',
    why2: 'You approve work before you pay — no surprises.',
    why3Waitlist: 'Direct booking is coming: creator recommendations will link straight to your bookable inventory.', why3Live: 'Direct booking is live: recommendations link straight to your bookable inventory.',
    testimonialsHeading: 'Merchants on KINNSO',
    ctaTitle: 'Your next campaign starts with a brief',
    ctaBody: 'Post your first mission today — our team reviews every brief within 48 hours.',
    ctaButton: 'Post a mission',
  },
  studioHome: {
    pill: 'Creator Studio',
    heading: 'Your Studio',
    subtitle: 'Everything you need to grow — scan your DNA, take missions, and track earnings.',
    liveBadge: 'Live', soonBadge: 'Soon', open: 'Open',
    scanTitle: 'AI Scan', scanDesc: 'Your creator DNA, score and tier.',
    missionsTitle: 'Missions', missionsDesc: 'Briefs you can join and submit.',
    earningsTitle: 'Earnings', earningsDesc: 'Payouts, commission and history.',
    offersTitle: 'Offers', offersDesc: 'Affiliate offers to promote.',
    inboxTitle: 'Inbox', inboxDesc: 'Messages from merchants.',
    guidesTitle: 'Guides', guidesDesc: 'Draft and publish your guides.',
    tierTitle: 'Tier', tierDesc: 'Your contribution points and tier.',
    copilotTitle: 'Copilot',
    copilotDesc: 'Chat with your AI copilot for ideas, captions, and content.',
    perksTitle: 'Perks', perksDesc: 'Partner deals unlocked by your tier.',
    insightsTitle: 'Insights', insightsDesc: 'Your real activity — points, guides, and missions.',
    sessionsTitle: 'Sessions', sessionsDesc: 'Schedule and host live community sessions.',
    unreadBadgeLabel: '{count} unread',
  },
  notifications: {
    heading: 'Inbox',
    subtitle: 'Updates on your submissions, settlements, and payouts.',
    empty: "You're all caught up.",
    'submission.approved': 'Your submission for {mission_title} was approved',
    'submission.rejected': 'Your submission for {mission_title} was rejected',
    'submission.revision_requested': 'Revisions requested for your submission on {mission_title}',
    'settlement.created': 'A new settlement was recorded for {mission_title}',
    'payout_batch.created': 'A payout of {amount} {currency} has been promised to you',
    'payout_batch.paid': 'Your payout of {amount} {currency} has been paid',
    'payout_batch.cancelled': 'A pending payout of {amount} {currency} was cancelled',
  },
  studioDashboard: {
    greeting: 'Welcome back, {name}',
    statusActive: 'Active creator',
    dnaSnapshotTitle: 'Your Creator DNA',
    dnaLastScanned: 'last scanned {date}',
    dnaNiches: 'Niches',
    dnaPillars: 'Content pillars',
    viewFullReport: 'View full DNA report →',
    checklistTitle: 'Get discovered',
    checklistProgress: '{done} / {total}',
    itemDnaReadyTitle: 'Your Creator DNA is ready',
    itemDnaReadyCta: 'View report',
    itemWriteGuideTitle: 'Write your first guide',
    itemWriteGuideCta: 'Write a guide',
    itemConnectTitle: 'Connect your platforms',
    itemConnectGap: '{done}/{total} · add {missing}',
    itemConnectCta: 'Add',
    itemConnectAllDone: 'All platforms connected',
    itemFreshTitle: 'Keep your DNA fresh',
    itemFreshScanned: 'scanned {days}d ago',
    itemFreshScannedToday: 'scanned today',
    rescanCta: 'Rescan',
    opportunitiesTitle: 'Opportunities',
    opportunitiesEmpty: "No brand missions matched yet — we’ll notify you. Finish your checklist to get discovered.",
    opportunitiesBrowse: 'Browse all',
    earningsTitle: 'Earnings',
    earningsEmpty: 'Start earning by joining a mission.',
    earningsView: 'View earnings',
    quickLinksTitle: 'Quick links',
    addHandleTitle: 'Add a platform',
    addHandlePlaceholder: 'handle or profile link',
    addHandleSave: 'Add',
    addHandleCancel: 'Cancel',
    addHandleErrorEmpty: 'Enter a handle.',
    addHandleErrorFormat: 'That handle has invalid characters.',
    addHandleErrorLength: 'That handle is too long (max 30).',
    addHandleSaved: 'Added — rescan to include it in your DNA.',
    nextActionHeading: 'Your next step',
    nextActionAwaitScan: 'Your scan is running. We will have your DNA shortly.',
    nextActionStartEarning: 'Promote an offer to your audience and earn commission on every booking it drives.',
    nextActionPublishGuide: 'Publish your first guide — that is what lists you in the public creator directory.',
    nextActionConnectPlatforms: 'Connect your remaining platforms so more of your audience can be verified.',
    nextActionRefreshDna: 'Your DNA is getting old. Rescan to keep it accurate.',
    nextActionNothingOpen: 'Nothing needs your attention right now.',
    nextActionCta: 'Open',
    directoryListed: 'You appear in the public creator directory.',
    directoryNeedsGuide: 'Publish a guide to appear in the public creator directory — drafts do not count.',
    directoryNotListed: 'Finish the steps above to appear in the public creator directory.',
  },
  studioGuides: {
    listPill: 'Studio',
    listHeading: 'My guides',
    listSubtitle: 'Draft, publish, and manage the travel guides you share on KINNSO.',
    newButton: 'New guide',
    emptyTitle: 'No guides yet',
    emptyBody: 'Publish your first guide and it will appear in Explore.',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this guide? This cannot be undone.',
    formNewHeading: 'New guide',
    formEditHeading: 'Edit guide',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Shibuya Coffee Crawl: 7 Quiet Roasters',
    cityLabel: 'City',
    cityPlaceholder: 'e.g. Tokyo',
    coverLabel: 'Cover image URL',
    coverPlaceholder: 'https://…',
    coverPreviewAlt: 'Cover preview',
    summaryLabel: 'Summary',
    summaryPlaceholder: 'A short description of what this guide covers.',
    saveDraft: 'Save draft',
    publish: 'Publish',
    saving: 'Saving…',
    backToGuides: 'Back to my guides',
    errorTitleRequired: 'Add a title.',
    errorSummaryRequired: 'Add a summary.',
    errorCityRequired: 'Add a city.',
    errorCoverRequired: 'Add a cover image URL.',
    errorCoverInvalid: 'Enter a valid image URL (http or https).',
    errorGeneric: 'Something went wrong. Please try again.',
  },
  studioSessions: {
    listPill: 'Sessions',
    listHeading: 'Your sessions',
    listSubtitle: 'Schedule and manage your community sessions.',
    newButton: 'New session',
    emptyTitle: 'No sessions yet',
    emptyBody: 'Schedule your first session to start meeting your community live.',
    statusScheduled: 'Scheduled',
    statusLive: 'Live',
    statusEnded: 'Ended',
    statusCancelled: 'Cancelled',
    edit: 'Edit',
    formNewHeading: 'New session',
    formEditHeading: 'Edit session',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    typeLabel: 'Type',
    startsAtLabel: 'Starts at',
    durationLabel: 'Duration (minutes)',
    embedUrlLabel: 'Live embed URL (YouTube)',
    embedUrlPlaceholder: 'https://youtube.com/watch?v=…',
    replayUrlLabel: 'Replay URL (YouTube)',
    replayUrlPlaceholder: 'https://youtube.com/watch?v=…',
    destinationTagsLabel: 'Destinations (comma-separated)',
    destinationTagsPlaceholder: 'Tokyo, Japan',
    saveButton: 'Save',
    typeDestinationBriefing: 'Destination briefing',
    typeAskACreator: 'Ask a creator',
    typeMerchantSpotlight: 'Merchant spotlight',
    typeNewCreatorIntro: 'New creator intro',
    hostPickerLabel: 'Host',
    hostPickerPlaceholder: 'Select a host…',
    hostRequiredError: 'Select a host before creating this session',
  },
  explore: {
    pill: 'Explore',
    heading: 'Travel Guides from real creators',
    subtitle: 'Discover hand-picked spots, saved by travellers like you.',
    gridHeading: 'All guides',
    savesLabel: 'saves',
    emptyNote: 'More guides are added every week.',
    destinationFilterLabel: 'Destinations', allDestinations: 'All destinations',
    searchLabel: 'Search guides', searchPlaceholder: 'Search guides, creators or cities',
    sortLabel: 'Sort by', newest: 'Newest', mostSaved: 'Most saved',
    filters: 'Filters', filtersDescription: 'Choose one destination and a sort order.', activeFilters: 'Active filters',
    resultsLabel: '{count} guides', showResults: 'Show {count} results',
    emptyFilteredTitle: 'No guides match these filters', emptyFilteredBody: 'Try another search or reset the filters.',
    resetFilters: 'Reset filters', loadMore: 'Load more', closeFilters: 'Close filters',
  },
  feed: {
    pill: 'Feed',
    heading: 'What travellers are saving now',
    subtitle: 'A live look at the guides and spots trending across KINNSO.',
    savesLabel: 'saves',
    empty: 'No guides yet. Check back soon for new travel guides.',
  },
  creatorsLanding: {
    heroPill: 'Creator Program',
    heroTitle: 'Get paid to share the trips you already take.',
    heroSubtitle: 'KINNSO proves your travel authority and matches you with paid missions from real merchants.',
    applyCta: 'Apply as Creator',
    howHeading: 'How the program works', howSub: 'From handle to first payout in days.',
    step1Title: 'Connect socials', step1Desc: 'Add your IG / Threads / TikTok handles.',
    step2Title: 'AI scans you', step2Desc: 'We classify your travel posts and score you.',
    step3Title: 'Get qualified', step3Desc: 'Reach a Tier and unlock the Studio.',
    step4Title: 'Earn missions', step4Desc: 'Publish Guides and get paid.',
    featuredHeading: 'Creators already earning', featuredSub: 'Real handles, scored by our AI Agent.',
    ctaTitle: 'Ready to apply?', ctaDesc: 'It takes two minutes and a couple of handles.', ctaButton: 'Start your application',
    directoryHeading: 'Browse creators',
    directorySub: "Real KINNSO creators and the city guides they've published.",
    directoryEmpty: 'No creators have published a profile yet. Check back soon.',
    viewProfile: 'View profile',
    guideCount: '{count} Guides',
  },
  merchantsDirectory: {
    heading: 'Merchant directory',
    subtitle: 'The founding merchants building on KINNSO — more join every week.',
    empty: 'No merchants yet — check back soon.',
    viewProfile: 'View profile',
    newHereNote: 'Run a travel or lifestyle business? Reach travellers through creators they trust.',
    newHereCta: 'Why KINNSO for merchants',
  },
  merchantProfile: {
    enquiryCta: 'Contact this merchant',
    featuredGuidesHeading: 'Featured in guides',
    websiteLabel: 'Website',
    experiencesHeading: 'Experiences',
    experiencesEmpty: 'No experiences published yet.',
    workWithCreatorsNote: 'Are you a creator? See how you can work with merchants like this one.',
    workWithCreatorsCta: 'For creators',
  },
  experiencePublic: {
    hostedBy: 'Hosted by',
    priceLabel: 'From',
    durationLabel: 'Duration',
    minutesSuffix: 'min',
    backToMerchant: 'Back to',
  },
  booking: {
    selectDateLabel: 'Choose a date',
    noAvailability: 'No upcoming dates yet — check back soon.',
    qtyLabel: 'Travelers',
    spotsLeftLabel: 'spots left',
    soldOutLabel: 'Sold out',
    guestEmailLabel: 'Email',
    guestEmailPlaceholder: 'traveller@email.test',
    guestEmailHint: "We'll send your booking confirmation here.",
    opensSoonCta: 'Booking opens soon',
    submitCta: 'Book now',
    submittingCta: 'Redirecting to secure checkout…',
    invalidEmail: 'Enter a valid email address',
    invalidQty: 'Choose how many travelers',
    genericError: 'Something went wrong. Please try again.',
    rateLimitedError: 'Too many attempts. Please try again in a few minutes.',
    confirmedTitle: "You're booked!",
    confirmedBody: "We've sent a confirmation to your email.",
    completedTitle: 'Hope you had a great time!',
    completedBody: 'You can book this experience again anytime.',
    cancelledTitle: 'This booking was cancelled',
    cancelledBody: 'No payment was taken for this booking.',
    refundedTitle: 'This booking was refunded',
    refundedBody: 'You should see the refund on your original payment method within 5–10 business days.',
    pendingTitle: 'Confirming your payment…',
    pendingBody: 'This can take a few seconds. Refresh to check again.',
    refreshCta: 'Refresh',
    notFoundTitle: "We couldn't find that booking",
    notFoundBody: 'The link may be incomplete or out of date.',
    summaryQtyLabel: 'Travelers',
    summaryTotalLabel: 'Total paid',
  },
  studioOffers: {
    heading: 'Affiliate offers',
    subtitle: 'Join travel affiliate programs and generate tracked partner links.',
    empty: 'No affiliate offers are available right now.',
    join: 'Join offer',
    generateLink: 'Generate partner link',
    copy: 'Copy',
    copied: 'Copied',
    category: 'Category',
    commission: 'Commission',
    viewProgram: 'View program',
    setupNotConfigured: 'Partner-link generation is being set up — check back soon.',
    trackingId: 'Tracking ID',
  },
  studioEarnings: {
    heading: 'Earnings',
    subtitle: 'Track payouts from missions, bookings and affiliate commissions.',
    paid: 'Paid',
    pending: 'Pending',
    colMission: 'Mission',
    colType: 'Type',
    colAmount: 'Amount',
    colStatus: 'Status',
    missionsHeading: 'Mission settlements',
    missionsEmpty: 'No mission settlements yet.',
    bookingsHeading: 'Booking commission',
    bookingsEmpty: 'No booking commission yet.',
    colExperience: 'Experience',
    trackedHeading: 'Tracked, not yet payable',
    trackedNote: 'These affiliate conversions are recorded but not settled. They are not included in your totals.',
    trackedEmpty: 'No tracked conversions.',
    colGross: 'Gross',
    colState: 'State',
    payoutBatchesHeading: 'Payout batches',
    payoutBatchesEmpty: 'No payout batches yet.',
    colTarget: 'Target date',
    batchCancelled: 'Cancelled',
  },
  tier: {
    cardTitle: 'Your tier',
    toNext: '{points} pts to {tier}',
    maxed: 'Top tier reached',
    earnHeading: 'Ways to earn points',
    earnGuide: 'Publish a guide',
    earnMission: 'Complete a verified mission',
    earnScan: 'Complete your DNA scan',
    viewAll: 'Tier details',
    pageHeading: 'Tier & contribution',
    pageSubtitle: 'Earn points from real activity to climb tiers.',
    currentLabel: 'Current tier',
    allTiersHeading: 'All tiers',
    historyHeading: 'Points history',
    historyEmpty: 'No points yet — publish a guide or complete a mission to get started.',
    eventGuide: 'Guide published',
    eventMission: 'Mission verified',
    eventScan: 'DNA scan completed',
    pointsSuffix: 'pts',
    unlocksHeading: 'What you unlock',
    unlocksMissions: 'missions need this tier',
    unlocksHelp: 'Climb tiers to join exclusive missions.',
    nextUnlocksHeading: 'What your next tier unlocks',
    nextUnlocksIntro: '{points} pts to {tier} unlocks:',
    nextUnlocksNone: 'No perks are gated at {tier} right now.',
    nextUnlocksMaxed: '{tier} is the top tier — nothing is gated above it.',
  },
  copilot: {
    title: 'Creator Copilot',
    subtitle: 'Your AI copilot, tuned to your Creator DNA. Ask for ideas, captions, or a posting plan.',
    inputPlaceholder: 'Ask your copilot anything…',
    send: 'Send',
    newChat: 'New chat',
    emptyTitle: 'Start a conversation',
    emptyBody: 'Try: "Give me 5 reel ideas for my next trip" or "Draft a caption for a Kyoto food guide".',
    limitTitle: "You've hit today's limit",
    limitBody: "You've used all of today's Copilot messages.",
    limitUpsell: 'Level up your tier to raise your daily limit.',
    toolWorking: 'Working on it…',
    errorGeneric: 'Something went wrong. Please try again.',
    unconfiguredTitle: "Copilot isn't switched on yet",
    unconfiguredBody: 'The Copilot will be available here shortly. Check back soon.',
    disclaimer: 'AI-generated — review before you publish.',
  },
  admin: {
    navDashboard: 'Dashboard', navPerks: 'Perks', navUsers: 'Users', navCreators: 'Creators', navMerchants: 'Merchants', navTeam: 'Team', navMissions: 'Missions', navTestimonials: 'Testimonials', navBookings: 'Bookings', navSessions: 'Sessions', navEnquiries: 'Enquiries', navAnalytics: 'Analytics',
    dashboardTitle: 'Admin', dashboardSubtitle: 'Manage perks, users, and platform content.',
    statCreators: 'Creators', statMerchants: 'Merchants', statOps: 'Ops members',
    statPerksActive: 'Active perks', statPerksTotal: 'Total perks', statRedemptions: 'Redemptions',
    analyticsTitle: 'Analytics', analyticsSubtitle: 'Observe product funnel performance across locales and entity types.', analyticsWindow: 'Window', analyticsWindow24h: 'Last 24 hours', analyticsWindow7d: 'Last 7 days', analyticsFilters: 'Filters', analyticsAll: 'All',
    analyticsUtcNote: 'Times are shown in UTC.', analyticsRetentionNote: 'Analytics data is retained for 8 days.', analyticsAttributionNote: 'Attribution uses a 7-day window.', analyticsSampleFloorNote: 'Rates are withheld when the denominator is below 10.', analyticsHealthTitle: 'Measurement health', analyticsHealthStatus: 'Status', analyticsHealthAvailable: 'Available', analyticsHealthNoMatching: 'No matching rows', analyticsHealthObservedZero: 'Observed zero', analyticsHealthInsufficient: 'Insufficient sample', analyticsHealthUnavailable: 'Unavailable', analyticsHealthReturnedRows: 'Rows returned', analyticsHealthOkRows: 'Interpretable rows', analyticsHealthInsufficientRows: 'Withheld rows', analyticsHealthObservedZeroRows: 'Observed-zero rows', analyticsTableCaption: 'Analytics funnel metrics', analyticsMetric: 'Metric',
    analyticsLocale: 'Locale', analyticsEntityType: 'Entity type', analyticsBookingState: 'Booking state', analyticsNumerator: 'Numerator', analyticsDenominator: 'Denominator', analyticsRate: 'Rate', analyticsStatus: 'Status',
    analyticsOk: 'OK', analyticsInsufficientSample: 'Insufficient sample', analyticsUnavailable: 'Unavailable', analyticsRetry: 'Retry', analyticsEmpty: 'No analytics data is available for this selection.', analyticsObservedZero: 'Zero is an observed aggregate; insufficient samples are not interpretable rates.', analyticsEntityGuide: 'Guide',
    analyticsEntityExperience: 'Experience', analyticsEntityCreator: 'Creator', analyticsEntityArticle: 'Article', analyticsBookingOff: 'Booking off', analyticsBookingOn: 'Booking on', analyticsMetricDiscoveryToEntity: 'Discovery to entity',
    analyticsMetricEntityToAgent: 'Entity to agent', analyticsMetricEntityToCta: 'Entity to CTA', analyticsMetricCtaToWaitlist: 'CTA to waitlist', analyticsMetricCtaToCheckout: 'CTA to checkout', analyticsMetricAgentStart: 'Agent start',
    analyticsMetricSignupCompletion: 'Signup completion', analyticsMetricErrorInvalid: 'Invalid request errors', analyticsMetricErrorRateLimited: 'Rate-limited errors', analyticsMetricErrorUnavailable: 'Unavailable errors', analyticsMetricErrorUnknown: 'Unknown errors', analyticsMetricUnknown: 'Unknown', analyticsNotApplicable: '—',
  },
  enquiriesAdmin: {
    title: 'Enquiries', subtitle: 'Review and resolve profile enquiries with an audit trail.',
    filterActive: 'Active', filterResolved: 'Resolved', filterSpam: 'Spam', filterAllTypes: 'All types',
    typeCreator: 'Creator collaboration', typeMerchant: 'Merchant contact', statusNew: 'New', statusInProgress: 'In progress', statusResolved: 'Resolved', statusSpam: 'Spam',
    receivedAt: 'Received', target: 'Target', markInProgress: 'Mark in progress', markResolved: 'Mark resolved', markSpam: 'Mark as spam', reopen: 'Reopen',
    reasonLabel: 'Reason', reasonRequired: 'A reason is required.', empty: 'No enquiries match these filters.', actionFailed: 'The enquiry could not be updated. Please try again.',
    next: 'Next',
  },
  creators: {
    title: 'Creators',
    subtitle: 'Understand, moderate, analyze, and pay your creators.',
    kpiTotal: 'Total creators', kpiActive: 'Active', kpiSuspended: 'Suspended', kpiOnboarding: 'Onboarding',
    kpiNew: 'New this period', kpiPayoutsPending: 'Payouts pending',
    trendSignups: 'Signups', trendEngagement: 'Engagement (points)', trendEmpty: 'No data in this period',
    leaderboardTitle: 'Top contributors', leaderboardEmpty: 'No contributors yet', points: 'points',
    atRiskTitle: 'At-risk creators', atRiskEmpty: 'No at-risk creators',
    reasonScanFailed: 'Scan failed', reasonNoMissions: 'No active missions',
    activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    statusOnboarding: 'Onboarding', statusActive: 'Active', statusSuspended: 'Suspended', statusBanned: 'Banned',
    tierSeed: 'Seed', tierRising: 'Rising', tierPro: 'Pro', tierElite: 'Elite',
    verified: 'Verified',
    dirSearch: 'Search name or handle', dirStatus: 'Status', dirTier: 'Tier', dirDna: 'DNA', dirVerifiedOnly: 'Verified only',
    dirAll: 'All', dirLoadMore: 'Next page', dirEmpty: 'No creators match your filters',
    colName: 'Creator', colTier: 'Tier', colDna: 'DNA', colJoined: 'Joined', colActions: 'Actions',
    dnaPublished: 'Published', dnaDraft: 'Draft', dnaNone: 'None',
    actActivate: 'Activate', actSuspend: 'Suspend', actBan: 'Ban', actReinstate: 'Reinstate',
    actVerify: 'Verify', actUnverify: 'Unverify', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
    actListCreator: 'List in creator directory', actRemoveListingOverride: 'Remove directory override', listingOverrideOn: 'Explicit directory override on', listingGuideBased: 'Guide-based listing only',
    reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
    confirmBan: 'Ban this creator? This is a permanent state.', confirmReinstate: 'Reinstate this banned creator?',
    bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose an action',
    actionFailed: 'Action failed. Try again.',
    tabOverview: 'Overview', tabDirectory: 'Directory',
    detailBack: 'Back to directory', detailJoined: 'Joined', detailUpdated: 'Updated', detailBio: 'Bio', detailNoBio: 'No bio',
    tabProfile: 'Profile & DNA', tabMissions: 'Missions', tabEarnings: 'Earnings', tabContent: 'Content', tabModeration: 'Moderation',
    secDna: 'Creator DNA', secScan: 'Latest scan', secSocials: 'Social handles', secContribution: 'Contribution',
    dnaNoData: 'No DNA yet', scanNoData: 'No scans yet', socialsNoData: 'No social handles',
    scanStatus: 'Status', scanError: 'Error', scanCompleted: 'Completed',
    colMission: 'Mission', colStatus: 'Status', colSource: 'Source', colMilestones: 'Milestones', missionsNoData: 'No missions yet',
    colAmount: 'Amount', colPayout: 'Payout', colSettlement: 'Settlement', settlementsNoData: 'No settlements yet',
    pointsHistory: 'Points history', colEvent: 'Event', colPoints: 'Points', pointsNoData: 'No points activity yet', totalPoints: 'Total points',
    colTitle: 'Title', colSaves: 'Saves', colStatusContent: 'Status', contentNoData: 'No content yet',
    secAudit: 'Moderation history', auditNoData: 'No moderation activity yet', addNote: 'Add a note', saveNote: 'Save note',
    tabPayouts: 'Payouts',
    payoutsQueue: 'Settlements', payoutsOwed: 'Creator payout owed', payoutsSettled: 'Creator payout settled',
    setNotStarted: 'Not started', setPending: 'Pending', setPartiallyPaid: 'Partially paid', setPaid: 'Paid', setDisputed: 'Disputed',
    colOpsNote: 'Ops note',
    actMarkPaid: 'Mark paid', actMarkDisputed: 'Mark disputed',
    confirmMarkPaid: 'Mark this settlement fully paid? This records a creator payout.',
    confirmMarkDisputed: 'Flag this settlement as disputed?',
    payoutsEmpty: 'No settlements match this filter',
    reasonRequired: 'A reason is required.',
    batchesHeading: 'Payout batches',
    batchesSubtitle: 'Promise a payout to a creator and track it through to completion.',
    batchesEmpty: 'No payout batches yet',
    colCreatorId: 'Creator', colCurrency: 'Currency', colTargetDate: 'Target date', colCreatedAt: 'Created',
    batchStatusCancelled: 'Cancelled',
    actCreateBatch: 'Create batch', actCancelBatch: 'Cancel batch',
    formCreatorId: 'Creator ID', formCurrency: 'Currency (e.g. HKD)', formAmount: 'Amount',
    confirmMarkBatchPaid: 'Mark this payout batch as paid? This confirms the creator has been paid.',
    confirmCancelBatch: 'Cancel this pending payout batch? This cannot be undone.',
  },
  bookingsOps: {
    title: 'Bookings & Settlements',
    empty: 'No bookings yet.',
    colExperience: 'Experience',
    colMerchantPayout: 'Merchant payout',
    colCreatorCommission: 'Creator commission',
    colKinnsoCommission: 'Kinnso commission',
    colStatus: 'Status',
    noCreatorLeg: 'No creator (direct booking)',
    markPaidButton: 'Mark all paid',
    reasonPlaceholder: 'Reason (required)',
    actionFailed: 'Action failed. Try again.',
  },
  merchantApply: {
    title: 'Become a KINNSO merchant',
    subtitle: 'Tell us about your business. Our team reviews every application within 48 hours.',
    signedOutTitle: 'Sign in to apply',
    signedOutBody: 'You need a KINNSO account before applying as a merchant.',
    signInCta: 'Sign in',
    signUpCta: 'Create an account',
    alreadyMerchantTitle: "You're already a merchant",
    alreadyMerchantBody: 'Head to your merchant hub to post a mission or manage your listings.',
    alreadyMerchantCta: 'Go to merchant hub',
    formCompanyName: 'Company name',
    formContactName: 'Contact name',
    formContactEmail: 'Contact email',
    formWebsite: 'Website',
    formPitch: 'Tell us about your business',
    formPitchPlaceholder: 'What do you sell, and who are your travellers?',
    submitCta: 'Submit application',
    errorGeneric: 'Your application could not be submitted. Please try again.',
    pendingTitle: 'Application under review',
    pendingBody: "We've received your application and our team is reviewing it. This usually takes under 48 hours.",
    rejectedTitle: 'Application not approved',
    rejectedBody: "We couldn't approve your application this time.",
    reapplyCta: 'Apply again',
    decisionReasonLabel: 'Reviewer note',
  },
  merchantApplicationsOps: {
    pendingHeading: 'Pending applications',
    pendingEmpty: 'No pending applications',
    decidedHeading: 'Recent decisions',
    decidedEmpty: 'No decisions yet',
    colApplicant: 'Company', colEmail: 'Email', colWebsite: 'Website', colSubmitted: 'Submitted',
    colStatus: 'Status', colDecidedBy: 'Decided',
    statusPending: 'Pending', statusApproved: 'Approved', statusRejected: 'Rejected',
    actApprove: 'Approve', actReject: 'Reject', actCancel: 'Cancel', actConfirm: 'Confirm',
    reasonPlaceholder: 'Reason (required)',
    actionFailed: 'Action failed. Please try again.',
    pitchLabel: 'Pitch', noPitch: 'No pitch provided', noWebsite: 'No website provided',
  },
  merchantDashboard: {
    title: 'Merchant dashboard',
    subtitle: 'Run your missions, listings, and public profile from one place.',
    open: 'Open',
    cardPostTitle: 'Post a mission',
    cardPostBody: 'Brief vetted creators and pay on published results.',
    cardMissionsTitle: 'Your missions',
    cardMissionsBody: 'Review applicants, submissions, and settlement status.',
    cardCreatorsTitle: 'Find creators',
    cardCreatorsBody: 'Search vetted creators and invite them to your briefs.',
    cardInsightsTitle: 'Insights',
    cardInsightsBody: 'See how your missions and creators are performing.',
    cardExperiencesTitle: 'Experiences',
    cardExperiencesBody: 'List the tours and activities travellers will soon book.',
    cardBookingsTitle: 'Bookings',
    cardBookingsBody: 'Track who booked your experiences and mark completed stays.',
    cardOffersTitle: 'Offers',
    cardOffersBody: 'Create in-store offers travellers can claim from creator guides.',
    cardRedeemTitle: 'Redeem a code',
    cardRedeemBody: 'Scan or type a visitor code to confirm the visit in store.',
    cardProfileTitle: 'Public profile',
    cardProfileBody: 'Control how your business appears across KINNSO.',
    cardBudgetTitle: 'Budget',
    cardBudgetBody: 'Your mission funding balance and history.',
    budgetTitle: 'Budget',
    budgetSubtitle: 'Funding that backs your paid mission approvals.',
    budgetBalance: 'Balance',
    budgetEnforcedOn: 'Enforced — approvals require funding',
    budgetEnforcedOff: 'Not enforced',
    budgetLedgerTitle: 'History',
    budgetLedgerEmpty: 'No transactions yet.',
    budgetNoBudget: 'No budget set up yet — contact KINNSO ops to fund missions.',
    kindTopup: 'Top-up',
    kindDebit: 'Debit',
    kindAdjust: 'Adjustment',
    profileTitle: 'Public profile',
    profileSubtitle: 'These details appear on your public merchant page.',
    slugLabel: 'Profile URL',
    slugNote: 'Your profile address is fixed for now — contact us to change it.',
    fieldCompanyName: 'Company name',
    fieldContactName: 'Contact name',
    fieldContactEmail: 'Contact email',
    fieldWebsite: 'Website',
    fieldTagline: 'Tagline',
    fieldCity: 'City',
    fieldLogoUrl: 'Logo URL',
    saveCta: 'Save profile',
    savedNote: 'Profile saved.',
    expTitle: 'Experiences',
    expSubtitle: 'Bookable listings — booking opens in a later release.',
    expNew: 'New experience',
    expEmpty: 'No experiences yet. Create your first listing.',
    colTitle: 'Title',
    colCity: 'City',
    colPrice: 'Price',
    colStatus: 'Status',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    statusPaused: 'Paused',
    actEdit: 'Edit',
    actPublish: 'Publish',
    actPause: 'Pause',
    formTitleNew: 'New experience',
    formTitleEdit: 'Edit experience',
    fieldTitle: 'Title',
    fieldSummary: 'Summary',
    fieldDescription: 'Description',
    fieldExpCity: 'City',
    fieldPrice: 'Price',
    fieldCurrency: 'Currency',
    fieldDuration: 'Duration (minutes)',
    fieldCoverUrl: 'Cover image URL',
    saveDraftCta: 'Save draft',
    publishCta: 'Save & publish',
    backToList: 'Back to experiences',
    errorGeneric: 'Could not save. Please try again.',
    errRequired: 'This field is required',
    errTooLong: 'Too long',
    errInvalidUrl: 'Enter a valid http(s) URL',
    errInvalidNumber: 'Enter a valid number',
    actAvailability: 'Availability',
    availTitle: 'Manage availability',
    availSubtitle: 'Add the dates travellers can book, with a capacity for each.',
    availBackToExperience: 'Back to experiences',
    availAddHeading: 'Add a date',
    fieldDate: 'Date',
    fieldCapacity: 'Capacity',
    addDateCta: 'Add date',
    availEmpty: 'No availability yet. Add your first bookable date.',
    colDate: 'Date',
    colCapacity: 'Capacity',
    colBooked: 'Booked',
    statusOpen: 'Open',
    statusClosed: 'Closed',
    actClose: 'Close',
    errInvalidDate: 'Enter a valid date',
    errDuplicateDate: 'This date already exists for this experience',
  },
  merchantBookings: {
    title: 'Bookings',
    empty: "No bookings yet — once a traveller books one of your experiences, it'll show up here.",
    colExperience: 'Experience',
    colTraveler: 'Traveller',
    colCreator: 'Booked via',
    colQty: 'Qty',
    colAmount: 'Amount',
    colStatus: 'Status',
    directLabel: 'Direct',
    markCompleteButton: 'Mark completed',
    statusPendingPayment: 'Awaiting payment',
    statusConfirmed: 'Confirmed',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    statusRefunded: 'Refunded',
  },
  trips: {
    title: 'Your trips',
    empty: "No bookings yet — once you book an experience, it'll show up here.",
    colExperience: 'Experience',
    colMerchant: 'Merchant',
    colQty: 'Qty',
    colStatus: 'Status',
    colAmount: 'Amount',
    statusPendingPayment: 'Awaiting payment',
    statusConfirmed: 'Confirmed',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    statusRefunded: 'Refunded',
    bookedOnLabel: 'Booked on',
    savedGuidesTitle: 'Saved guides',
    savedGuidesEmpty: "You haven't saved any guides yet.",
    savedExperiencesTitle: 'Saved experiences',
    savedExperiencesEmpty: "You haven't saved any experiences yet.",
    reviewCta: 'Leave a review',
    reviewedLabel: 'Reviewed',
  },
  merchantsOps: {
    title: 'Merchants',
    subtitle: 'Understand, moderate, and analyze your merchants.',
    tabOverview: 'Overview', tabDirectory: 'Directory', tabApplications: 'Applications',
    kpiTotal: 'Total merchants', kpiActive: 'Active', kpiPaused: 'Paused', kpiSuspended: 'Suspended', kpiArchived: 'Archived',
    kpiFree: 'Free tier', kpiGrowth: 'Growth tier', kpiNew: 'New this period', kpiMissionsLive: 'Live missions', kpiSettlementsPending: 'Settlements pending',
    trendSignups: 'Merchant signups', trendMissions: 'Missions created', trendEmpty: 'No data in this period',
    leaderboardTitle: 'Top merchants', leaderboardEmpty: 'No merchants yet', lbMissions: 'missions', lbCreators: 'creators',
    atRiskTitle: 'At-risk merchants', atRiskEmpty: 'No at-risk merchants',
    reasonGrowthIdle: 'Growth tier, no live missions', reasonDisputed: 'Disputed settlement', reasonPendingOverdue: 'Settlement overdue',
    activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    dirSearch: 'Search company name', dirStatus: 'Status', dirTier: 'Tier', dirAll: 'All',
    dirLoadMore: 'Next page', dirEmpty: 'No merchants match your filters',
    colName: 'Merchant', colStatus: 'Status', colTier: 'Tier', colJoined: 'Joined', colActions: 'Actions',
    statusActive: 'Active', statusPaused: 'Paused', statusSuspended: 'Suspended', statusArchived: 'Archived',
    tierFree: 'Free', tierGrowth: 'Growth',
    actSetStatus: 'Set status', actSetTier: 'Set tier', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
    reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
    confirmArchive: 'Archive this merchant? Their missions are affected.',
    bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose a status',
    actionFailed: 'Action failed. Try again.',
    detailBack: 'Back to directory', detailJoined: 'Joined', detailUpdated: 'Updated',
    tabProfile: 'Profile', tabMissions: 'Missions', tabCreators: 'Creators', tabBilling: 'Billing', tabModeration: 'Moderation',
    secContact: 'Contact', secWebsite: 'Website', contactName: 'Contact name', contactEmail: 'Contact email', noContact: 'No contact on file',
    colMission: 'Mission', colVisibility: 'Visibility', colParticipants: 'Participants', colMilestones: 'Milestones', missionsEmpty: 'No missions yet',
    secEngaged: 'Engaged creators', secSaved: 'Saved creators', colCreator: 'Creator', colHandle: 'Handle', colParticipantStatus: 'Status',
    creatorsEmpty: 'No engaged creators yet', savedCount: 'saved',
    billingReadonly: 'Read-only — settlement writes happen in the Payouts queue.', colSettlement: 'Settlement', colPayout: 'Payout', colKinnso: 'KINNSO', colAffiliate: 'Affiliate',
    colAmount: 'Amount', colCurrency: 'Currency', settlementsEmpty: 'No settlements yet', owedTitle: 'Owed', settledTitle: 'Settled', moneyEmpty: 'None',
    secAudit: 'Moderation history', auditEmpty: 'No moderation activity yet', addNote: 'Add a note', saveNote: 'Save note',
    viewDetail: 'View 360',
    budgetPanelTitle: 'Budget',
    budgetBalance: 'Balance',
    budgetEnforced: 'Enforced',
    budgetNotEnforced: 'Not enforced',
    budgetNoRow: 'No budget yet — the first credit creates it.',
    budgetCreditLabel: 'Credit budget',
    budgetCreditAmountPlaceholder: 'Amount (negative to adjust down)',
    budgetReasonPlaceholder: 'Reason…',
    budgetCreditSubmit: 'Apply credit',
    budgetEnforceOn: 'Turn enforcement on',
    budgetEnforceOff: 'Turn enforcement off',
    budgetSaved: 'Saved.',
  },
  missionsOps: {
    title: 'Missions',
    subtitle: 'Every merchant mission, platform-wide.',
    tabOverview: 'Overview',
    tabDirectory: 'Directory',
    kpiTotal: 'Total missions',
    kpiPublished: 'Published',
    kpiDraft: 'Draft',
    kpiPaused: 'Paused',
    kpiCompleted: 'Completed',
    kpiCancelled: 'Cancelled',
    kpiOpenForApplications: 'Open for applications',
    kpiSubmissionsAwaitingReview: 'Submissions awaiting review',
    trendMissionsCreated: 'Missions created',
    trendSubmissionsReviewed: 'Submissions reviewed',
    trendEmpty: 'No data in this period',
    atRiskTitle: 'At risk',
    atRiskEmpty: 'Nothing at risk right now',
    reasonPublishedNoParticipants: 'Published, no participants yet',
    reasonStalledSubmissions: 'Submission awaiting review >7 days',
    reasonVerificationFailed: 'Verification failed',
    colMission: 'Mission',
    colCreator: 'Creator',
    colVerification: 'Verification',
    colActions: 'Actions',
    queueTitle: 'Review queue',
    queueSubtitle: 'Submissions waiting on a decision, soonest deadline first.',
    queueEmpty: "Nothing to review — you're caught up.",
    waitingOnCreator: 'Waiting on creator',
    actApprove: 'Approve',
    actReject: 'Reject',
    actRequestRevision: 'Request revision',
    actCancel: 'Cancel',
    actApply: 'Apply',
    reasonCategoryPlaceholder: 'Reason category…',
    reasonFormat: 'Format',
    reasonKeyMessage: 'Key message',
    reasonCompliance: 'Compliance',
    reasonQuality: 'Quality',
    reasonOther: 'Other',
    reasonUnreadable: 'Unreadable',
    reasonWrongVenue: 'Wrong venue',
    reasonDuplicate: 'Duplicate',
    reasonAmountUnclear: 'Amount unclear',
    viewQueue: 'View queue',
    confidenceVerified: 'Verified',
    confidenceNeedsReview: 'Needs review',
    confidenceUnavailable: 'Unavailable',
    actRerunVerification: 'Re-run verification',
    rerunQueued: 'Verification re-queued — check back in a moment.',
    rerunFailed: 'Could not start verification. Please try again.',
    autoApprovePolicyLabel: 'Auto-approve verified submissions',
    autoApprovePolicyOff: 'Off',
    autoApprovePolicyOn: 'On — verified signal only',
    autoApprovePolicySaved: 'Saved.',
    autoApprovePolicyError: 'Could not update the policy. Please try again.',
    attentionOverdueTitle: 'Overdue reviews',
    attentionOverdueEmpty: 'Nothing overdue right now',
  },
  perks: {
    catalog: {
      heading: 'Creator perks', subtitle: 'Partner deals unlocked by your contribution tier.',
      empty: 'No perks available yet — check back soon.',
      lockedBadge: 'Locked', requiresTier: 'Requires {tier}', unlockCta: 'Climb your tier',
      redeem: 'Redeem', redeemed: 'Redeemed', reveal: 'Reveal', hide: 'Hide',
      copyCode: 'Copy code', copied: 'Copied', openDeal: 'Open deal',
      redeemFailed: 'Could not redeem this perk. Please try again.',
    },
    admin: {
      title: 'Perks', subtitle: 'Create and manage partner perks.',
      newPerk: 'New perk', editPerk: 'Edit perk', empty: 'No perks yet. Create the first one.',
      fieldPartner: 'Partner name', fieldTitle: 'Title', fieldSummary: 'Summary', fieldCategory: 'Category',
      fieldDiscount: 'Discount label', fieldMinTier: 'Minimum tier', fieldRedemptionType: 'Redemption type',
      fieldRedemptionValue: 'Redemption value', fieldSortOrder: 'Sort order', fieldActive: 'Active',
      tierOpen: 'Open to all', tierRising: 'Rising', tierPro: 'Pro', tierElite: 'Elite',
      typeCode: 'Code', typeLink: 'Link',
      save: 'Save', cancel: 'Cancel', activate: 'Activate', deactivate: 'Deactivate',
      statusActive: 'Active', statusInactive: 'Inactive',
    },
    tierLabels: { rising: 'Rising', pro: 'Pro', elite: 'Elite' },
  },
  testimonialsAdmin: {
    title: 'Testimonials',
    subtitle: 'Curate the quotes shown in the homepage social-proof section.',
    newCta: 'New testimonial',
    empty: 'No testimonials yet — add the first one.',
    colAuthor: 'Author', colStatus: 'Status',
    roleCreator: 'Creator', roleTraveller: 'Traveller', roleMerchant: 'Merchant', localeAll: 'All locales',
    statusDraft: 'Draft', statusPublished: 'Published',
    actPublish: 'Publish', actUnpublish: 'Unpublish', actEdit: 'Edit', actDelete: 'Delete',
    deleteConfirm: 'Delete this testimonial? This cannot be undone.',
    formNewTitle: 'New testimonial', formEditTitle: 'Edit testimonial',
    formQuote: 'Quote', formAuthorName: 'Author name', formAuthorRole: 'Author role',
    formLocale: 'Locale', formLocaleHint: 'Leave on "All locales" to show it in every language.', formSortOrder: 'Sort order',
    formSave: 'Save', formCancel: 'Cancel',
  },
  users: {
    title: 'Users',
    subtitle: 'Manage creators, merchants, and ops members.',
    sectionCreators: 'Creators',
    sectionMerchants: 'Merchants',
    sectionOps: 'Ops members',
    empty: 'None yet.',
    joined: 'Joined',
    unnamed: 'Unnamed',
    activate: 'Activate',
    suspend: 'Suspend',
    statusActive: 'Active',
    statusSuspended: 'Suspended',
    statusOnboarding: 'Onboarding',
    statusPaused: 'Paused',
    statusArchived: 'Archived',
    errorGeneric: 'User status could not be changed.',
    tierLabel: 'Tier',
    tierFree: 'Free',
    tierGrowth: 'Growth',
    manageInConsole: 'Manage in console',
  },
  team: {
    overviewTitle: 'Team', overviewSubtitle: 'Manage ops team members and their roles.',
    kpiMembers: 'Total members', kpiPending: 'Pending invites',
    roleOwner: 'Owner', roleAdmin: 'Admin', roleModerator: 'Moderator', roleAnalyst: 'Analyst',
    statusActive: 'Active', statusSuspended: 'Suspended',
    directoryTitle: 'Member directory',
    colName: 'Name', colRole: 'Role', colStatus: 'Status', colJoined: 'Joined',
    invitePanelTitle: 'Invite a member', inviteEmailLabel: 'Email address', inviteRoleLabel: 'Role',
    inviteGenerate: 'Generate invite link', inviteCopied: 'Copied!', inviteExpiry: 'Link expires in 7 days.',
    actionSetRole: 'Change role', actionSuspend: 'Suspend', actionReactivate: 'Reactivate',
    actionConfirm: 'Confirm', actionCancel: 'Cancel', reasonPlaceholder: 'Reason (required)',
    acceptTitle: 'Accept invitation', acceptLoading: 'Accepting…',
    acceptSuccess: 'You now have ops access. Go to the admin panel to get started.',
    acceptExpired: 'This invite has expired or been revoked. Ask an owner for a new one.',
    acceptEmailMismatch: 'This invite was sent to a different email address.',
    acceptNotFound: 'Invite not found.',
    acceptSignInPrompt: 'Sign in to accept this invitation.',
  },
  merchantSearch: {
    heading: 'Find creators',
    sub: 'Discover creators by what they publicly share — niches, audience regions, languages, and platforms.',
    searchPlaceholder: 'Search by name or handle…',
    filter: 'Filters',
    filtersLocked: 'Filters are available on Growth.',
    upgradeTitle: 'Upgrade to Growth',
    upgradeBlurb: 'Unlock filters, see every matching creator, and send more invitations.',
    upgradeCta: 'Upgrade',
    tabRecommended: 'Recommended',
    tabSaved: 'Saved',
    tabWorking: 'Working with',
    emptyRecommended: 'No creators match your filters yet.',
    emptySaved: 'You haven’t saved any creators yet.',
    emptyWorking: 'No creators are working with you yet.',
    resultsCapped: 'Showing your top matches. Upgrade to Growth to see them all.',
    invitesLeft: '{count} invitations left this month',
    reasonNiche: 'Niche match',
    reasonGeo: 'Audience region match',
    reasonLanguage: 'Language match',
    reasonPlatform: 'Platform match',
    guidesLabel: '{count} Guides',
    viewProfile: 'View profile',
    save: 'Save',
    saved: 'Saved',
    sendBrief: 'Send brief',
    addNote: 'Add a private note…',
    pickMissionTitle: 'Invite to a mission',
    pickMissionEmpty: 'Publish a mission first to invite creators.',
    invited: 'Invited',
    filterNiches: 'Niches',
    filterGeos: 'Audience regions',
    filterLanguages: 'Languages',
    filterPlatforms: 'Platforms',
    filterHasGuides: 'Has published guides',
    inviteQuotaExceeded: 'You’ve used all your invitations this month.',
    alreadyParticipant: 'This creator is already part of that mission.',
    inviteFailed: 'Could not send the invitation. Please try again.',
  },
  insights: {
    navLabel: 'Insights',
    empty: 'No activity yet.',
    creatorTitle: 'Your insights',
    creatorSubtitle: 'Your real activity on KINNSO. These are contribution points from your work — not money.',
    pointsTotal: 'Contribution points',
    visitsDriven: 'Visits driven',
    pointsTrajectory: 'Points over the last 12 weeks',
    pointsByType: 'Where your points come from',
    typeGuide: 'Published guides',
    typeMission: 'Verified missions',
    typeScan: 'DNA scan',
    tierProgress: 'Tier progress',
    tierAtMax: 'Top tier reached',
    pointsToNext: '{points} points to {tier}',
    guidesPublished: 'Published guides',
    guideSaves: 'Total saves',
    missionsTitle: 'Your missions',
    statusApplied: 'Applied',
    statusActive: 'Active',
    statusInvited: 'Invited',
    statusRejected: 'Not selected',
    deliverables: 'Approved deliverables',
    creatorEmptyPoints: 'Publish your first guide or complete a mission to start earning points.',
    creatorEmptyMissions: 'No mission activity yet. Browse open missions in your studio.',
    merchantTitle: 'Campaign insights',
    merchantSubtitle: 'Activity across the missions you have posted.',
    missionsPublished: 'Published missions',
    participants: 'Total participants',
    inviteAcceptRate: 'Invite acceptance',
    deliveredWork: 'Approved deliverables',
    perMissionTitle: 'By mission',
    colMission: 'Mission',
    colInvited: 'Invited',
    colApplied: 'Applied',
    colActive: 'Active',
    colRejected: 'Rejected',
    colDelivered: 'Delivered',
    merchantEmpty: 'Post a mission to start seeing campaign activity.',
    notApplicable: '—',
    visitsDrivenTitle: 'Visits driven',
    visitsDrivenEmpty: 'No redemptions or attributed bookings yet.',
    colCreator: 'Creator',
    colGuide: 'Guide',
    colRedemptions: 'Redemptions',
    colAttributedBookings: 'Attributed bookings',
    unnamed: 'Unnamed',
  },
  guideSave: {
    save: 'Save',
    saved: 'Saved',
    signInToSave: 'Sign in to save',
    saveFailed: 'That did not save. Please try again.',
  },
  experienceSave: {
    save: 'Save',
    saved: 'Saved',
    signInToSave: 'Sign in to save',
    saveFailed: 'That did not save. Please try again.',
  },
  reviews: {
    formHeading: 'Leave a review',
    ratingLabel: 'Rating',
    bodyLabel: 'Your review (optional)',
    bodyPlaceholder: 'Tell other travellers about your experience…',
    submitCta: 'Submit review',
    submittingCta: 'Submitting…',
    submitted: 'Thanks for your review!',
    alreadyReviewed: 'You already reviewed this booking.',
    genericError: 'Something went wrong. Please try again.',
    ratingAverageLabel: '{average} out of 5',
    countLabel: '{count} reviews',
    emptyState: 'No reviews yet.',
    anonymousReviewer: 'A KINNSO traveller',
  },
  featureInterest: {
    emailLabel: 'Email address',
    emailPlaceholder: 'traveller@email.test',
    submitAgent: 'Join the AI Agent waitlist',
    submitBooking: 'Get notified when booking opens',
    pending: 'Submitting…',
    success: "You're on the list — we'll keep you posted.",
    invalidEmail: 'Enter a valid email address.',
    retry: 'Could not save your interest. Please try again.',
  },
  enquiry: {
    creatorPurpose: 'Creator collaboration', merchantPurpose: 'Merchant contact',
    dialogTitle: 'Send an enquiry', dialogDescription: 'Tell us what you have in mind.',
    nameLabel: 'Name', emailLabel: 'Email', messageLabel: 'Message',
    submit: 'Send enquiry', submitting: 'Sending enquiry…', cancel: 'Cancel', close: 'Close',
    invalid: 'Please check your name, email, and message, then try again.', rateLimited: 'Too many enquiries from this connection. Please try again later.',
    failed: 'We could not send your enquiry. Please try again.', successTitle: 'Enquiry sent', successBody: 'Thanks for getting in touch. We have received your enquiry.',
  },
  sessions: {
    eyebrow: 'Community Sessions',
    title: 'Live briefings from creators on the ground.',
    body: 'Ask questions, get real answers, and watch replays from the creators behind our guides.',
    upcomingHeading: 'Upcoming',
    emptyUpcoming: 'No sessions scheduled right now — check back soon.',
    replaysHeading: 'Replays',
    waitlistValue: 'Live sessions turn practical travel questions into honest answers you can use right away.',
    waitlistInvite: 'No pressure—join the waitlist for a quiet heads-up when the next one is ready.',
    waitlistFormLabel: 'Session updates',
    waitlistEmailLabel: 'Email address',
    waitlistSubmit: 'Join the waitlist',
    waitlistPending: 'Joining…',
    waitlistSuccess: "You're on the waitlist.",
    waitlistInvalid: 'Enter a valid email address.',
    waitlistRateLimited: 'Too many attempts. Please try again later.',
    waitlistRetry: 'Something went wrong. Please try again.',
    rsvpEmailLabel: 'Your email',
    rsvpSubmit: 'RSVP',
    rsvpConfirmed: "You're on the list — we'll be in touch.",
    rsvpError: 'RSVP could not be saved — please try again.',
    rsvpCancelledNotice: 'This session has been cancelled.',
    typeDestinationBriefing: 'Destination briefing',
    typeAskACreator: 'Ask a creator',
    typeMerchantSpotlight: 'Merchant spotlight',
    typeNewCreatorIntro: 'New creator intro',
  },
  destinations: {
    eyebrow: 'Destinations',
    title: 'Every city, told by the people who know it.',
    body: 'Browse curated destinations — the guides, bookable experiences, and live sessions our creators have covered so far.',
    empty: 'New destinations are on the way — check back soon.',
    guideCount: (count) => count === 1 ? `${count} guide` : `${count} guides`,
    experienceCount: (count) => count === 1 ? `${count} experience` : `${count} experiences`,
    guidesHeading: 'Guides',
    emptyGuides: 'No guides for this destination yet.',
    experiencesHeading: 'Experiences',
    emptyExperiences: 'No bookable experiences here yet.',
    articlesHeading: 'Articles',
    metadataDescription: (name) => `Discover guides, experiences, articles, and sessions for ${name}.`,
    sessionsHeading: 'Upcoming sessions',
    emptySessions: 'No sessions scheduled for this destination right now.',
  },
  sessionsAdmin: {
    title: 'Community Sessions',
    subtitle: 'Create, manage, and moderate sessions across all creators.',
    newCta: 'New session',
    empty: 'No sessions yet.',
    statusScheduled: 'Scheduled',
    statusLive: 'Live',
    statusEnded: 'Ended',
    statusCancelled: 'Cancelled',
    typeDestinationBriefing: 'Destination briefing',
    typeAskACreator: 'Ask a creator',
    typeMerchantSpotlight: 'Merchant spotlight',
    typeNewCreatorIntro: 'New creator intro',
    actEdit: 'Edit',
    actGoLive: 'Go live',
    actEnd: 'End',
    actCancel: 'Cancel',
    actViewRsvps: 'View RSVPs',
    actDelete: 'Delete',
    deleteConfirm: 'Delete this session? This cannot be undone.',
    rsvpsEmpty: 'No RSVPs yet.',
    formNewTitle: 'New session',
    formEditTitle: 'Edit session',
    formCancel: 'Cancel',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    typeLabel: 'Type',
    startsAtLabel: 'Starts at',
    durationLabel: 'Duration (minutes)',
    embedUrlLabel: 'Live embed URL (YouTube)',
    embedUrlPlaceholder: 'https://youtube.com/watch?v=…',
    replayUrlLabel: 'Replay URL (YouTube)',
    replayUrlPlaceholder: 'https://youtube.com/watch?v=…',
    destinationTagsLabel: 'Destinations (comma-separated)',
    destinationTagsPlaceholder: 'Tokyo, Japan',
    saveButton: 'Save',
    hostPickerLabel: 'Host creator',
    hostPickerPlaceholder: 'Select a creator',
    hostRequiredError: 'Select a host before creating this session',
  },
  merchantOffers: {
    title: 'Offers',
    fieldTitle: 'Title — e.g. Free dessert with any main',
    fieldTerms: 'Terms',
    fieldValue: 'Value',
    fieldPerVisitorLimit: 'Per-visitor limit',
    fieldTotalCap: 'Total cap',
    discountItem: 'Free item',
    discountPercent: 'Percent off',
    discountAmount: 'Amount off',
    commissionFlat: 'Flat fee',
    commissionPercent: 'Percent of spend',
    publish: 'Publish offer',
    yourOffers: 'Your offers',
    claimed: 'claimed',
    redeemed: 'redeemed',
    totalClaimed: 'total claims',
    totalRedeemed: 'total redemptions',
    actPublish: 'Publish',
    actPause: 'Pause',
    actEnd: 'End',
  },
  offerClaim: {
    claimButton: 'Claim this offer',
    validThrough: 'Valid through',
    heading: 'Show this at the venue',
    showAt: 'Show this at',
    claimFailed: 'That offer could not be claimed. It may have ended or reached its limit.',
  },
  offerRedeem: {
    title: 'Redeem',
    scanning: 'Point the camera at the visitor\'s QR code',
    manualPlaceholder: 'Enter code manually',
    manualSubmit: 'Look up',
    amountSpentPrompt: 'Amount spent (optional unless required)',
    amountSpentSubmit: 'Redeem',
    success: 'Redeemed!',
    alreadyRedeemed: 'Already redeemed',
  },
}
export default messages
