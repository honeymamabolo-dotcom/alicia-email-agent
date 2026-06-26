require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.post('/webhook', async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are Alicia, a personal email assistant. Help the user manage their emails professionally and efficiently.',
    messages: [{ role: 'user', content: message }]
  });

  const reply = response.content[0].text;
  
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  
  res.type('text/xml');
  res.send(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Alicia is running!');
});
