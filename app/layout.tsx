import type React from 'react';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import 'katex/dist/katex.min.css';
import './globals.css';
import {
  SIXTHPHYSICS_OG_IMAGE_PATH,
  SIXTHPHYSICS_SITE_NAME,
  SIXTHPHYSICS_SITE_URL,
} from '@/lib/sixthphysics-web/seo';

const plusJakartaSans = localFont({
  src: './fonts/PlusJakartaSans-Variable.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ||
  'a997HG73eOQgA1nnNDURa54ag3BrtqOsbhcPJybAvZs';

const ROOT_DESCRIPTION =
  'Free pre-university physics practice bank with 7,643 solver-verified Paper 1 MCQ and Paper 2 structured questions, deterministic SVG diagrams, worked solutions, examiner mark schemes, timed mock exams, and PDF mock papers for IB Physics (2025 SL & HL), UK A-Level Physics (AQA 7408), and NCUK IFY Physics (IFYPH005).';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6FB' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1420' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SIXTHPHYSICS_SITE_URL),
  title: {
    default: 'SixthPhysics · IB, UK A-Level & NCUK IFY Physics Practice Bank',
    template: '%s · SixthPhysics',
  },
  description: ROOT_DESCRIPTION,
  applicationName: SIXTHPHYSICS_SITE_NAME,
  keywords: [
    'SixthPhysics',
    'IB Physics 2025 practice questions',
    'IB Physics SL HL question bank',
    'IB Physics Paper 1 MCQ',
    'IB Physics Paper 2 structured questions',
    'UK A-Level Physics practice questions',
    'AQA 7408 Physics question bank',
    'NCUK IFY Physics IFYPH005',
    'physics mock paper generator',
    'physics examiner mark schemes',
    'free physics revision questions',
  ],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: `${SIXTHPHYSICS_SITE_URL}/`,
    siteName: SIXTHPHYSICS_SITE_NAME,
    title: 'SixthPhysics · IB, UK A-Level & NCUK IFY Physics Practice Bank',
    description: ROOT_DESCRIPTION,
    images: [
      {
        url: SIXTHPHYSICS_OG_IMAGE_PATH,
        width: 1440,
        height: 900,
        alt: 'SixthPhysics interactive physics practice desk with deterministic diagrams and mark schemes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SixthPhysics · IB, UK A-Level & NCUK IFY Physics Practice Bank',
    description: ROOT_DESCRIPTION,
    images: [SIXTHPHYSICS_OG_IMAGE_PATH],
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: GOOGLE_SITE_VERIFICATION,
  },
};

const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('sixthphysics.theme')==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-[var(--sp-bg)] font-sans text-[var(--sp-ink)] antialiased selection:bg-blue-500/20">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
