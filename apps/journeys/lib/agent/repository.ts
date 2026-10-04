import {request} from '../trips/repository';
import type {AgentResult} from './result-contract';
import type {AgentTask} from './policy';
export const agentRequest=(input:{task:AgentTask;prompt:string;tripId?:string;merchantId?:string;locale:'en'|'zh-hk'|'zh-cn';requestId:string})=>request<AgentResult>('/api/agent','POST',input);
