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

export async function loadGA4MetricsAction() {
  await requireAuth()
  try {
    const client = getGA4Client()

    const [tabResult, eventResult, users7dResult, users30dResult] = await Promise.all([
      // Tab views by tab name (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'customEvent:tab_name' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'tab_view' } },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      }),
      // Feature event counts (30d)
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: ['sign_up', 'login', 'chat_message_sent', 'prayer_request_added', 'schedule_signup', 'push_notifications_enabled'],
            },
          },
        },
      }),
      // Active users 7d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
      }),
      // Active users 30d
      client.runReport({
        property: GA4_PROPERTY,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
      }),
    ])

    const eventMap = rowsToMap(eventResult[0].rows)

    const tabs = (tabResult[0].rows ?? [])
      .filter(r => r.dimensionValues[0].value !== '(not set)')
      .map(r => ({
        name: r.dimensionValues[0].value,
        count: parseInt(r.metricValues[0].value, 10),
      }))

    return {
      data: {
        activeUsers7d:      parseInt(users7dResult[0].rows?.[0]?.metricValues?.[0]?.value  ?? '0', 10),
        activeUsers30d:     parseInt(users30dResult[0].rows?.[0]?.metricValues?.[0]?.value ?? '0', 10),
        signups30d:         eventMap['sign_up']                    ?? 0,
        logins30d:          eventMap['login']                      ?? 0,
        chatMessages30d:    eventMap['chat_message_sent']          ?? 0,
        prayerRequests30d:  eventMap['prayer_request_added']       ?? 0,
        scheduleSignups30d: eventMap['schedule_signup']            ?? 0,
        pushOptIns30d:      eventMap['push_notifications_enabled'] ?? 0,
        tabs,
      },
    }
  } catch (e) {
    return { error: e.message }
  }
}
