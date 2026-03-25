import { getServerSideInfo } from '@/lib/firestore-server';
import AboutUsClient from '@/components/AboutUsClient';

export default async function AboutUsPage() {
  const storefront = 'HEALTH';
  let info = null;

  try {
    info = await getServerSideInfo('en', storefront);
  } catch (error) {
    console.error('Failed to fetch info for About Us page:', error);
  }

  return <AboutUsClient info={info} storefront={storefront} />;
}
