'use client';
import {useId} from 'react';
import {useApp} from './ui';
import type {ApplicationInput} from '../../lib/merchants/onboarding-validation';
type Contact=Omit<ApplicationInput,'pitch'>;
export function MerchantContactFields({value,onChange}:{value:Contact;onChange:(patch:Partial<Contact>)=>void}){
 const {t}=useApp(),id=useId();
 return <div className="k-collab-fields">
  <label htmlFor={id+'company'}>{t('Company name','公司名稱')}<input id={id+'company'} required maxLength={160} autoComplete="organization" value={value.companyName} onChange={e=>onChange({companyName:e.target.value})}/></label>
  <label htmlFor={id+'contact'}>{t('Contact name','聯絡人姓名')}<input id={id+'contact'} maxLength={160} autoComplete="name" value={value.contactName} onChange={e=>onChange({contactName:e.target.value})}/></label>
  <label htmlFor={id+'email'}>{t('Contact email','聯絡電郵')}<input id={id+'email'} required type="email" maxLength={254} autoComplete="email" value={value.contactEmail} onChange={e=>onChange({contactEmail:e.target.value})}/></label>
  <label htmlFor={id+'website'}>{t('Website (HTTPS, optional)','網站（HTTPS，選填）')}<input id={id+'website'} type="url" maxLength={2048} placeholder="https://" value={value.websiteUrl} onChange={e=>onChange({websiteUrl:e.target.value})}/></label>
 </div>;
}
