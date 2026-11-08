/** Local discovery contracts. Native authority/adapters remain unavailable until N acceptance. */
export type GrantPurpose='catalog'|'matching'|'private_brief'|'public_guide'|'trip_adoption'|'trip_share';
export const GRANT_PURPOSES:GrantPurpose[]=['catalog','matching','private_brief','public_guide','trip_adoption','trip_share'];
export type DateSpec={kind:'fixed';start:string;end:string}|{kind:'window';earliest:string;latest:string}|{kind:'undecided'};
export type Budget={currency:'HKD'|'TWD';maxPerPersonMinor:number}|null;
export type DiscoveryPreferencesInput={favoriteCityKeys:string[];interestTags:string[];languages:string[]};
export type DiscoveryPreferences=DiscoveryPreferencesInput&{ownerActorId:string;revision:number;updatedAt:string};
export type TripIntentInput={cityKey:string;dateSpec:DateSpec;budget:Budget;interestTags:string[];languages:string[];linkedTripId?:string};
export type TripIntent=TripIntentInput&{id:string;ownerActorId:string;revision:number;status:'active'|'archived';createdAt:string;updatedAt:string};
export type CityDefinition={key:string;name:string;timeZone:string;currency:'HKD'|'TWD'};
export const CITIES:CityDefinition[]=[{key:'city:hk:hong-kong',name:'香港',timeZone:'Asia/Hong_Kong',currency:'HKD'}];
export type MerchantLink={id:string;companyId:string;smeWorkspaceId:string;locationIds:string[];linkVersion:number;status:'pending'|'active'|'revoked'|'unverified';proofDigest:string|null;verifiedAt:string|null;readRefreshAllowed:boolean};
export type OfferEvidence={offerId:string;revision:number;hash:string;sourceLocationId:string|null;appliedLocationId:string;title:string;details:string;terms:string;validFrom:string;validUntil:string;priceAmount:string|null;currency:'HKD'|'TWD'|null;claims:string[];prohibitedTerms:string[];observedAt:string;sourceStatus:'confirmed'|'expired'|'archived';rightsState:'unverified_for_kinnso_reuse'};
export type OfferImport={id:string;linkId:string;externalOfferId:string;sourceRevision:number;sourceHash:string;appliedLocationId:string;sourceLocationId:string|null;observedAt:string;sourceScopeVersion:number;fields:OfferEvidence};
export type PublicationDraftInput={importId:string;cityKey:string;dateTimeZone:string;priceBasis:'per_person'|'other'|'unknown';interestTags:string[];languages:string[];audiences:('traveller'|'creator')[];displayFields:('title'|'details'|'terms')[];campaignId?:string};
export type OfferPublication=PublicationDraftInput&{id:string;companyId:string;revision:number;contentVersion:number;contentHash:string;previewDigest:string;status:'draft'|'published'|'withdrawn';publishedAt:string|null;withdrawnAt:string|null};
export type ContentUseGrant={id:string;publicationId:string;publicationContentVersion:number;grantVersion:number;grantorCompanyId:string;issuerActorId:string;contentHash:string;allowedFields:string[];purpose:GrantPurpose;expiresAt:string;revokedAt:string|null;rightsBasisRef:string;verificationState:'unverified'|'approved'};
export type SourceProvenance={sourceId:string;publicationId:string;contentVersion:number;contentHash:string;grantRefs:{purpose:GrantPurpose;id:string;version:number}[];importHash:string;checkedAt:string};
export type DerivativeBinding={targetKind:'guide_version'|'trip_day'|'trip_stop'|'share_projection';targetId:string;targetVersion:number;fieldPath:string;sourceId:string;grantId:string;grantVersion:number;publicationId:string;publicationContentVersion:number;upstreamGuideId?:string;upstreamGuideVersion?:number;upstreamStopId?:string};
export type PublishedOfferContext={publication:OfferPublication;import:OfferImport;grants:ContentUseGrant[];link:MerchantLink;checkedAt:string;sourceState:'current'|'changed'|'expired'|'unavailable';campaignEligible?:boolean};
export type MatchCandidate={publicationId:string;publicationRevision:number;contentVersion:number;grantVersions:{id:string;version:number;purpose:GrantPurpose}[];eligibility:'eligible'|'needs_confirmation'|'excluded';score:number;scoreBreakdown:Record<'city'|'dates'|'interests'|'budget'|'language',number>;reasons:string[];missing:string[];coverage:number;observedAt:string;sourceRevision:number;checkedAt:string;display?:{title:string;details:string;terms:string;priceAmount:string|null;currency:string|null;validFrom:string;validUntil:string};campaignId?:string};
export type MatchResult={results:MatchCandidate[];coverage:{candidateCount:number;returnedCount:number;bounded:boolean}};
export type MatchRun=MatchResult&{id:string;ownerActorId:string;intentId:string;intentRevision:number;policyVersion:'matching-v1';candidateSetHash:string;computedAt:string};
export type MatchChoice={ownerActorId:string;intentId:string;publicationId:string;revision:number;choice:'saved'|'dismissed'|'cleared';updatedAt:string};
export type PublicationConfirmation={contentVersion:number;previewDigest:string;confirmed:true};
export type ContentGrantInput={publicationContentVersion:number;allowedFields:string[];purposes:GrantPurpose[];expiresAt:string;rightsBasisRef:string;previewDigest:string;confirmed:true};
export type DiscoveryCommand=
 |{kind:'savePreferences';data:DiscoveryPreferencesInput}|{kind:'clearPreferences'|'archiveIntent'|'deleteIntent'|'revokeLink'|'revokeContentUse'|'withdrawOffer';data:Record<string,never>}
 |{kind:'saveIntent';data:TripIntentInput}|{kind:'beginLink';data:{companyId:string;locationIds:string[]}}
 |{kind:'confirmLink';data:{proof:string;readRefreshAllowed:boolean}}|{kind:'importOffer';data:{linkId:string;offerId:string;expectedSourceRevision:number;locationId:string}}
 |{kind:'preparePublication';data:PublicationDraftInput}|{kind:'grantContentUse';data:ContentGrantInput}|{kind:'publishOffer';data:PublicationConfirmation}
 |{kind:'recordMatch';data:{intentId:string;intentRevision:number}}|{kind:'chooseOffer';data:{intentId:string;publicationId:string;choice:MatchChoice['choice']}};
export type DiscoveryIntent={requestId:string;targetId:string;expectedRevision:number;command:DiscoveryCommand};
export type DiscoveryReceipt={requestId:string;commandDigest:string;resourceId:string;revision:number};
export type DiscoveryError='AUTH_REQUIRED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'INVALID'|'UNAVAILABLE'|'RESTRICTED'|'SOURCE_CHANGED'|'TIMEOUT'|'NOT_CONNECTED'|'UNSUPPORTED'|'RATE_LIMITED';
export type Failure={ok:false;code:DiscoveryError;retryable:boolean};
export type DiscoveryCommandResult={ok:true;receipt:DiscoveryReceipt}|Failure;
export type DiscoveryReadback={status:'complete';receipt:DiscoveryReceipt;resourceState:'present'|'deleted'}|{status:'unknown'|'restricted';requestId:string};
export type DiscoveryRead={kind:'preferences'|'intents'|'publicOffers'}|{kind:'intent'|'match';id:string}|{kind:'companyOffers';companyId:string};
export type CompanyOffers={companyId:string;canManage:boolean;link:MerchantLink|null;imports:OfferImport[];publications:OfferPublication[];grants:ContentUseGrant[];availableOffers:OfferEvidence[]};
export type DiscoveryData=DiscoveryPreferences|null|TripIntent|TripIntent[]|MatchRun|MatchCandidate[]|CompanyOffers;
export type DiscoveryReadResult={ok:true;data:DiscoveryData}|Failure;
export type DiscoveryDemoActions={companies():Promise<{id:string;name:string;role:string;locationId:string}[]>;attestLink(id:string):Promise<string>;refreshOffers(id:string):Promise<DiscoveryReadResult>};
export type MatchedSourceInput={matchRunId:string;publicationId:string};
export type MatchedSourcesResult={ok:true;sources:import('../studio/contracts').SourceDocument[]}|Failure;
export type TripSuggestionResult={ok:true;intent:TripIntent;offer:MatchCandidate}|Failure;
export interface DiscoveryStore{read(scope:DiscoveryRead):Promise<DiscoveryReadResult>;command(intent:DiscoveryIntent):Promise<DiscoveryCommandResult>;receipt(requestId:string):Promise<DiscoveryReadback>;pending():Promise<DiscoveryIntent|null>;stage(intent:DiscoveryIntent):Promise<void>;clear(requestId:string):Promise<void>;demo?:DiscoveryDemoActions;resolveSources?:(input:MatchedSourceInput)=>Promise<MatchedSourcesResult>;tripSuggestion?:(input:{intentId:string;publicationId:string})=>Promise<TripSuggestionResult>}
