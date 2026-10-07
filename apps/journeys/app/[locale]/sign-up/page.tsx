import {EntryPage,type EntryProps} from '../../auth/EntryPage';
import {signUp} from './actions';
export const metadata={title:'Create account',robots:{index:false,follow:false}};
export default function Page(props:EntryProps){return <EntryPage {...props} entry="sign-up" action={signUp}/>;}
