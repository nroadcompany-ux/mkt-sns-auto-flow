'use client'
import {useEffect,useState} from 'react'
import {customerClient} from '@/lib/customer'
import LegacyStudio from './LegacyStudio'
export default function Studio(){
  const [allowed,setAllowed]=useState(false),[checked,setChecked]=useState(false)
  useEffect(()=>{let live=true;customerClient().then(c=>c.auth.getUser()).then(r=>{if(live){setAllowed(r.data.user?.app_metadata.mp_role==='operator');setChecked(true)}}).catch(()=>{if(live)setChecked(true)});return()=>{live=false}},[])
  if(!checked)return <main style={{padding:40}}>운영자 권한 확인 중…</main>
  if(!allowed)return <main style={{padding:40}}><h1>운영자 전용 제작 도구</h1><p>고객용 작업 공간에서 로그인해 주세요.</p><a href="/">고객용 작업 공간으로 →</a></main>
  return <LegacyStudio/>
}
