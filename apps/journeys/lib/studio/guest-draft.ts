// In-memory navigation only: no private question in URL, cookies or web storage.
let question='';
export const stageGuestQuestion=(value:string)=>{question=value.slice(0,8000);};
export const peekGuestQuestion=()=>question;
export const clearGuestQuestion=()=>{question='';};
