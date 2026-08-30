import type { Metadata } from 'next';
import { Noto_Sans_SC } from 'next/font/google';
import './globals.css';

const notoSans = Noto_Sans_SC({ variable: '--font-app', subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Orbment · 导力器配装求解器',
  description: '《空之轨迹 the 2nd》本地导力器与魔法约束求解工具',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    title: 'Orbment 导力器配装求解器',
    description: '本地 · 可解释 · 约束求解',
    images: [{ url: '/og.png', width: 1600, height: 900, alt: 'Orbment 导力器配装求解器' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orbment 导力器配装求解器',
    description: '本地 · 可解释 · 约束求解',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={notoSans.variable}>{children}</body></html>;
}
