import { useState } from 'react';

export default function App() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const verifyEmail = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ status: 'error', reason: 'Unable to reach backend' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-2">IntelSnap Email Verifier</h1>
        <p className="text-lg text-gray-600 mb-6">
          Instantly verify if an email address is valid, risky, or disposable before you send.
        </p>
        <div className="bg-white shadow-xl rounded-xl p-8 border border-gray-200">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Enter email (e.g. john@company.com)"
            className="w-full border p-3 rounded mb-4"
          />
          <button
            onClick={verifyEmail}
            disabled={!email || loading}
            className="bg-blue-600 text-white w-full py-2 rounded hover:bg-blue-700"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
          {result && (
            <div className="mt-6 p-4 rounded bg-gray-100">
              <p className="font-bold text-lg uppercase">{result.status}</p>
              <p className="text-gray-700">{result.reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}