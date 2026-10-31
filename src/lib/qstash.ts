import { Client, Receiver } from "@upstash/qstash";

const qstashToken = process.env.QSTASH_TOKEN;

export const qstash = qstashToken ? new Client({ token: qstashToken }) : null;

export async function verifyQStashSignature(
  signature: string | null | undefined,
  body: string
): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    // If QStash keys are not configured in environment, allow local/direct execution
    return true;
  }

  if (!signature) {
    return false;
  }

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}

export async function enqueueJob(
  endpoint: string,
  body: any,
  options?: { deduplicationId?: string; delay?: number }
): Promise<string | null> {
  if (!qstash) return null;

  try {
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://orders.universesraw.com"
    ).replace(/\/+$/, "");
    const destinationUrl = `${appUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const res = await qstash.publishJSON({
      url: destinationUrl,
      body,
      deduplicationId: options?.deduplicationId,
      delay: options?.delay,
    });
    return res.messageId || null;
  } catch (err) {
    console.warn(
      "[QStash] Enqueue failed (will fallback to immediate processing):",
      err
    );
    return null;
  }
}

