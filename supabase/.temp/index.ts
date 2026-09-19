import nodemailer from "npm:nodemailer@6.9.14"

// Set these with `supabase secrets set ...` — see SUPABASE_EMAIL_SETUP.md
const GMAIL_USER = Deno.env.get("GMAIL_USER")
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") || "michalpresz@gmail.com"
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  // Database Webhooks don't send a Supabase user JWT, so we check a shared
  // secret header instead (set the same value in the webhook config and in
  // the WEBHOOK_SECRET secret). This stops randoms from spamming your inbox
  // by calling the function URL directly.
  if (WEBHOOK_SECRET) {
    const incomingSecret = req.headers.get("x-webhook-secret")
    if (incomingSecret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { table, record } = payload || {}

  if (!transporter) {
    console.warn("Email not sent: GMAIL_USER / GMAIL_APP_PASSWORD secrets are not set")
    return new Response("Email disabled (missing credentials)", { status: 200 })
  }

  try {
    if (table === "posts") {
      await transporter.sendMail({
        from: GMAIL_USER,
        to: NOTIFY_EMAIL,
        subject: `New post submitted: ${record.title}`,
        text: `A new post was submitted on the blog.\n\nTitle: ${record.title}\n\n${record.content}\n\nStatus: ${record.status}\nDate: ${record.date}\n\n(Posts start as "pending" until you approve them.)`,
      })
    } else if (table === "comments") {
      await transporter.sendMail({
        from: GMAIL_USER,
        to: NOTIFY_EMAIL,
        subject: `New comment on post #${record.post_id}`,
        text: `${record.author} left a comment on post #${record.post_id}:\n\n${record.content}\n\nStatus: ${record.status}\nDate: ${record.date}\n\n(Comments start as "pending" until you approve them.)`,
      })
    } else {
      console.log("Ignoring webhook for unrecognized table:", table)
    }
  } catch (err) {
    console.error("Failed to send email:", err)
    return new Response("Email failed", { status: 500 })
  }

  return new Response("ok", { status: 200 })
})
