export const publicLanguages=['en','zh-HK','zh-tw','zh-cn','ja','ko','th'] as const;
export type PublicLanguage=typeof publicLanguages[number];
export function publicLanguage(value:string):PublicLanguage|null{
 const normalized=value==='zh-hk'?'zh-HK':value;
 return (publicLanguages as readonly string[]).includes(normalized)?normalized as PublicLanguage:null;
}
export function authoredLanguage(value:string):string|null{
 const language=publicLanguage(value);return language==='zh-HK'?'zh-hk':language;
}
export function contentLanguage(value:string):string{
 const language=publicLanguage(value);if(!language)throw Error('unsupported_public_language');
 return language==='zh-HK'?'zh-Hant-HK':language==='zh-tw'?'zh-Hant-TW':language==='zh-cn'?'zh-Hans-CN':language;
}
// Existing legacy article dictionary labels; authored content is never translated or substituted.
export const articleQuestions:Record<PublicLanguage,string>={en:'Questions and answers','zh-HK':'常見問題','zh-tw':'常見問題','zh-cn':'常见问题',ja:'よくある質問',ko:'자주 묻는 질문',th:'คำถามที่พบบ่อย'};
