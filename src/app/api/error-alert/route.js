import { Resend } from 'resend'

export async function POST(request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const WEBHOOK_SECRET = process.env.ERROR_ALERT_WEBHOOK_SECRET
  const secret = request.headers.get('x-webhook-secret')
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const record = payload.record
  if (!record) return Response.json({ ok: true })

  const { error_message, error_stack, component, route, display_name, user_id, created_at, metadata } = record

  const subject = `[Covey Error] ${(error_message ?? 'Unknown error').slice(0, 80)}`

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1c1917">
      <h2 style="color:#c4622d;margin-bottom:4px">New Error Detected</h2>
      <p style="color:#78716c;font-size:13px;margin-top:0">${new Date(created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr style="border-bottom:1px solid #e7e5e4">
          <td style="padding:8px 0;color:#78716c;width:110px;vertical-align:top">Message</td>
          <td style="padding:8px 0;font-weight:600;color:#c4622d">${error_message ?? '—'}</td>
        </tr>
        <tr style="border-bottom:1px solid #e7e5e4">
          <td style="padding:8px 0;color:#78716c;vertical-align:top">Route</td>
          <td style="padding:8px 0;font-family:monospace">${route ?? '—'}</td>
        </tr>
        <tr style="border-bottom:1px solid #e7e5e4">
          <td style="padding:8px 0;color:#78716c;vertical-align:top">Component</td>
          <td style="padding:8px 0">${component ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#78716c;vertical-align:top">User</td>
          <td style="padding:8px 0">${display_name ?? user_id ?? 'Anonymous'}</td>
        </tr>
      </table>

      ${error_stack ? `
        <h3 style="font-size:13px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Stack Trace</h3>
        <pre style="background:#f5f5f4;border-radius:8px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap;color:#44403c">${error_stack}</pre>
      ` : ''}

      ${metadata ? `
        <h3 style="font-size:13px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Metadata</h3>
        <pre style="background:#f5f5f4;border-radius:8px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap;color:#44403c">${JSON.stringify(metadata, null, 2)}</pre>
      ` : ''}

      <p style="margin-top:24px;font-size:12px;color:#a8a29e">
        <a href="https://admin.coveyspace.com/errors" style="color:#c4622d">View in Error Monitor →</a>
      </p>
    </div>
  `

  try {
    await resend.emails.send({
      from: 'Covey Space <alerts@coveyspace.com>',
      to: 'vuong.tran.dev@gmail.com',
      subject,
      html,
    })
  } catch (err) {
    console.error('Failed to send error alert email:', err)
    return Response.json({ error: 'Email send failed' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
