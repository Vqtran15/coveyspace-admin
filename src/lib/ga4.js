import { BetaAnalyticsDataClient } from '@google-analytics/data'

let _client = null

export function getGA4Client() {
  if (!_client) {
    const credentials = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY)
    _client = new BetaAnalyticsDataClient({ credentials })
  }
  return _client
}

export const GA4_PROPERTY = `properties/${process.env.GA4_PROPERTY_ID}`
