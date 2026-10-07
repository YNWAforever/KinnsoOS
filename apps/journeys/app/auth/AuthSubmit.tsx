'use client';
import {useFormStatus} from 'react-dom';
import {useEffect,useRef} from 'react';
export function AuthSubmit({label,busyLabel}:{label:string;busyLabel:string}){
 const {pending}=useFormStatus();return <button className="k-btn primary" type="submit" disabled={pending} aria-busy={pending}>{pending?busyLabel:label}</button>;
}
export function AuthError({message}:{message:string}){
 const ref=useRef<HTMLParagraphElement>(null);useEffect(()=>{ref.current?.focus();},[message]);
 return <p id="auth-error" ref={ref} role="alert" tabIndex={-1}>{message}</p>;
}
