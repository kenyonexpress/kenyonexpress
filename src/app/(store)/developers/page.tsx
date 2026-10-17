// Partner API Documentation Page

import { PUBLIC_SCOPE_DESCRIPTIONS } from '@/lib/partner-api'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Partner API Documentation | KenyonExpress',
  description:
    'Integrate with KenyonExpress Partner API for read-only access to products, categories, and more.',
  robots: 'index, follow',
}

export default function DevelopersPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Partner API</h1>
          <p className="text-lg text-gray-600">
            Integrate with KenyonExpress to access product data, categories, and more
            programmatically.
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Getting Started</h2>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">1. Request API Access</h3>
            <p className="text-gray-700 mb-4">
              Contact our partner team to request API access. You'll need an approved partner
              account to generate API keys.
            </p>
            <a
              href="mailto:partners@kenyonexpress.co.il"
              className="inline-block px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold rounded"
            >
              Contact Partner Team
            </a>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">2. Generate API Key</h3>
            <p className="text-gray-700 mb-4">
              Once approved, access your partner dashboard to generate API keys with specific
              scopes.
            </p>
            <Link
              href="/account"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded"
            >
              Go to Dashboard
            </Link>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">3. Start Integrating</h3>
            <p className="text-gray-700">
              Use your API key to authenticate requests and access partner endpoints.
            </p>
          </div>
        </section>

        {/* Authentication */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Authentication</h2>

          <p className="text-gray-700 mb-6">
            All API requests must include your API key in the Authorization header:
          </p>

          <div className="bg-gray-900 text-gray-100 rounded-lg p-4 mb-6 font-mono text-sm overflow-x-auto">
            <pre>{'Authorization: Bearer ke_abc123...xyz789'}</pre>
          </div>

          <p className="text-gray-700">
            API keys are sensitive credentials. Keep them secure and never commit them to version
            control.
          </p>
        </section>

        {/* API Scopes */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">API Scopes</h2>

          <p className="text-gray-700 mb-8">
            Each API key has specific scopes that determine what data it can access. Scopes follow
            the format:
            <code className="bg-gray-100 px-2 py-1 rounded ms-2 font-mono">resource:action</code>
          </p>

          <div className="space-y-4">
            {Object.entries(PUBLIC_SCOPE_DESCRIPTIONS).map(([scope, description]) => (
              <div key={scope} className="border-l-4 border-yellow-400 ps-4 py-2">
                <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{scope}</code>
                <p className="text-gray-600 text-sm mt-1">{description}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-600 mt-8">
            Request additional scopes from the partner team if your integration requires them.
          </p>
        </section>

        {/* Endpoints */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Endpoints</h2>

          {/* Products */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-semibold">
                GET
              </span>
              <code className="font-mono">/api/partners/v1/products</code>
            </div>
            <p className="text-gray-700 mb-4">
              List all active and approved products. Returns paginated results with 20 items per
              page (max 100).
            </p>

            <div className="bg-gray-50 rounded p-4 mb-4">
              <h4 className="font-semibold text-gray-800 mb-3">Query Parameters</h4>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-mono font-semibold">page</dt>
                  <dd className="text-gray-600">Page number (default: 1)</dd>
                </div>
                <div>
                  <dt className="font-mono font-semibold">limit</dt>
                  <dd className="text-gray-600">Results per page (default: 20, max: 100)</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto mb-4">
              <pre>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://kenyonexpress.co.il/api/partners/v1/products?page=1&limit=20"`}</pre>
            </div>

            <div className="bg-gray-50 rounded p-4">
              <h4 className="font-semibold text-gray-800 mb-3">Response</h4>
              <div className="bg-gray-900 text-gray-100 rounded p-3 font-mono text-xs overflow-x-auto">
                <pre>{`{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "slug": "product-name",
      "name_he": "שם המוצר",
      "description_he": "תיאור המוצר",
      "price_agora": 10000,
      "platform_percent": 1500,
      "created_at": "2026-10-17T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}`}</pre>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <strong>Required Scope:</strong>{' '}
              <code className="font-mono bg-gray-100 px-2">products:read</code>
            </div>
          </div>

          {/* Categories */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-semibold">
                GET
              </span>
              <code className="font-mono">/api/partners/v1/categories</code>
            </div>
            <p className="text-gray-700 mb-4">List all active product categories.</p>

            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto mb-4">
              <pre>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://kenyonexpress.co.il/api/partners/v1/categories"`}</pre>
            </div>

            <div className="bg-gray-50 rounded p-4 mb-4">
              <h4 className="font-semibold text-gray-800 mb-3">Response</h4>
              <div className="bg-gray-900 text-gray-100 rounded p-3 font-mono text-xs overflow-x-auto">
                <pre>{`{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "slug": "category-slug",
      "name_he": "שם הקטגוריה",
      "description_he": "תיאור הקטגוריה",
      "created_at": "2026-10-17T12:00:00Z"
    }
  ],
  "total": 12
}`}</pre>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <strong>Required Scope:</strong>{' '}
              <code className="font-mono bg-gray-100 px-2">categories:read</code>
            </div>
          </div>
        </section>

        {/* Rate Limiting */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Rate Limiting</h2>

          <p className="text-gray-700 mb-6">
            Each API key has a rate limit to ensure fair usage. The default is 1,000 requests per
            hour per key.
          </p>

          <div className="bg-gray-50 rounded p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-4">Rate Limit Headers</h3>
            <dl className="space-y-3 text-sm font-mono">
              <div>
                <dt className="font-semibold">X-RateLimit-Limit</dt>
                <dd className="text-gray-600">Maximum requests per hour</dd>
              </div>
              <div>
                <dt className="font-semibold">X-RateLimit-Remaining</dt>
                <dd className="text-gray-600">Remaining requests in current hour</dd>
              </div>
              <div>
                <dt className="font-semibold">X-RateLimit-Reset</dt>
                <dd className="text-gray-600">ISO 8601 timestamp when limit resets</dd>
              </div>
            </dl>
          </div>

          <p className="text-gray-700 text-sm">
            When you exceed the rate limit, you'll receive a 429 (Too Many Requests) response. The
            limit resets each hour on the hour.
          </p>
        </section>

        {/* Error Handling */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Error Handling</h2>

          <p className="text-gray-700 mb-6">
            The API uses standard HTTP status codes to indicate success or failure:
          </p>

          <div className="space-y-4">
            <div className="border-l-4 border-green-500 ps-4 py-2">
              <div className="font-semibold text-gray-800">200 OK</div>
              <p className="text-gray-600 text-sm">Request succeeded</p>
            </div>
            <div className="border-l-4 border-red-500 ps-4 py-2">
              <div className="font-semibold text-gray-800">401 Unauthorized</div>
              <p className="text-gray-600 text-sm">Missing or invalid API key</p>
            </div>
            <div className="border-l-4 border-orange-500 ps-4 py-2">
              <div className="font-semibold text-gray-800">403 Forbidden</div>
              <p className="text-gray-600 text-sm">API key lacks required scope</p>
            </div>
            <div className="border-l-4 border-yellow-500 ps-4 py-2">
              <div className="font-semibold text-gray-800">429 Too Many Requests</div>
              <p className="text-gray-600 text-sm">Rate limit exceeded</p>
            </div>
            <div className="border-l-4 border-red-600 ps-4 py-2">
              <div className="font-semibold text-gray-800">500 Internal Server Error</div>
              <p className="text-gray-600 text-sm">
                Server error (rare, retry with exponential backoff)
              </p>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Best Practices</h2>

          <ul className="space-y-4 text-gray-700">
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Store API keys securely in environment variables, never in source code</span>
            </li>
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Implement exponential backoff for retries on 5xx errors</span>
            </li>
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Cache responses when appropriate to minimize API calls</span>
            </li>
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Monitor X-RateLimit headers to avoid hitting limits</span>
            </li>
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Use specific scopes for each integration (principle of least privilege)</span>
            </li>
            <li className="flex gap-3">
              <span className="text-yellow-500 font-bold flex-shrink-0">•</span>
              <span>Rotate API keys periodically for security</span>
            </li>
          </ul>
        </section>

        {/* Support */}
        <section className="bg-blue-50 rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Need Help?</h2>

          <p className="text-gray-700 mb-6">
            If you have questions about the Partner API or need technical support:
          </p>

          <div className="space-y-3">
            <p className="text-gray-700">
              <strong>Email:</strong>{' '}
              <a
                href="mailto:api-support@kenyonexpress.co.il"
                className="text-blue-600 hover:underline"
              >
                api-support@kenyonexpress.co.il
              </a>
            </p>
            <p className="text-gray-700">
              <strong>Partner Portal:</strong>{' '}
              <Link href="/account" className="text-blue-600 hover:underline">
                Access Your Dashboard
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
