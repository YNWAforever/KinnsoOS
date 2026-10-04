/** Mature traveller policy, copied as pure values to preserve standalone packaging. */
export const AGENT_MODEL = 'anthropic/claude-haiku-4.5';
export const AGENT_RATE_LIMIT = Object.freeze({maxRequests:20,windowSeconds:3600});
export const MAX_TOOL_CALLS = 5;
export const TASKS = Object.freeze(['sourceQA','tripSuggestion','creatorMaterials','merchantBrief'] as const);
export type AgentTask = typeof TASKS[number];
export type Actor = {id:string;roles:string[]};
const taskTools = Object.freeze({
 sourceQA:Object.freeze(['searchGuides','searchArticles','searchExperiences']),
 tripSuggestion:Object.freeze(['searchGuides','searchArticles','ownedTrip']),
 creatorMaterials:Object.freeze(['searchGuides','ownedCreatorMaterials']),
 merchantBrief:Object.freeze(['searchGuides','searchArticles','ownedMerchantBrief']),
});
export function allowedTools(actor:Actor,task:AgentTask):readonly string[] {
 if(!TASKS.includes(task)||!actor.roles.includes('traveller'))throw new Error('FORBIDDEN');
 if(task==='creatorMaterials'&&!actor.roles.includes('creator'))throw new Error('FORBIDDEN');
 if(task==='merchantBrief'&&!actor.roles.includes('merchant'))throw new Error('FORBIDDEN');
 return taskTools[task];
}
/** Permissions are server values; content never enters this function. */
export function toolGuard(actor:Actor,task:AgentTask) {
 const tools=allowedTools(actor,task);let calls=0;
 return (name:string)=>{if(!tools.includes(name))throw new Error('FORBIDDEN');if(++calls>MAX_TOOL_CALLS)throw new Error('TOOL_LIMIT');};
}
