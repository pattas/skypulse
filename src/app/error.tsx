'use client';

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Uncaught UI error', error);
  }, [error]);

  return (
    <main className="min-h-screen w-full bg-bg-primary text-text-primary flex items-center justify-center px-6">
      <section className="w-full max-w-md border border-border-subtle bg-bg-secondary/90 backdrop-blur-sm p-6">
        <h1 className="text-lg font-mono tracking-wide">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The application hit an unexpected rendering error.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 px-3 py-2 text-xs uppercase tracking-wider border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
