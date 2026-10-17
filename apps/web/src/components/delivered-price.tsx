"use client";
import { useState } from 'react';
import { formatMad } from '@/lib/format';
import { input } from './ui';
export function DeliveredPrice({priceCents,observedShipping}:{priceCents:number;observedShipping?:string}) {
 const [fee,setFee]=useState('');
 const n=Number(fee.replace(',','.'));
 const valid=fee.trim()!=='' && Number.isFinite(n) && n>=0 && n<=100000;
 return <div className="mt-4 rounded-xl border border-paper-line bg-paper p-3 text-sm"><p className="font-semibold">Combien vais-je payer ?</p><p className="mt-1 text-xs text-ink-mute">Livraison non incluse. Le montant final dépend de votre adresse et du vendeur.</p>{observedShipping && <p className="mt-2 text-xs">Livraison affichée lors de l’extraction : {observedShipping}. À reconfirmer pour votre adresse.</p>}<label className="mt-3 block text-xs">Frais confirmés sur Marjane Mall (DH)<input type="number" min="0" step="0.01" value={fee} onChange={e=>setFee(e.target.value)} className={input} placeholder="Inconnus"/></label><p className="mt-2 font-semibold" aria-live="polite">{valid?`Total estimé : ${formatMad(priceCents+Math.round(n*100))}`:'Total livré inconnu'}</p></div>;
}
