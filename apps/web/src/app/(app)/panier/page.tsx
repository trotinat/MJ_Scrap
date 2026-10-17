import { BasketPlanner } from '@/components/basket-planner';
import { PageHeader } from '@/components/ui';
import { basketCandidates } from '@/lib/queries';
export const metadata={title:'Mon panier malin'};
export default async function BasketPage(){const products=await basketCandidates();return <><PageHeader title="Mon panier malin" description="Regroupez vos achats utiles et estimez les économies conditionnelles, livraison comprise lorsqu’elle est connue."/><BasketPlanner products={products}/></>;}
