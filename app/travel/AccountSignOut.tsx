'use client';
import {useState} from 'react';import {signOut} from '../[locale]/sign-in/actions';import {clearAccountCaches} from '../../lib/trips/local-drafts';
export function AccountSignOut({label}:{label:string}){const [busy,setBusy]=useState(false);return <button className="k-btn" disabled={busy} onClick={async()=>{setBusy(true);try{await clearAccountCaches()}catch{}await signOut()}}>{label}</button>}
