"use client";
import {useState} from 'react';
import {ArrowUpRight,Copy,Check} from 'lucide-react';
export function RetailerLink({url,className,label="Voir l’offre"}:{url:string;className?:string;label?:string}) {
 const [state,setState]=useState<'idle'|'copied'|'manual'>('idle');
 async function copy(){try{await navigator.clipboard.writeText(url);setState('copied');}catch{setState('manual');}}
 return <div className="retailer-actions mt-2 flex flex-col gap-2"><a href={url} target="_blank" rel="noopener noreferrer nofollow" className={className}>{label}<ArrowUpRight className="ml-1 inline h-3.5 w-3.5" aria-hidden/></a>
 <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-paper focus-visible:ring-2 focus-visible:ring-tag-deep" aria-label="Copier le lien du produit pour Safari">{state==='copied'?<Check className="h-3.5 w-3.5"/>:<Copy className="h-3.5 w-3.5"/>}{state==='copied'?'Lien copié':'Copier le lien'}</button>
 {state!=='idle' && <div className="max-w-sm text-xs text-ink-mute" role="status"><p>Si l’app Marjane reste sur son accueil, collez ce lien dans la barre d’adresse de Safari pour ouvrir le produit sur le site.</p>{state==='manual'&&<input aria-label="Lien du produit à copier" readOnly value={url} onFocus={e=>e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-paper-line bg-white p-2 text-ink"/>}</div>}</div>;
}
