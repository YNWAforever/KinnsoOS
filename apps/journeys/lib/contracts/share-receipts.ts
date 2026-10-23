import type {PublicTripProjection} from './trips';
export type ShareIntent={requestId:string;tripId:string;stopIds:string[];mediaIds:string[];expiresAt:string};
export type ShareReceiptState='active'|'revoked'|'expired';
export type ShareReceiptRow={requestId:string;id:string;createdAt:string;expiresAt:string;state:ShareReceiptState};
export type ShareReceipt=ShareReceiptRow&{intent:ShareIntent;projection:PublicTripProjection;url:string|null};
export type ShareReceiptCursor={createdAt:string;requestId:string};
export type ShareReceiptPage={items:ShareReceiptRow[];nextCursor:ShareReceiptCursor|null};
export type ShareTokenEnvelope={v:1;kid:string;iv:string;ciphertext:string;tag:string};
