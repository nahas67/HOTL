import { Cockpit } from '@/components/cockpit';

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const requestedSection = section?.[0] ?? 'overview';
  return <Cockpit initialSection={requestedSection} />;
}
