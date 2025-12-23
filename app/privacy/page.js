import { getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import PrivacyPolicyClient from '@/components/PrivacyPolicyClient';

export default async function PrivacyPolicyPage() {
  const language = 'en';
  const storefront = 'LUNERA';
  const headersList = headers();
  const market = await getMarketFromHeaders(headersList);

  // Fetch info for colors
  let info = null;

  try {
    info = await getServerSideInfo(language, storefront);
  } catch (error) {
    console.error('Failed to fetch data for Privacy Policy page:', error);
  }

  return <PrivacyPolicyClient info={info} storefront={storefront} />;
}






