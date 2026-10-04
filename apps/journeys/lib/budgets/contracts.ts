export const services=['ai','maps','storage','jobs'] as const;
export type Service=typeof services[number];
export type Budget={service:Service;period:string;limit:number;spent:number;reserved:number;stopBehavior:'stop'|'degrade'};
export type Denial={allowed:false;reason:'disabled'|'exhausted'|'in_flight'|'already_finished';stopBehavior:'stop'|'degrade'};
export type Reservation={allowed:true;reservationId:string}|Denial;
export type ReserveInput={service:Service;requestId:string;estimate:number};
export function units(value:number,allowZero=false) {
 if(!Number.isSafeInteger(value)||value<(allowZero?0:1)||value>9000000000000)throw new Error('INVALID_COST');
 return value;
}
export function budgetDecision(budget:Budget|null,estimate:number):{allowed:true}|Denial {
 units(estimate);
 if(!budget||!services.includes(budget.service)||![budget.limit,budget.spent,budget.reserved].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=9000000000000)||!['stop','degrade'].includes(budget.stopBehavior))return{allowed:false,reason:'disabled',stopBehavior:'stop'};
 return estimate<=budget.limit-budget.spent-budget.reserved?{allowed:true}:{allowed:false,reason:'exhausted',stopBehavior:budget.stopBehavior};
}
