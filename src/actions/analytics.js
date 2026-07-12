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

// Converts GA4 date string 'YYYYMMDD' to 'YYYY-MM-DD'
function parseGaDate(d) {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

const APP  = 'app.coveyspace.com'
const LAND = 'www.coveyspace.com'

export async function loadGA4MetricsAction({ ga4Start = '30daysAgo', ga4End = 'today' } = {}) {
  await requireAuth()
  try {
    const client = getGA4Client()
    const dateRange = [{ startDate: ga4Start, endDate: ga4End }]

    const [
      appEventsResult,
      appUsers7dResult,
      appUsers30dResult,
      appTabsResult,
      appSignupMethodResult,
      appCountryResult,
      appCityResult,
      appDailyUsersResult,
      landUsersResult,
      landCtaResult,
      landCountryResult,
      landCityResult,
      landCtaByPageResult,
      landCtaByLocationResult,
      landDailyUsersResult,
      landChannelsResult,
      landAllEventsResult,
      landCtaSimpleResult,
    ] = await Promise.all([
      // App: feature event counts
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(
          hostFilter(APP),
          { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up', 'login', 'chat_message_sent', 'event_rsvp', 'push_notifications_enabled'] } } }
        ),
      }),
      // App: active users 7d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
      }),
      // App: active users 30d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
      }),
      // App: tab views by tab name
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'customEvent:tab_name' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(APP), eventNameFilter('tab_view')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // App: sign-up method breakdown
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'customEvent:method' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(APP), eventNameFilter('sign_up')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // App: active users by country
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
        orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
        limit: 10,
      }),
      // App: active users by city
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
        orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
        limit: 10,
      }),
      // App: daily active users (NEW)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(APP),
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // Landing: active users
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(LAND),
      }),
      // Landing: CTA clicks with page_path+click_text dimensions (GTM-based params)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'customEvent:page_path' }, { name: 'customEvent:click_text' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(LAND), eventNameFilter('cta_click')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // Landing: active users by country
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(LAND),
        orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
        limit: 10,
      }),
      // Landing: active users by city
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(LAND),
        orderBys: [{ desc: true, metric: { metricName: 'activeUsers' } }],
        limit: 10,
      }),
      // Landing: CTA clicks by page_path
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'customEvent:page_path' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(LAND), eventNameFilter('cta_click')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // Landing: CTA clicks by click_text
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'customEvent:click_text' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(LAND), eventNameFilter('cta_click')),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
      }),
      // Landing: daily active users (NEW)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: hostFilter(LAND),
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // Landing: traffic by marketing channel (NEW)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: hostFilter(LAND),
        orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
        limit: 10,
      }),
      // Landing: ALL event names — diagnostic to find the real CTA event name (NEW)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: hostFilter(LAND),
        orderBys: [{ desc: true, metric: { metricName: 'eventCount' } }],
        limit: 30,
      }),
      // Landing: cta_click count WITHOUT custom dimensions — tells us if the event fires at all (NEW)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: dateRange,
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: andFilter(hostFilter(LAND), eventNameFilter('cta_click')),
      }),
    ])

    const appEventMap = rowsToMap(appEventsResult[0].rows)

    function toList(result, valIndex = 0) {
      return (result[0].rows ?? [])
        .filter(r => r.dimensionValues[0].value && r.dimensionValues[0].value !== '(not set)')
        .map(r => ({ name: r.dimensionValues[0].value, count: parseInt(r.metricValues[valIndex].value, 10) }))
    }

    function toDailyList(result) {
      return (result[0].rows ?? []).map(r => ({
        date:  parseGaDate(r.dimensionValues[0].value),
        count: parseInt(r.metricValues[0].value, 10),
      }))
    }

    const tabs          = toList(appTabsResult)
    const signupMethods = toList(appSignupMethodResult)
    const appCountries  = toList(appCountryResult)
    const appCities     = toList(appCityResult)
    const landCountries = toList(landCountryResult)
    const landCities    = toList(landCityResult)
    const ctaByPage     = toList(landCtaByPageResult)
    const ctaByLocation = toList(landCtaByLocationResult)
    const channels      = toList(landChannelsResult)
    const allEvents     = toList(landAllEventsResult)

    const ctaClicks = (landCtaResult[0].rows ?? [])
      .filter(r => r.dimensionValues[0].value && r.dimensionValues[0].value !== '(not set)')
      .map(r => ({
        page:     r.dimensionValues[0].value,
        location: r.dimensionValues[1].value,
        count:    parseInt(r.metricValues[0].value, 10),
      }))

    const ctaTotalSimple = parseInt(
      landCtaSimpleResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10
    )

    return {
      data: {
        app: {
          activeUsers7d:      parseInt(appUsers7dResult[0].rows?.[0]?.metricValues?.[0]?.value  ?? '0', 10),
          activeUsers30d:     parseInt(appUsers30dResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10),
          signups30d:         appEventMap['sign_up']                    ?? 0,
          logins30d:          appEventMap['login']                      ?? 0,
          chatMessages30d:    appEventMap['chat_message_sent']          ?? 0,
          eventRsvps30d:      appEventMap['event_rsvp']                 ?? 0,
          pushOptIns30d:      appEventMap['push_notifications_enabled'] ?? 0,
          tabs,
          signupMethods,
          countries:   appCountries,
          cities:      appCities,
          dailyUsers:  toDailyList(appDailyUsersResult),
        },
        landing: {
          activeUsers30d: parseInt(landUsersResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10),
          ctaClicks,
          ctaByPage,
          ctaByLocation,
          ctaTotalSimple,  // cta_click count without custom-dimension filter — non-zero means event fires but params may differ
          countries:   landCountries,
          cities:      landCities,
          dailyUsers:  toDailyList(landDailyUsersResult),
          channels,
          allEvents,
        },
      },
    }
  } catch (e) {
    return { error: e.message }
  }
}
