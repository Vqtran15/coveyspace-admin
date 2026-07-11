'use server'

import { requireAuth } from '@/lib/session'
import { getGA4Client, GA4_PROPERTY } from '@/lib/ga4'

function rowsToMap(rows) {
  const map = {}
  for (const row of rows ?? []) {
    map[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value, 10)
  }
  return map
}

function hostFilter(host) {
  return { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: host } } }
}

function andFilter(...expressions) {
  return { andGroup: { expressions } }
}

function eventNameFilter(value) {
  return { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value } } }
}

const APP  = 'app.coveyspace.com'
const LAND = 'www.coveyspace.com'

export async function loadGA4MetricsAction() {
  await requireAuth()
  try {
    const client = getGA4Client()

    const [
      appEventsResult,
      appUsers7dResult,
      appUsers30dResult,
      appTabsResult,
      appSignupMethodResult,
      landUsersResult,
      landCtaResult,
    ] = await Promise.all([
      // App: feature event counts (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(
          hostFilter(APP),
          { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up', 'login', 'chat_message_sent', 'prayer_request_added', 'schedule_signup', 'push_notifications_enabled'] } } }
        ),
      }),
      // App: active users 7d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
      }),
      // App: active users 30d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
      }),
      // App: tab views by tab name (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'customEvent:tab_name' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(APP), eventNameFilter('tab_view')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // App: sign-up method breakdown (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'customEvent:method' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(APP), eventNameFilter('sign_up')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // Landing: active users 30d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(LAND),
      }),
      // Landing: CTA clicks by page + location (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'customEvent:page' }, { name: 'customEvent:location' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(LAND), eventNameFilter('cta_click')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
    ])

    const appEventMap = rowsToMap(appEventsResult[0].rows)

    const tabs = (appTabsResult[0].rows ?? [])
      .filter(r => r.dimensionValues[0].value !== '(not set)')
      .map(r => ({ name: r.dimensionValues[0].value, count: parseInt(r.metricValues[0].value, 10) }))

    const signupMethods = (appSignupMethodResult[0].rows ?? [])
      .filter(r => r.dimensionValues[0].value !== '(not set)')
      .map(r => ({ name: r.dimensionValues[0].value, count: parseInt(r.metricValues[0].value, 10) }))

    const ctaClicks = (landCtaResult[0].rows ?? [])
      .filter(r => r.dimensionValues[0].value !== '(not set)')
      .map(r => ({
        page:     r.dimensionValues[0].value,
        location: r.dimensionValues[1].value,
        count:    parseInt(r.metricValues[0].value, 10),
      }))

    return {
      data: {
        app: {
          activeUsers7d:      parseInt(appUsers7dResult[0].rows?.[0]?.metricValues?.[0]?.value  ?? '0', 10),
          activeUsers30d:     parseInt(appUsers30dResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10),
          signups30d:         appEventMap['sign_up']                    ?? 0,
          logins30d:          appEventMap['login']                      ?? 0,
          chatMessages30d:    appEventMap['chat_message_sent']          ?? 0,
          prayerRequests30d:  appEventMap['prayer_request_added']       ?? 0,
          scheduleSignups30d: appEventMap['schedule_signup']            ?? 0,
          pushOptIns30d:      appEventMap['push_notifications_enabled'] ?? 0,
          tabs,
          signupMethods,
        },
        landing: {
          activeUsers30d: parseInt(landUsersResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10),
          ctaClicks,
        },
      },
    }
  } catch (e) {
    return { error: e.message }
  }
}
