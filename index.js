    require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REDIRECT_URI = 'https://alicia-email-agent-production.up.railway.app/auth/callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  REDIRECT_URI
);

const tokens = {};

app.get('/auth/gmail', (req, res) => {
  const account = req.query.account || '1';
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    state: account,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const { tokens: t } = await oauth2Client.getToken(code);
  tokens[state] = t;
  console.log(`Account ${state} refresh token:`, t.refresh_token);
  res.send(`✅ Gmail account ${state} connected! Refresh token: ${t.refresh_token}`);
});

async function getEmails(accountNum) {
  const token = tokens[accountNum];
  if (!token) return 'Account not connected yet.';
  oauth2Client.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const list = await gmail.users.messages.list({ userId: 'me', maxResults: 5, q: 'is:unread' });
  if (!list.data.messages) return 'No unread emails.';
  const emails = await Promise.all(list.data.messages.map(async (m) => {
    const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From'] });
    const headers = msg.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    return `From: ${from}\nSubject: ${subject}`;
  }));
  return emails.join('\n\n');
}

app.post('/webhook', async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;

  let emailContext = '';
  if (message.toLowerCase().includes('email') || message.toLowerCase().includes('inbox')) {
    emailContext = await getEmails('1');
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are Alicia, a personal AI email assistant. You help manage emails via WhatsApp.${emailContext ? ' Here are the latest emails:\n' + emailContext : ''}`,
    messages: [{ role: 'user', content: message }]
  });

  const reply = response.content[0].text;
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Alicia running on port ${PORT}`));

