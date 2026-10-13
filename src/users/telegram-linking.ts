import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;

export interface IssuedLinkChallenge {
  code: string;
  expiresAt: Date;
}

export type ConsumeLinkResult =
  | { status: "linked" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "already_linked" };

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Call only from an authenticated account session. The raw code is returned once;
 * only its SHA-256 hash is persisted. Never log or send it to application logs.
 */
export async function issueTelegramLinkChallenge(
  pool: Pool,
  userId: string,
  now = new Date(),
): Promise<IssuedLinkChallenge> {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  await pool.query(
    `INSERT INTO telegram_link_challenges (user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashCode(code), expiresAt, now],
  );

  return { code, expiresAt };
}

/** Atomically consumes a one-time challenge and links the Telegram identity. */
export async function consumeTelegramLinkChallenge(
  pool: Pool,
  input: { code: string; telegramUserId: string; username?: string | null },
  now = new Date(),
): Promise<ConsumeLinkResult> {
  if (!CODE_PATTERN.test(input.code) || !/^[1-9]\d{0,19}$/.test(input.telegramUserId)) {
    return { status: "invalid" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const challengeResult = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, consumed_at
       FROM telegram_link_challenges
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashCode(input.code)],
    );

    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.consumed_at) {
      await client.query("ROLLBACK");
      return { status: "invalid" };
    }

    if (new Date(challenge.expires_at).getTime() <= now.getTime()) {
      await client.query(
        "DELETE FROM telegram_link_challenges WHERE id = $1",
        [challenge.id],
      );
      await client.query("COMMIT");
      return { status: "expired" };
    }

    const existing = await client.query<{ user_id: string; telegram_user_id: string }>(
      `SELECT user_id, telegram_user_id
       FROM telegram_identities
       WHERE telegram_user_id = $1 OR user_id = $2
       FOR UPDATE`,
      [input.telegramUserId, challenge.user_id],
    );

    if (existing.rows.some((row) => row.user_id !== challenge.user_id || row.telegram_user_id !== input.telegramUserId)) {
      await client.query("ROLLBACK");
      return { status: "already_linked" };
    }

    await client.query(
      `INSERT INTO telegram_identities (telegram_user_id, user_id, username)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_user_id) DO UPDATE
       SET username = EXCLUDED.username`,
      [input.telegramUserId, challenge.user_id, input.username?.slice(0, 64) ?? null],
    );

    await client.query(
      "UPDATE telegram_link_challenges SET consumed_at = $2 WHERE id = $1",
      [challenge.id, now],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
       VALUES ($1, 'telegram_identity_linked', 'telegram_identity', $2, $3::jsonb)`,
      [challenge.user_id, input.telegramUserId, JSON.stringify({ source: "telegram_challenge" })],
    );

    await client.query("COMMIT");
    return { status: "linked" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
