"use client";
import { useState } from 'react';
import Link from 'next/link';
import { estimateBasket } from '@mdw/shared';
import { formatMad } from '@/lib/format';
import { input } from './ui';
export interface BasketProduct {id:string;title:string;priceCents:number;eligible:boolean;}
export function BasketPlanner({products}:{products:BasketProduct[]}) {
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [shipping,setShipping]=useState('');
 const parsed = Number(shipping.replace(',','.'));
 const shippingCents = shipping.trim() && Number.isFinite(parsed) && parsed>=0 ? Math.round(parsed*100) : null;
 const estimate=estimateBasket(products.map(p=>({...p,quantity:quantities[p.id]??0})),shippingCents);
 return <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
  <div className="space-y-3">{products.length ? products.map(p=><label key={p.id} className="flex items-center gap-3 rounded-2xl border border-paper-line bg-paper-card p-4"><input type="checkbox" checked={!!quantities[p.id]} onChange={e=>setQuantities({...quantities,[p.id]:e.target.checked?1:0})} className="h-5 w-5 accent-emerald-900"/><span className="min-w-0 flex-1"><Link href={`/produits/${p.id}`} className="text-sm font-semibold hover:underline">{p.title}</Link><span className="mt-1 block text-xs text-ink-mute">{p.eligible?'Éligibilité observée sur Panier Malin':'Éligibilité non confirmée · sans remise supplémentaire'}</span></span><strong className="whitespace-nowrap text-sm">{formatMad(p.priceCents)}</strong></label>):<p>Aucun produit récent collecté. Les prochaines collectes découvriront aussi la sélection Panier Malin.</p>}</div>
  <aside className="rounded-2xl border border-paper-line bg-paper-card p-5 lg:sticky lg:top-6"><h2 className="font-display text-2xl font-bold">Votre estimation</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt>Articles sélectionnés</dt><dd>{formatMad(estimate.subtotalCents)}</dd></div><div className="flex justify-between text-proof"><dt>Remise conditionnelle</dt><dd>−{formatMad(estimate.discountCents)}</dd></div><div className="flex justify-between font-semibold"><dt>Articles après remise</dt><dd>{formatMad(estimate.merchandiseCents)}</dd></div></dl>
  {estimate.remainingCents>0 && <p className="mt-4 text-sm text-ink-mute">Encore {formatMad(estimate.remainingCents)} d’articles éligibles pour atteindre 300 DH. Ajoutez uniquement ce dont vous avez besoin.</p>}
  <label className="mt-5 block text-sm">Livraison totale confirmée par vos soins (DH)<input className={input} type="number" min="0" step="0.01" value={shipping} onChange={e=>setShipping(e.target.value)} placeholder="Inconnue"/></label>
  <p className="mt-4 font-semibold">{estimate.totalCents===null?'Total livré inconnu':`Total estimé : ${formatMad(estimate.totalCents)}`}</p><p className="mt-3 text-xs text-ink-mute">Simulation, sans commande. Offre de −10 % dès 300 DH de produits éligibles ; validité et application à confirmer sur Marjane Mall. Aucun cumul de coupons supposé. Les frais peuvent varier selon l’adresse et les vendeurs.</p><a className="mt-4 inline-block text-sm text-tag-deep underline" href="https://www.marjanemall.ma/panier-malin" target="_blank" rel="noopener noreferrer">Consulter les conditions actuelles</a></aside>
 </div>;
}
