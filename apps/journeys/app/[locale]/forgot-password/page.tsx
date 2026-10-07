import {EntryPage,type EntryProps} from '../../auth/EntryPage';
import {requestRecovery} from './actions';
export const metadata={title:'Recover password',robots:{index:false,follow:false}};
export default function Page(props:EntryProps){return <EntryPage {...props} entry="forgot-password" action={requestRecovery}/>;}
