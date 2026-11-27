import { Pool } from "pg";
import { MAX_USER_MEMORIES, MAX_USER_MEMORY_CHARS } from "@/lib/user-memory";
import type { ComposioPendingAction } from "@/lib/composio";

type UserChatData = {
  history: unknown[];
  usageMonth: string;
  usageCount: number;
};

export type UserAccountData = {
  planKey: string;
  firstName: string;
  surname: string;
  country: string;
  phoneCountry: string;
  phoneNumber: string;
};

export type GoogleConnectionRecord = {
  email: string;
  encryptedTokens: string;
};

export type GooglePendingAction = {
  type: "gmail.create_draft" | "calendar.create_event";
  arguments: Record<string, unknown>;
};

export type UserMemory = {
  id: string;
  memory: string;
  createdAt: string;
};

const globalForPostgres = globalThis as typeof globalThis & {
  tellerPostgresPool?: Pool;
  tellerPostgresSchema?: Promise<void>;
  tellerCyberAgentPostgresPool?: Pool;
  tellerCyberAgentPostgresSchema?: Promise<void>;
};

function getPool() {
  if (!globalForPostgres.tellerPostgresPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured.");
    globalForPostgres.tellerPostgresPool = new Pool({ connectionString, max: 5 });
  }
  return globalForPostgres.tellerPostgresPool;
}

function getCyberAgentPool() {
  if (!globalForPostgres.tellerCyberAgentPostgresPool) {
    const connectionString = process.env.CYBERMAIL_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("CYBERMAIL_DATABASE_URL or DATABASE_URL must be configured.");
    }
    globalForPostgres.tellerCyberAgentPostgresPool = new Pool({ connectionString, max: 5 });
  }
  return globalForPostgres.tellerCyberAgentPostgresPool;
}

async function deleteUserRows(pool: Pool, userId: string, statements: string[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement, [userId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  if (!globalForPostgres.tellerPostgresSchema) {
    globalForPostgres.tellerPostgresSchema = getPool().query(`
      CREATE TABLE IF NOT EXISTS teller_user_chat_data (
        user_id TEXT PRIMARY KEY,
        usage_month TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_chat_media (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          history_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          media_data BYTEA NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_user_voice_prompts (
          user_id TEXT PRIMARY KEY,
          file_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          media_data BYTEA NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_shared_voice_prompt (
          id TEXT PRIMARY KEY CHECK (id = 'shared'),
          file_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          media_data BYTEA NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_user_daily_image_usage (
          user_id TEXT NOT NULL,
          usage_date DATE NOT NULL,
          usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, usage_date)
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_user_accounts (
          user_id TEXT PRIMARY KEY,
          plan_key TEXT NOT NULL DEFAULT 'free',
          first_name TEXT NOT NULL DEFAULT '',
          surname TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          phone_country TEXT NOT NULL DEFAULT '',
          phone_number TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_user_profile_pictures (
          user_id TEXT PRIMARY KEY,
          content_type TEXT NOT NULL,
          media_data BYTEA NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_user_memories (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          memory TEXT NOT NULL CHECK (char_length(memory) <= ${MAX_USER_MEMORY_CHARS}),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE INDEX IF NOT EXISTS teller_chat_media_user_history_idx
        ON teller_chat_media (user_id, history_id)
      `);
      await getPool().query(`
        CREATE UNIQUE INDEX IF NOT EXISTS teller_user_memories_user_memory_idx
        ON teller_user_memories (user_id, lower(memory))
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_google_connections (
          user_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          encrypted_tokens TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_google_oauth_states (
          state_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          return_to TEXT NOT NULL DEFAULT '/chat?agent=cyber',
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_google_pending_actions (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          action JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS teller_composio_pending_actions (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          action JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
    });
  }
  await globalForPostgres.tellerPostgresSchema;
}

async function ensureCyberAgentSchema() {
  if (!globalForPostgres.tellerCyberAgentPostgresSchema) {
    globalForPostgres.tellerCyberAgentPostgresSchema = getCyberAgentPool().query(`
      CREATE TABLE IF NOT EXISTS teller_google_connections (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        encrypted_tokens TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(async () => {
      await getCyberAgentPool().query(`
        CREATE TABLE IF NOT EXISTS teller_google_oauth_states (
          state_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          return_to TEXT NOT NULL DEFAULT '/chat?agent=cyber',
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await getCyberAgentPool().query(`
        ALTER TABLE teller_google_oauth_states
        ADD COLUMN IF NOT EXISTS return_to TEXT NOT NULL DEFAULT '/chat?agent=cyber'
      `);
      await getCyberAgentPool().query(`
        CREATE TABLE IF NOT EXISTS teller_google_pending_actions (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          action JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
    }).catch((error: unknown) => {
      globalForPostgres.tellerCyberAgentPostgresSchema = undefined;
      throw error;
    });
  }
  await globalForPostgres.tellerCyberAgentPostgresSchema;
}

export async function saveGoogleOAuthState(
  stateHash: string,
  userId: string,
  returnTo: "/settings" | "/chat?agent=cyber" = "/chat?agent=cyber",
) {
  await ensureCyberAgentSchema();
  await getCyberAgentPool().query(
    "INSERT INTO teller_google_oauth_states (state_hash, user_id, return_to, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')",
    [stateHash, userId, returnTo],
  );
}

export async function consumeGoogleOAuthState(stateHash: string) {
  await ensureCyberAgentSchema();
  const result = await getCyberAgentPool().query<{ user_id: string; return_to: string }>(
    "DELETE FROM teller_google_oauth_states WHERE state_hash = $1 AND expires_at > NOW() RETURNING user_id, return_to",
    [stateHash],
  );
  const row = result.rows[0];
  return row ? { userId: row.user_id, returnTo: row.return_to } : null;
}

export async function saveGoogleConnection(
  userId: string,
  email: string,
  encryptedTokens: string,
) {
  await ensureCyberAgentSchema();
  await getCyberAgentPool().query(
    `
      INSERT INTO teller_google_connections (user_id, email, encrypted_tokens, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_tokens = EXCLUDED.encrypted_tokens,
        updated_at = NOW()
    `,
    [userId, email, encryptedTokens],
  );
}

export async function getGoogleConnection(userId: string): Promise<GoogleConnectionRecord | null> {
  await ensureCyberAgentSchema();
  const result = await getCyberAgentPool().query<{
    email: string;
    encrypted_tokens: string;
  }>(
    "SELECT email, encrypted_tokens FROM teller_google_connections WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  return row ? { email: row.email, encryptedTokens: row.encrypted_tokens } : null;
}

export async function deleteGoogleConnection(userId: string) {
  await ensureCyberAgentSchema();
  await getCyberAgentPool().query("DELETE FROM teller_google_connections WHERE user_id = $1", [userId]);
}

export async function createGooglePendingAction(
  userId: string,
  action: GooglePendingAction,
) {
  await ensureCyberAgentSchema();
  const id = crypto.randomUUID();
  await getCyberAgentPool().query(
    "INSERT INTO teller_google_pending_actions (id, user_id, action, expires_at) VALUES ($1, $2, $3::jsonb, NOW() + INTERVAL '10 minutes')",
    [id, userId, JSON.stringify(action)],
  );
  return id;
}

export async function consumeGooglePendingAction(userId: string, id: string) {
  await ensureCyberAgentSchema();
  const result = await getCyberAgentPool().query<{ action: GooglePendingAction }>(
    "DELETE FROM teller_google_pending_actions WHERE id = $1 AND user_id = $2 AND expires_at > NOW() RETURNING action",
    [id, userId],
  );
  return result.rows[0]?.action ?? null;
}

export async function createComposioPendingAction(
  userId: string,
  action: ComposioPendingAction,
) {
  await ensureSchema();
  const id = crypto.randomUUID();
  await getPool().query("DELETE FROM teller_composio_pending_actions WHERE expires_at <= NOW()");
  await getPool().query(
    "INSERT INTO teller_composio_pending_actions (id, user_id, action, expires_at) VALUES ($1, $2, $3::jsonb, NOW() + INTERVAL '10 minutes')",
    [id, userId, JSON.stringify(action)],
  );
  return id;
}

export async function consumeComposioPendingAction(userId: string, id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM teller_composio_pending_actions WHERE expires_at <= NOW()");
  const result = await getPool().query<{ action: ComposioPendingAction }>(
    "DELETE FROM teller_composio_pending_actions WHERE id = $1 AND user_id = $2 AND expires_at > NOW() RETURNING action",
    [id, userId],
  );
  return result.rows[0]?.action ?? null;
}

function currentUsageMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getCurrentUsageDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function getUserAccountData(userId: string): Promise<UserAccountData> {
  await ensureSchema();
  const result = await getPool().query<{
    plan_key: string;
    first_name: string;
    surname: string;
    country: string;
    phone_country: string;
    phone_number: string;
  }>(
    `
      SELECT plan_key, first_name, surname, country, phone_country, phone_number
      FROM teller_user_accounts
      WHERE user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0];
  return row
    ? {
        planKey: row.plan_key,
        firstName: row.first_name,
        surname: row.surname,
        country: row.country,
        phoneCountry: row.phone_country,
        phoneNumber: row.phone_number,
      }
    : {
        planKey: "free",
        firstName: "",
        surname: "",
        country: "",
        phoneCountry: "",
        phoneNumber: "",
      };
}

export async function deleteUserAccountData(userId: string) {
      await ensureSchema();
      await ensureCyberAgentSchema();

      await deleteUserRows(getPool(), userId, [
        "DELETE FROM teller_chat_media WHERE user_id = $1",
        "DELETE FROM teller_user_voice_prompts WHERE user_id = $1",
        "DELETE FROM teller_user_daily_image_usage WHERE user_id = $1",
        "DELETE FROM teller_user_memories WHERE user_id = $1",
        "DELETE FROM teller_user_profile_pictures WHERE user_id = $1",
        "DELETE FROM teller_user_chat_data WHERE user_id = $1",
        "DELETE FROM teller_user_accounts WHERE user_id = $1",
        "DELETE FROM teller_google_connections WHERE user_id = $1",
        "DELETE FROM teller_google_oauth_states WHERE user_id = $1",
        "DELETE FROM teller_google_pending_actions WHERE user_id = $1",
        "DELETE FROM teller_composio_pending_actions WHERE user_id = $1",
      ]);
      await deleteUserRows(getCyberAgentPool(), userId, [
        "DELETE FROM teller_google_connections WHERE user_id = $1",
        "DELETE FROM teller_google_oauth_states WHERE user_id = $1",
        "DELETE FROM teller_google_pending_actions WHERE user_id = $1",
      ]);
}

export async function getAllUserAccountData() {
      await ensureSchema();
      const result = await getPool().query<{
        user_id: string;
        plan_key: string;
        first_name: string;
        surname: string;
        country: string;
        phone_number: string;
        updated_at: Date;
      }>(`
        SELECT user_id, plan_key, first_name, surname, country, phone_number, updated_at
        FROM teller_user_accounts
      `);
      return result.rows.map((row) => ({
        userId: row.user_id,
        planKey: row.plan_key,
        firstName: row.first_name,
        surname: row.surname,
        country: row.country,
        phoneNumber: row.phone_number,
        updatedAt: row.updated_at,
      }));
}

export async function updateUserAccountProfile(
  userId: string,
  profile: Pick<UserAccountData, "firstName" | "surname" | "country" | "phoneCountry" | "phoneNumber">,
) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_accounts (
        user_id, first_name, surname, country, phone_country, phone_number, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        surname = EXCLUDED.surname,
        country = EXCLUDED.country,
        phone_country = EXCLUDED.phone_country,
        phone_number = EXCLUDED.phone_number,
        updated_at = NOW()
    `,
    [userId, profile.firstName, profile.surname, profile.country, profile.phoneCountry, profile.phoneNumber],
  );
}

export async function getUserProfilePicture(userId: string) {
  await ensureSchema();
  const result = await getPool().query<{ content_type: string; media_data: Buffer }>(
    "SELECT content_type, media_data FROM teller_user_profile_pictures WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  return row ? { contentType: row.content_type, mediaData: row.media_data } : null;
}

export async function saveUserProfilePicture(userId: string, mediaData: Buffer) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_profile_pictures (user_id, content_type, media_data, updated_at)
      VALUES ($1, 'image/webp', $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        media_data = EXCLUDED.media_data,
        updated_at = NOW()
    `,
    [userId, mediaData],
  );
}

export async function deleteUserProfilePicture(userId: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM teller_user_profile_pictures WHERE user_id = $1", [userId]);
}

export async function updateUserAccountPlan(userId: string, planKey: string) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_accounts (user_id, plan_key, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        plan_key = EXCLUDED.plan_key,
        updated_at = NOW()
    `,
    [userId, planKey],
  );
}

export async function getUserDailyImageUsage(userId: string, usageDate = getCurrentUsageDate()) {
  await ensureSchema();
  const result = await getPool().query<{ usage_count: number }>(
    "SELECT usage_count FROM teller_user_daily_image_usage WHERE user_id = $1 AND usage_date = $2",
    [userId, usageDate],
  );
  return result.rows[0]?.usage_count ?? 0;
}

export async function reserveUserDailyImageGeneration(
  userId: string,
  limit: number,
  usageDate = getCurrentUsageDate(),
) {
  await ensureSchema();
  const result = await getPool().query<{ usage_count: number }>(
    `
      INSERT INTO teller_user_daily_image_usage (user_id, usage_date, usage_count, updated_at)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (user_id, usage_date) DO UPDATE SET
        usage_count = teller_user_daily_image_usage.usage_count + 1,
        updated_at = NOW()
      WHERE teller_user_daily_image_usage.usage_count < $3
      RETURNING usage_count
    `,
    [userId, usageDate, limit],
  );
  return result.rows[0]?.usage_count ?? null;
}

export async function releaseUserDailyImageGeneration(userId: string, usageDate: string) {
  await ensureSchema();
  await getPool().query(
    `
      UPDATE teller_user_daily_image_usage
      SET usage_count = GREATEST(usage_count - 1, 0), updated_at = NOW()
      WHERE user_id = $1 AND usage_date = $2
    `,
    [userId, usageDate],
  );
}

export async function getUserChatData(userId: string): Promise<UserChatData | null> {
  await ensureSchema();
  const result = await getPool().query<{
    history: unknown[];
    usage_month: string;
    usage_count: number;
  }>(
    "SELECT history, usage_month, usage_count FROM teller_user_chat_data WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    history: Array.isArray(row.history) ? row.history : [],
    usageMonth: row.usage_month,
    usageCount: row.usage_count,
  };
}

export async function saveUserChatHistory(userId: string, history: unknown[]) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_chat_data (user_id, usage_month, history, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET history = EXCLUDED.history, updated_at = NOW()
    `,
    [userId, currentUsageMonth(), JSON.stringify(history)],
  );
}

export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    memory: string;
    created_at: Date;
  }>(
    `
      SELECT id, memory, created_at
      FROM teller_user_memories
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [userId, MAX_USER_MEMORIES],
  );
  return result.rows.map((row) => ({
    id: row.id,
    memory: row.memory,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function addUserMemory(
  userId: string,
  memory: string,
): Promise<"saved" | "duplicate" | "limit"> {
  await ensureSchema();
  const existing = await getPool().query<{ id: string }>(
    "SELECT id FROM teller_user_memories WHERE user_id = $1 AND lower(memory) = lower($2) LIMIT 1",
    [userId, memory],
  );
  if (existing.rows.length) return "duplicate";

  const count = await getPool().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM teller_user_memories WHERE user_id = $1",
    [userId],
  );
  if (Number(count.rows[0]?.count || 0) >= MAX_USER_MEMORIES) return "limit";

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO teller_user_memories (id, user_id, memory)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [crypto.randomUUID(), userId, memory],
  );
  return result.rows.length ? "saved" : "duplicate";
}

export async function deleteUserMemory(userId: string, memoryId: string) {
  await ensureSchema();
  const result = await getPool().query(
    "DELETE FROM teller_user_memories WHERE user_id = $1 AND id = $2",
    [userId, memoryId],
  );
  return (result.rowCount || 0) > 0;
}

export async function deleteAllUserMemories(userId: string) {
  await ensureSchema();
  const result = await getPool().query(
    "DELETE FROM teller_user_memories WHERE user_id = $1",
    [userId],
  );
  return result.rowCount || 0;
}

export async function saveUserChatMedia(
  userId: string,
  historyId: string,
  fileName: string,
  contentType: string,
  mediaData: Buffer,
) {
  await ensureSchema();
  const mediaId = crypto.randomUUID();
  await getPool().query(
    `
      INSERT INTO teller_chat_media (id, user_id, history_id, file_name, content_type, file_size, media_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [mediaId, userId, historyId, fileName, contentType, mediaData.length, mediaData],
  );
  return mediaId;
}

export async function saveUserVoicePrompt(
  userId: string,
  fileName: string,
  contentType: string,
  mediaData: Buffer,
) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_voice_prompts (user_id, file_name, content_type, file_size, media_data, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        content_type = EXCLUDED.content_type,
        file_size = EXCLUDED.file_size,
        media_data = EXCLUDED.media_data,
        updated_at = NOW()
    `,
    [userId, fileName, contentType, mediaData.length, mediaData],
  );
}

export async function getUserVoicePrompt(userId: string) {
  await ensureSchema();
  const result = await getPool().query<{
    file_name: string;
    content_type: string;
    file_size: number;
    media_data: Buffer;
  }>(
    "SELECT file_name, content_type, file_size, media_data FROM teller_user_voice_prompts WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  return row
    ? {
        fileName: row.file_name,
        contentType: row.content_type,
        fileSize: row.file_size,
        mediaData: row.media_data,
      }
    : null;
}

export async function saveSharedVoicePrompt(
  fileName: string,
  contentType: string,
  mediaData: Buffer,
) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_shared_voice_prompt (id, file_name, content_type, file_size, media_data, updated_at)
      VALUES ('shared', $1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        content_type = EXCLUDED.content_type,
        file_size = EXCLUDED.file_size,
        media_data = EXCLUDED.media_data,
        updated_at = NOW()
    `,
    [fileName, contentType, mediaData.length, mediaData],
  );
}

export async function seedSharedVoicePromptIfMissing(
  fileName: string,
  contentType: string,
  mediaData: Buffer,
) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_shared_voice_prompt (id, file_name, content_type, file_size, media_data)
      VALUES ('shared', $1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
    `,
    [fileName, contentType, mediaData.length, mediaData],
  );
}

export async function getSharedVoicePrompt() {
  await ensureSchema();
  const result = await getPool().query<{
    file_name: string;
    content_type: string;
    file_size: number;
    media_data: Buffer;
  }>(
    "SELECT file_name, content_type, file_size, media_data FROM teller_shared_voice_prompt WHERE id = 'shared'",
  );
  const row = result.rows[0];
  return row
    ? {
        fileName: row.file_name,
        contentType: row.content_type,
        fileSize: row.file_size,
        mediaData: row.media_data,
      }
    : null;
}

export async function getUserChatMedia(userId: string, mediaId: string) {
  await ensureSchema();
  const result = await getPool().query<{
    file_name: string;
    content_type: string;
    file_size: number;
    media_data: Buffer;
  }>(
    "SELECT file_name, content_type, file_size, media_data FROM teller_chat_media WHERE user_id = $1 AND id = $2",
    [userId, mediaId],
  );
  const row = result.rows[0];
  return row
    ? {
        fileName: row.file_name,
        contentType: row.content_type,
        fileSize: row.file_size,
        mediaData: row.media_data,
      }
    : null;
}

export async function getUserGeneratedImages(userId: string, limit: number, offset: number) {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    history_id: string;
    created_at: Date;
  }>(
    `
      SELECT id, history_id, created_at
      FROM teller_chat_media
      WHERE user_id = $1 AND file_name = 'generated-image' AND content_type LIKE 'image/%'
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset],
  );

  return result.rows.map((row) => ({
    id: row.id,
    historyId: row.history_id,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function getUserGeneratedImage(userId: string, mediaId: string) {
  await ensureSchema();
  const result = await getPool().query<{
    content_type: string;
    media_data: Buffer;
  }>(
    `
      SELECT content_type, media_data
      FROM teller_chat_media
      WHERE user_id = $1 AND id = $2 AND file_name = 'generated-image'
        AND content_type LIKE 'image/%'
    `,
    [userId, mediaId],
  );
  const row = result.rows[0];
  return row
    ? { contentType: row.content_type, mediaData: row.media_data }
    : null;
}

export async function saveUserUsage(userId: string, usageCount: number, usageMonth = currentUsageMonth()) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO teller_user_chat_data (user_id, usage_month, usage_count, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        usage_month = EXCLUDED.usage_month,
        usage_count = EXCLUDED.usage_count,
        updated_at = NOW()
    `,
    [userId, usageMonth, usageCount],
  );
}

export async function incrementUserUsage(userId: string, increment = 1) {
  if (!Number.isInteger(increment) || increment < 1) {
    throw new Error("Usage increment must be a positive integer.");
  }
  await ensureSchema();
  const usageMonth = currentUsageMonth();
  const result = await getPool().query<{ usage_count: number }>(
    `
      INSERT INTO teller_user_chat_data (user_id, usage_month, usage_count, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        usage_month = EXCLUDED.usage_month,
        usage_count = CASE
          WHEN teller_user_chat_data.usage_month = EXCLUDED.usage_month
            THEN teller_user_chat_data.usage_count + EXCLUDED.usage_count
          ELSE EXCLUDED.usage_count
        END,
        updated_at = NOW()
      RETURNING usage_count
    `,
    [userId, usageMonth, increment],
  );
  return result.rows[0].usage_count;
}

export function getCurrentUsageMonth() {
  return currentUsageMonth();
}