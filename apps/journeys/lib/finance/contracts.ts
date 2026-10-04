export type MoneyState = 'claimed'|'redeemed'|'validated'|'eligible'|'settled'|'paid'|'recorded';
export type SourceKind = 'claim'|'receipt'|'settlement'|'payout_batch'|'booking_settlement';
export type ReviewState = 'open'|'investigating'|'waiting_business_rules'|'closed';
export type FinanceCursor = {key:string;scope:string};
export type FinanceFilter = {merchantId?:string;missionId?:string;state?:MoneyState;exceptionsOnly?:boolean};
export type ReconciliationCase = {
  id:string;status:ReviewState;ownerId:string|null;revision:number;historyCount:number;
  history:{id:string;status:ReviewState;ownerId:string|null;reason:string;createdAt:string}[];
};
export type FinanceRecord = {
  key:string;kind:SourceKind;sourceId:string;merchantId:string|null;missionId:string|null;
  branchId:string|null;title:string;state:MoneyState;sourceStatus:string;currency:string|null;
  recordedAmount:string|null;minorAmount:string|null;amountIssue:string|null;
  basis:'creator_obligation'|'payout_promise'|'merchant_booking_obligation'|'attribution';
  proof:{claimed:boolean;redeemed:boolean;validated:boolean;eligible:boolean;settled:boolean;paid:boolean};
  exceptions:string[];references:{claimId?:string|null;redemptionId?:string|null;submissionId?:string|null;settlementId?:string|null;bookingId?:string|null};
  review:ReconciliationCase|null;updatedAt:string;
};
export type FinanceWorkspace = {
  items:FinanceRecord[];nextCursor:FinanceCursor|null;
  totals:{currency:string|null;basis:FinanceRecord['basis'];state:MoneyState;count:number;minorAmount:string|null;blockedAmountCount:number}[];
  scope:{mode:'ops'|'merchant';merchantId:string|null;role:string;branchIds:string[]};
  capabilities:{livePayment:false;refund:false;feeAdjustment:false;disputeMoneyResolution:false};
};
