'use client';

import { useEffect, useState } from 'react';
import { getCountryName } from '@/lib/market-utils';

export default function UnavailablePage() {
  const [country, setCountry] = useState('Unknown');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get country from URL params
    const params = new URLSearchParams(window.location.search);
    const countryCode = params.get('country') || 'Unknown';
    setCountry(countryCode);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/unavailable-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, country }),
      });

      if (response.ok) {
        setSubmitted(true);
        setEmail('');
      }
    } catch (error) {
      console.error('Failed to submit email:', error);
    } finally {
      setLoading(false);
    }
  };

  const countryName = getCountryName(country);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-white via-secondary/40 to-white">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4 text-primary">
          We're not available in your region yet
        </h1>
        <p className="text-slate-600 mb-2">
          Your location: <strong className="text-primary">{countryName}</strong>
        </p>
        <p className="text-slate-600 mb-8">
          We currently ship to Finland and Germany only. We're working on expanding to more countries soon!
        </p>
        
        {/* Email signup form */}
        <div className="bg-white/90 backdrop-blur rounded-xl border border-secondary/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-primary">
            Get notified when we launch in {countryName}
          </h2>
          
          {submitted ? (
            <div className="text-green-600 font-medium py-4">
              Thank you! We'll notify you when we're available in {countryName}.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-secondary/70 rounded-lg focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Notify Me'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

