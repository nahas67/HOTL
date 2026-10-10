import type { Metadata } from 'next';
import './tokens.css';
import './globals.css';
import './operating.css';
import './design-system.css';

export const metadata: Metadata = {
  title: 'HOTL — Owner cockpit',
  description: 'Your autonomous commerce team, with you in control.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
