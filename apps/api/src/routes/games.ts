import { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import prisma from "../lib/prisma.js";
import {
  checkRateLimit,
  getClientIp
} from "../lib/rate-limit.js";

/*
 * ==========================================
 * CONFIG
 * ==========================================
 */

const MAX_ACTIVE_SESSIONS = 3;

const START_RATE_LIMIT = 10;
const START_RATE_WINDOW = 60_000;

/*
 * ==========================================
 * SESSION TOKEN
 * ==========================================
 *
 * 32 bytes = 256 bit
 * hex = 64 characters
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/*
 * ==========================================
 * SHA256 HASH
 * ==========================================
 */
function hashValue(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

/*
 * ==========================================
 * NORMALIZE NICKNAME
 * ==========================================
 */
function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * ==========================================
 * VALIDATE NICKNAME
 * ==========================================
 *
 * Cho phép:
 * - Chữ tiếng Việt
 * - Chữ Unicode
 * - Số
 * - Khoảng trắng
 * - _
 * - .
 * - -
 *
 * Không cho:
 * - HTML
 * - script
 * - ký tự đặc biệt nguy hiểm
 */
function isValidNickname(nickname: string): boolean {
  if (nickname.length < 2 || nickname.length > 20) {
    return false;
  }

  return /^[\p{L}\p{N} _.-]+$/u.test(nickname);
}

/*
 * ==========================================
 * VALIDATE SLUG
 * ==========================================
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/*
 * ==========================================
 * GAME ROUTES
 * ==========================================
 */
export async function gameRoutes(app: FastifyInstance) {

  /*
   * ==========================================
   * GET GAME
   *
   * GET /api/v1/games/:slug
   * ==========================================
   */
  app.get("/games/:slug", async (request, reply) => {
    const { slug } = request.params as {
      slug: string;
    };

    const game = await prisma.game.findUnique({
      where: {
        slug
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        duration: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!game) {
      return reply.code(404).send({
        success: false,
        error: "GAME_NOT_FOUND"
      });
    }

    return {
      success: true,
      game
    };
  });


  /*
   * ==========================================
   * CREATE GAME
   *
   * POST /api/v1/games
   * ==========================================
   */
  app.post("/games", async (request, reply) => {

    const body = request.body as {
      name?: unknown;
      slug?: unknown;
      description?: unknown;
      duration?: unknown;
    };

    /*
     * ==========================================
     * VALIDATE NAME
     * ==========================================
     */

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    if (!name) {
      return reply.code(400).send({
        success: false,
        error: "NAME_REQUIRED"
      });
    }

    if (name.length < 2 || name.length > 100) {
      return reply.code(400).send({
        success: false,
        error: "INVALID_GAME_NAME"
      });
    }

    /*
     * ==========================================
     * VALIDATE SLUG
     * ==========================================
     */

    const slug =
      typeof body.slug === "string"
        ? body.slug.trim().toLowerCase()
        : "";

    if (!slug) {
      return reply.code(400).send({
        success: false,
        error: "SLUG_REQUIRED"
      });
    }

    if (!isValidSlug(slug)) {
      return reply.code(400).send({
        success: false,
        error: "INVALID_SLUG"
      });
    }

    /*
     * ==========================================
     * VALIDATE DESCRIPTION
     * ==========================================
     */

    let description: string | null = null;

    if (typeof body.description === "string") {
      description = body.description.trim();

      if (description.length > 5000) {
        return reply.code(400).send({
          success: false,
          error: "DESCRIPTION_TOO_LONG"
        });
      }
    }

    /*
     * ==========================================
     * VALIDATE DURATION
     * ==========================================
     */

    let duration = 60;

    if (body.duration !== undefined) {

      if (
        typeof body.duration !== "number" ||
        !Number.isInteger(body.duration)
      ) {
        return reply.code(400).send({
          success: false,
          error: "INVALID_DURATION"
        });
      }

      /*
       * Không cho game có duration quá nhỏ
       * hoặc quá lớn.
       */
      if (body.duration < 5 || body.duration > 3600) {
        return reply.code(400).send({
          success: false,
          error: "INVALID_DURATION"
        });
      }

      duration = body.duration;
    }

    /*
     * ==========================================
     * CHECK EXISTING GAME
     * ==========================================
     */

    const existingGame = await prisma.game.findUnique({
      where: {
        slug
      }
    });

    if (existingGame) {
      return reply.code(409).send({
        success: false,
        error: "GAME_ALREADY_EXISTS"
      });
    }

    /*
     * ==========================================
     * CREATE GAME
     * ==========================================
     */

    const game = await prisma.game.create({
      data: {
        name,
        slug,
        description,
        duration,
        status: "active"
      }
    });

    return reply.code(201).send({
      success: true,
      game
    });
  });


  /*
   * ==========================================
   * START GAME SESSION
   *
   * POST /api/v1/games/:slug/start
   * ==========================================
   */
  app.post("/games/:slug/start", async (request, reply) => {

    /*
     * ==========================================
     * RATE LIMIT
     *
     * 10 lần / phút / IP
     * ==========================================
     */

    const ip = getClientIp(request);

    const rate = checkRateLimit(
      `start:${ip}`,
      START_RATE_LIMIT,
      START_RATE_WINDOW
    );

    reply.header(
      "X-RateLimit-Limit",
      String(START_RATE_LIMIT)
    );

    reply.header(
      "X-RateLimit-Remaining",
      String(rate.remaining)
    );

    if (!rate.allowed) {

      reply.header(
        "Retry-After",
        String(rate.retryAfter)
      );

      return reply.code(429).send({
        success: false,
        error: "START_RATE_LIMITED",
        retryAfter: rate.retryAfter
      });
    }

    /*
     * ==========================================
     * PARAMS
     * ==========================================
     */

    const { slug } = request.params as {
      slug: string;
    };

    /*
     * ==========================================
     * BODY
     * ==========================================
     */

    const body = (request.body ?? {}) as {
      nickname?: unknown;
    };

    /*
     * ==========================================
     * FIND GAME
     * ==========================================
     */

    const game = await prisma.game.findUnique({
      where: {
        slug
      }
    });

    if (!game) {
      return reply.code(404).send({
        success: false,
        error: "GAME_NOT_FOUND"
      });
    }

    /*
     * ==========================================
     * GAME ACTIVE
     * ==========================================
     */

    if (game.status !== "active") {
      return reply.code(403).send({
        success: false,
        error: "GAME_NOT_ACTIVE"
      });
    }

    /*
     * ==========================================
     * NICKNAME
     * ==========================================
     */

    let nickname = "";

    if (body.nickname !== undefined) {

      nickname = normalizeNickname(
        body.nickname
      );

      if (!isValidNickname(nickname)) {
        return reply.code(400).send({
          success: false,
          error: "INVALID_NICKNAME"
        });
      }
    }

    /*
     * ==========================================
     * FINGERPRINT
     * ==========================================
     */

    const ipHash = hashValue(
      ip || "unknown"
    );

    const userAgent =
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : "unknown";

    const userAgentHash =
      hashValue(userAgent);

    /*
     * ==========================================
     * CURRENT TIME
     * ==========================================
     */

    const now = new Date();

    /*
     * ==========================================
     * ACTIVE SESSION LIMIT
     *
     * Một fingerprint chỉ được tối đa
     * 3 session chưa submit và chưa hết hạn.
     * ==========================================
     */

    const activeSessions =
      await prisma.gameSession.count({
        where: {
          gameId: game.id,

          ipHash,

          userAgentHash,

          submittedAt: null,

          expiresAt: {
            gt: now
          }
        }
      });

    if (activeSessions >= MAX_ACTIVE_SESSIONS) {
      return reply.code(429).send({
        success: false,
        error: "TOO_MANY_ACTIVE_SESSIONS",
        maxActiveSessions: MAX_ACTIVE_SESSIONS
      });
    }

    /*
     * ==========================================
     * PLAYER
     * ==========================================
     *
     * Hiện tại mỗi lần START sẽ tạo Player mới.
     *
     * Sau này có thể nâng cấp thành:
     * - player cookie
     * - player ID
     * - tài khoản học sinh
     *
     * để lưu lịch sử chính xác hơn.
     * ==========================================
     */

    let player = null;

    if (nickname) {

      player = await prisma.player.create({
        data: {
          nickname
        }
      });
    }

    /*
     * ==========================================
     * SESSION TIME
     * ==========================================
     *
     * Game thực tế:
     *     game.duration
     *
     * Server cho thêm:
     *     +10 giây buffer
     *
     * Ví dụ:
     *     game = 60 giây
     *     session = 70 giây
     *
     * Buffer dùng để tránh request submit
     * bị từ chối do mạng chậm.
     * ==========================================
     */

    const expiresAt = new Date(
      now.getTime() +
      (game.duration + 10) * 1000
    );

    /*
     * ==========================================
     * SESSION TOKEN
     * ==========================================
     */

    const sessionToken =
      generateSessionToken();

    /*
     * ==========================================
     * CREATE SESSION
     * ==========================================
     */

    const session =
      await prisma.gameSession.create({
        data: {
          gameId: game.id,

          playerId:
            player?.id ?? null,

          sessionToken,

          startedAt:
            now,

          expiresAt,

          ipHash,

          userAgentHash
        }
      });

    /*
     * ==========================================
     * RESPONSE
     * ==========================================
     */

    return reply.code(201).send({

      success: true,

      game: {
        id: game.id,
        name: game.name,
        slug: game.slug,
        duration: game.duration
      },

      player: player
        ? {
            id: player.id,
            nickname: player.nickname
          }
        : null,

      session: {
        id: session.id,

        /*
         * Client cần token này để submit.
         */
        token: session.sessionToken,

        startedAt:
          session.startedAt,

        expiresAt:
          session.expiresAt
      }
    });
  });
}