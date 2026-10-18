import type { Metadata } from 'next';
import { ApartmentScreen } from '@/components/apartment/ApartmentScreen';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Your apartment' };

export default function ApartmentPage() {
  return <PageShell wide><ApartmentScreen /></PageShell>;
}
