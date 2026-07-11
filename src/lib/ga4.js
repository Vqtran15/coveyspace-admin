import { BetaAnalyticsDataClient } from '@google-analytics/data'

let _client = null

export function getGA4Client() {
  if (!_client) {
    _client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL,
        private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    })
  }
  return _client
}

export const GA4_PROPERTY = `properties/${process.env.GA4_PROPERTY_ID}`
