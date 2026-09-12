import { getServerSideInfo } from '@/lib/firestore-server';
import PrivacyPolicyClient from '@/components/PrivacyPolicyClient';

export default async function PrivacyPolicyPage() {
  const storefront = 'LUNERA';
  let info = null;

  try {
    info = await getServerSideInfo('en', storefront);
  } catch (error) {
    console.error('Failed to fetch data for Privacy Policy page:', error);
  }

  return <PrivacyPolicyClient info={info} storefront={storefront} />;
}
