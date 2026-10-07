import {EntryPage,type EntryProps} from '../../auth/EntryPage';
import {resetPassword} from './actions';
export const metadata={title:'Reset password',robots:{index:false,follow:false}};
export default function Page(props:EntryProps){return <EntryPage {...props} entry="reset-password" action={resetPassword}/>;}
