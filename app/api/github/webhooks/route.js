import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNATURE_HEADER = 'x-hub-signature-256';
const EVENT_HEADER = 'x-github-event';

function getWebhookSecret() {
  return (
    process.env.GH_WEBHOOK_SECRET ||
    process.env.GITHUB_WEBHOOK_SECRET ||
    process.env.WEBHOOK_SECRET ||
    ''
  );
}

function verifyGitHubSignature(rawBody, signatureHeader) {
  const secret = getWebhookSecret();

  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured in the environment.');
    return false;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    console.error('Missing or malformed GitHub signature header.');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const receivedSignature = signatureHeader.substring('sha256='.length);

  const bufferExpected = Buffer.from(expectedSignature, 'utf8');
  const bufferReceived = Buffer.from(receivedSignature, 'utf8');

  if (bufferExpected.length !== bufferReceived.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferExpected, bufferReceived);
}

function summarizeEvent(event, payload) {
  switch (event) {
    case 'ping':
      return 'GitHub ping webhook received.';
    case 'push':
      return `Push to ${payload?.ref} with ${payload?.commits?.length ?? 0} commits.`;
    case 'pull_request':
      return `Pull request ${payload?.action} (#${payload?.number}).`;
    default:
      return `Unhandled event: ${event}`;
  }
}

export async function POST(request) {
  try {
    const signatureHeader = request.headers.get(SIGNATURE_HEADER);
    const rawBody = await request.text();

    if (!verifyGitHubSignature(rawBody, signatureHeader)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get(EVENT_HEADER) || 'unknown';
    const payload = rawBody ? JSON.parse(rawBody) : {};

    console.log('[GitHub Webhook]', summarizeEvent(event, payload));

    switch (event) {
      case 'ping':
        return NextResponse.json({ ok: true, message: 'pong' });
      case 'push':
      case 'pull_request':
        // TODO: add CI/CD triggers, notifications, etc.
        break;
      default:
        // Leave as no-op for now.
        break;
    }

    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error('GitHub webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'GitHub webhook endpoint is active' });
}

