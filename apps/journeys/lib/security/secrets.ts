import {timingSafeEqual} from 'node:crypto';

/** Constant-time comparison for API secrets; missing values always fail closed. */
export function secretEqual(provided:string|null,expected:string|undefined){
 if(!provided||!expected)return false;
 const left=Buffer.from(provided),right=Buffer.from(expected);
 if(left.length!==right.length)return false;
 return timingSafeEqual(left,right);
}
