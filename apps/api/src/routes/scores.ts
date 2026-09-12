import { FastifyInstance } from "fastify";

import prisma from "../lib/prisma.js";

import {
  checkRateLimit,
  getClientIp
} from "../lib/rate-limit.js";

/*
 * ==========================================
 * ANTI-CHEAT CONFIGURATION
 * ==========================================
 */

/*
 * Số hit tối đa mỗi giây.
 *
 * Đây là giới hạn bảo vệ phía server.
 */
const MAX_HITS_PER_SECOND = 8;

/*
 * Tổng số action tối đa trong một session.
 *
 * action = goodHits + mistakes
 */
const MAX_TOTAL_ACTIONS = 600;

/*
 * Submit tối đa:
 *
 * 20 request / phút / IP
 */
const SUBMIT_RATE_LIMIT = 20;
const SUBMIT_RATE_WINDOW = 60_000;

/*
 * ==========================================
 * FLAG SUSPICIOUS SESSION
 * ==========================================
 *
 * Khi phát hiện hành vi bất thường:
 *
 * suspicious = true
 *
 * Session sau đó không thể submit
 * điểm hợp lệ nữa.
 */
async function flagSuspiciousSession(
  sessionId: string,
  reason: string
) {
  await prisma.gameSession.updateMany({
    where: {
      id: sessionId,
      suspicious: false
    },

    data: {
      submitAttempts: {
        increment: 1
      },

      suspicious: true,

      suspiciousReason: reason,

      suspiciousAt: new Date()
    }
  });
}

/*
 * ==========================================
 * NORMALIZE NICKNAME
 * ==========================================
 */
function normalizeNickname(
  value: string
): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * ==========================================
 * SCORE ROUTES
 * ==========================================
 */
export async function scoreRoutes(
  app: FastifyInstance
) {

  /*
   * ==========================================
   * GET LEADERBOARD
   * ==========================================
   *
   * GET /games/:slug/leaderboard
   *
   * Quy tắc:
   *
   * 1. verified = true
   * 2. session.suspicious = false
   * 3. Mỗi nickname chỉ giữ thành tích tốt nhất
   * 4. score DESC
   * 5. duration ASC
   * 6. createdAt ASC
   * 7. tối đa 100 người
   *
   * Không xóa Score cũ.
   */
  app.get(
    "/games/:slug/leaderboard",
    async (request, reply) => {

      const { slug } =
        request.params as {
          slug: string;
        };

      /*
       * ======================================
       * 1. GAME
       * ======================================
       */

      const game =
        await prisma.game.findUnique({
          where: {
            slug
          },

          select: {
            id: true,
            name: true,
            slug: true
          }
        });

      if (!game) {
        return reply.code(404).send({
          success: false,
          error: "GAME_NOT_FOUND"
        });
      }

      /*
       * ======================================
       * 2. LẤY SCORE HỢP LỆ
       * ======================================
       */

      const scores =
        await prisma.score.findMany({
          where: {
            gameId: game.id,

            verified: true,

            session: {
              suspicious: false
            }
          },

          select: {
            score: true,
            goodHits: true,
            mistakes: true,
            duration: true,
            createdAt: true,

            player: {
              select: {
                id: true,
                nickname: true
              }
            }
          },

          orderBy: [
            {
              score: "desc"
            },

            {
              duration: "asc"
            },

            {
              createdAt: "asc"
            }
          ]
        });

      /*
       * ======================================
       * 3. GIỮ THÀNH TÍCH TỐT NHẤT
       * ======================================
       */

      const bestByNickname =
        new Map<
          string,
          (typeof scores)[number]
        >();

      for (const item of scores) {

        const nickname =
          item.player?.nickname
            ? normalizeNickname(
                item.player.nickname
              )
            : "";

        if (!nickname) {
          continue;
        }

        /*
         * Vì database đã sort đúng
         * thứ tự nên record đầu tiên
         * chính là thành tích tốt nhất.
         */
        if (
          !bestByNickname.has(
            nickname
          )
        ) {
          bestByNickname.set(
            nickname,
            item
          );
        }
      }

      /*
       * ======================================
       * 4. TẠO LEADERBOARD
       * ======================================
       */

      const leaderboard =
        Array.from(
          bestByNickname.values()
        )
          .slice(0, 100)
          .map(
            (item, index) => ({
              rank: index + 1,

              nickname:
                normalizeNickname(
                  item.player!.nickname!
                ),

              score: item.score,

              goodHits:
                item.goodHits,

              mistakes:
                item.mistakes,

              duration:
                item.duration,

              createdAt:
                item.createdAt
            })
          );

      /*
       * ======================================
       * 5. RESPONSE
       * ======================================
       */

      return {
        success: true,

        game: {
          id: game.id,
          name: game.name,
          slug: game.slug
        },

        total:
          leaderboard.length,

        leaderboard
      };
    }
  );

  /*
   * ==========================================
   * GET PLAYER LEADERBOARD
   * ==========================================
   *
   * GET /games/:slug/leaderboard/:nickname
   */
  app.get(
    "/games/:slug/leaderboard/:nickname",
    async (request, reply) => {

      const {
        slug,
        nickname
      } =
        request.params as {
          slug: string;
          nickname: string;
        };

      /*
       * ======================================
       * 1. DECODE NICKNAME
       * ======================================
       */

      let decodedNickname: string;

      try {
        decodedNickname =
          normalizeNickname(
            decodeURIComponent(
              nickname
            )
          );
      } catch {
        return reply.code(400).send({
          success: false,
          error: "INVALID_NICKNAME"
        });
      }

      if (!decodedNickname) {
        return reply.code(400).send({
          success: false,
          error: "NICKNAME_REQUIRED"
        });
      }

      /*
       * ======================================
       * 2. GAME
       * ======================================
       */

      const game =
        await prisma.game.findUnique({
          where: {
            slug
          },

          select: {
            id: true,
            name: true,
            slug: true
          }
        });

      if (!game) {
        return reply.code(404).send({
          success: false,
          error: "GAME_NOT_FOUND"
        });
      }

      /*
       * ======================================
       * 3. LẤY SCORE HỢP LỆ
       * ======================================
       */

      const scores =
        await prisma.score.findMany({
          where: {
            gameId: game.id,

            verified: true,

            session: {
              suspicious: false
            }
          },

          select: {
            score: true,
            goodHits: true,
            mistakes: true,
            duration: true,
            createdAt: true,

            player: {
              select: {
                id: true,
                nickname: true
              }
            }
          },

          orderBy: [
            {
              score: "desc"
            },

            {
              duration: "asc"
            },

            {
              createdAt: "asc"
            }
          ]
        });

      /*
       * ======================================
       * 4. BEST SCORE / NICKNAME
       * ======================================
       */

      const bestByNickname =
        new Map<
          string,
          (typeof scores)[number]
        >();

      for (const item of scores) {

        const playerNickname =
          item.player?.nickname
            ? normalizeNickname(
                item.player.nickname
              )
            : "";

        if (!playerNickname) {
          continue;
        }

        if (
          !bestByNickname.has(
            playerNickname
          )
        ) {
          bestByNickname.set(
            playerNickname,
            item
          );
        }
      }

      /*
       * ======================================
       * 5. RANKING
       * ======================================
       */

      const rankedPlayers =
        Array.from(
          bestByNickname.entries()
        );

      /*
       * ======================================
       * 6. TÌM NGƯỜI CHƠI
       * ======================================
       */

      const playerIndex =
        rankedPlayers.findIndex(
          ([playerNickname]) =>
            playerNickname ===
            decodedNickname
        );

      if (
        playerIndex === -1
      ) {
        return reply.code(404).send({
          success: false,
          error: "PLAYER_NOT_FOUND"
        });
      }

      /*
       * ======================================
       * 7. BEST SCORE
       * ======================================
       */

      const [
        ,
        bestScore
      ] =
        rankedPlayers[
          playerIndex
        ];

      /*
       * ======================================
       * 8. RESPONSE
       * ======================================
       */

      return {
        success: true,

        game: {
          id: game.id,
          name: game.name,
          slug: game.slug
        },

        player: {
          nickname:
            decodedNickname,

          rank:
            playerIndex + 1,

          totalPlayers:
            rankedPlayers.length,

          score:
            bestScore.score,

          goodHits:
            bestScore.goodHits,

          mistakes:
            bestScore.mistakes,

          duration:
            bestScore.duration,

          createdAt:
            bestScore.createdAt
        }
      };
    }
  );

  /*
   * ==========================================
   * POST SUBMIT SCORE
   * ==========================================
   *
   * POST /games/:slug/submit
   *
   * CLIENT CHỈ ĐƯỢC GỬI:
   *
   * {
   *   "sessionToken": "..."
   * }
   *
   * Server KHÔNG tin:
   *
   * score
   * goodHits
   * mistakes
   * duration
   *
   * Tất cả đều lấy từ GameSession.
   */
  app.post(
    "/games/:slug/submit",
    async (request, reply) => {

      /*
       * ========================================
       * 0. RATE LIMIT
       * ========================================
       *
       * 20 submit / phút / IP
       */

      const ip =
        getClientIp(request);

      const rate =
        checkRateLimit(
          `submit:${ip}`,
          SUBMIT_RATE_LIMIT,
          SUBMIT_RATE_WINDOW
        );

      reply.header(
        "X-RateLimit-Limit",
        String(
          SUBMIT_RATE_LIMIT
        )
      );

      reply.header(
        "X-RateLimit-Remaining",
        String(
          rate.remaining
        )
      );

      if (!rate.allowed) {

        reply.header(
          "Retry-After",
          String(
            rate.retryAfter
          )
        );

        return reply.code(429).send({
          success: false,
          error: "SUBMIT_RATE_LIMITED",
          retryAfter:
            rate.retryAfter
        });
      }

      /*
       * ========================================
       * PARAMS
       * ========================================
       */

      const { slug } =
        request.params as {
          slug: string;
        };

      /*
       * ========================================
       * BODY
       * ========================================
       *
       * Chỉ đọc sessionToken.
       *
       * Các field:
       *
       * score
       * goodHits
       * mistakes
       * duration
       *
       * nếu client gửi lên cũng KHÔNG được sử dụng.
       */

      const body =
        (request.body ?? {}) as {
          sessionToken?: unknown;
        };

      /*
       * ========================================
       * 1. SESSION TOKEN
       * ========================================
       */

      if (
        typeof body.sessionToken !==
          "string" ||

        !/^[a-f0-9]{64}$/i.test(
          body.sessionToken
        )
      ) {
        return reply.code(400).send({
          success: false,
          error:
            "INVALID_SESSION_TOKEN"
        });
      }

      const sessionToken =
        body.sessionToken;

      /*
       * ========================================
       * 2. GAME
       * ========================================
       */

      const game =
        await prisma.game.findUnique({
          where: {
            slug
          }
        });

      if (!game) {
        return reply.code(404).send({
          success: false,
          error:
            "GAME_NOT_FOUND"
        });
      }

      /*
       * ========================================
       * 3. SESSION
       * ========================================
       */

      const session =
        await prisma.gameSession.findUnique({
          where: {
            sessionToken
          },

          include: {
            game: true,

            player: true
          }
        });

      if (!session) {
        return reply.code(404).send({
          success: false,
          error:
            "SESSION_NOT_FOUND"
        });
      }

      /*
       * ========================================
       * 4. ĐÚNG GAME
       * ========================================
       */

      if (
        session.gameId !==
        game.id
      ) {
        await flagSuspiciousSession(
          session.id,
          "SESSION_GAME_MISMATCH"
        );

        return reply.code(403).send({
          success: false,
          error:
            "SESSION_GAME_MISMATCH"
        });
      }

      /*
       * ========================================
       * 5. SESSION SUSPICIOUS
       * ========================================
       */

      if (
        session.suspicious
      ) {
        return reply.code(403).send({
          success: false,
          error:
            "SESSION_FLAGGED",

          reason:
            session.suspiciousReason
        });
      }

      /*
       * ========================================
       * 6. ĐÃ SUBMIT
       * ========================================
       */

      if (
        session.submittedAt
      ) {
        return reply.code(409).send({
          success: false,
          error:
            "SCORE_ALREADY_SUBMITTED"
        });
      }

      /*
       * ========================================
       * 7. SERVER TIME
       * ========================================
       *
       * Duration hoàn toàn do server tính.
       */

      const now =
        new Date();

      const elapsedMs =
        now.getTime() -
        session.startedAt.getTime();

      /*
       * Không thể submit trước
       * thời điểm bắt đầu.
       */

      if (
        elapsedMs < 0
      ) {
        await flagSuspiciousSession(
          session.id,
          "INVALID_SESSION_TIME"
        );

        return reply.code(403).send({
          success: false,
          error:
            "INVALID_SESSION_TIME"
        });
      }

      const elapsedSeconds =
        Math.floor(
          elapsedMs / 1000
        );

      /*
       * ========================================
       * 8. SESSION EXPIRATION
       * ========================================
       *
       * Game duration + 10 giây buffer.
       */

      const maxAllowedSeconds =
        game.duration + 10;

      if (
        elapsedSeconds >
        maxAllowedSeconds
      ) {
        return reply.code(403).send({
          success: false,
          error:
            "SESSION_EXPIRED"
        });
      }

      /*
       * ========================================
       * 9. SERVER DURATION
       * ========================================
       *
       * KHÔNG tin duration client.
       *
       * Server tự tính.
       */

      const serverDuration =
        Math.min(
          game.duration,
          Math.max(
            0,
            elapsedSeconds
          )
        );

      /*
       * ========================================
       * 10. SERVER COUNTERS
       * ========================================
       *
       * LẤY TRỰC TIẾP TỪ GameSession.
       */

      const actionCount =
        session.actionCount;

      const goodHits =
        session.goodHits;

      const mistakes =
        session.mistakes;

      /*
       * ========================================
       * 11. KIỂM TRA COUNTERS
       * ========================================
       *
       * Theo thiết kế:
       *
       * actionCount =
       * goodHits + mistakes
       */

      if (
        !Number.isSafeInteger(
          actionCount
        ) ||
        !Number.isSafeInteger(
          goodHits
        ) ||
        !Number.isSafeInteger(
          mistakes
        )
      ) {
        await flagSuspiciousSession(
          session.id,
          "UNSAFE_SESSION_COUNTERS"
        );

        return reply.code(403).send({
          success: false,
          error:
            "INVALID_SESSION_COUNTERS"
        });
      }

      /*
       * Không cho counter âm.
       */

      if (
        actionCount < 0 ||
        goodHits < 0 ||
        mistakes < 0
      ) {
        await flagSuspiciousSession(
          session.id,
          "NEGATIVE_SESSION_COUNTERS"
        );

        return reply.code(403).send({
          success: false,
          error:
            "INVALID_SESSION_COUNTERS"
        });
      }

      /*
       * ========================================
       * 12. TỔNG ACTION
       * ========================================
       */

      const calculatedTotalActions =
        goodHits +
        mistakes;

      /*
       * Kiểm tra consistency:
       *
       * actionCount phải đúng bằng
       * goodHits + mistakes.
       */

      if (
        actionCount !==
        calculatedTotalActions
      ) {
        await flagSuspiciousSession(
          session.id,
          "SESSION_COUNTER_MISMATCH"
        );

        return reply.code(403).send({
          success: false,
          error:
            "SESSION_COUNTER_MISMATCH",

          details: {
            actionCount,
            goodHits,
            mistakes,
            calculatedTotalActions
          }
        });
      }

      /*
       * ========================================
       * 13. MAX ACTIONS
       * ========================================
       */

      if (
        actionCount >
        MAX_TOTAL_ACTIONS
      ) {
        await flagSuspiciousSession(
          session.id,
          "TOO_MANY_ACTIONS"
        );

        return reply.code(403).send({
          success: false,
          error:
            "TOO_MANY_ACTIONS",

          details: {
            actionCount,

            maxTotalActions:
              MAX_TOTAL_ACTIONS
          }
        });
      }

      /*
       * ========================================
       * 14. HIT RATE
       * ========================================
       *
       * Kiểm tra số goodHits dựa trên
       * thời gian server.
       */

      const effectiveSeconds =
        Math.max(
          1,
          serverDuration
        );

      const maxHits =
        effectiveSeconds *
        MAX_HITS_PER_SECOND;

      if (
        goodHits >
        maxHits
      ) {
        await flagSuspiciousSession(
          session.id,
          "IMPOSSIBLE_HIT_RATE"
        );

        return reply.code(403).send({
          success: false,

          error:
            "IMPOSSIBLE_HIT_RATE",

          details: {
            goodHits,

            maxHits,

            duration:
              serverDuration
          }
        });
      }

      /*
       * ========================================
       * 15. TOTAL ACTION RATE
       * ========================================
       */

      const maxActionsByTime =
        effectiveSeconds *
        MAX_HITS_PER_SECOND;

      if (
        actionCount >
        maxActionsByTime
      ) {
        await flagSuspiciousSession(
          session.id,
          "IMPOSSIBLE_ACTION_RATE"
        );

        return reply.code(403).send({
          success: false,

          error:
            "IMPOSSIBLE_ACTION_RATE",

          details: {
            actionCount,

            maxActionsByTime,

            duration:
              serverDuration
          }
        });
      }

      /*
       * ========================================
       * 16. SERVER TỰ TÍNH SCORE
       * ========================================
       *
       * Game hiện tại:
       *
       * score = goodHits
       *
       * Client hoàn toàn không tham gia.
       */

      const verifiedScore =
        goodHits;

      /*
       * ========================================
       * 17. TRANSACTION
       * ========================================
       *
       * Chống double-submit.
       *
       * Request A:
       * submittedAt = NULL
       *        ↓
       * tạo Score
       *
       * Request B:
       * submittedAt != NULL
       *        ↓
       * bị từ chối
       */

      try {

        const result =
          await prisma.$transaction(
            async (tx) => {

              /*
               * ==================================
               * ATOMIC SESSION LOCK
               * ==================================
               */

              const updatedSession =
                await tx.gameSession.updateMany({
                  where: {
                    id:
                      session.id,

                    submittedAt:
                      null,

                    suspicious:
                      false
                  },

                  data: {
                    submittedAt:
                      now,

                    submitAttempts: {
                      increment: 1
                    }
                  }
                });

              /*
               * Session đã được request khác
               * xử lý trước.
               */

              if (
                updatedSession.count !==
                1
              ) {
                throw new Error(
                  "SESSION_NOT_AVAILABLE"
                );
              }

              /*
               * ==================================
               * CREATE VERIFIED SCORE
               * ==================================
               *
               * TẤT CẢ dữ liệu dưới đây
               * đều do SERVER lấy/tính.
               */

              const score =
                await tx.score.create({
                  data: {
                    gameId:
                      game.id,

                    sessionId:
                      session.id,

                    playerId:
                      session.playerId,

                    /*
                     * Server tính.
                     */
                    score:
                      verifiedScore,

                    /*
                     * Server lấy từ GameSession.
                     */
                    goodHits:
                      goodHits,

                    mistakes:
                      mistakes,

                    /*
                     * Server tính từ startedAt.
                     */
                    duration:
                      serverDuration,

                    /*
                     * Server quyết định.
                     */
                    verified:
                      true
                  }
                });

              /*
               * ==================================
               * UPDATE PLAYER
               * ==================================
               */

              if (
                session.playerId
              ) {
                await tx.player.update({
                  where: {
                    id:
                      session.playerId
                  },

                  data: {
                    lastPlayedAt:
                      now
                  }
                });
              }

              return score;
            }
          );

        /*
         * ======================================
         * SUCCESS
         * ======================================
         */

        return reply.code(201).send({
          success: true,

          message:
            "SCORE_SUBMITTED",

          score: {
            id:
              result.id,

            score:
              result.score,

            goodHits:
              result.goodHits,

            mistakes:
              result.mistakes,

            duration:
              result.duration,

            verified:
              result.verified,

            createdAt:
              result.createdAt
          }
        });

      } catch (error) {

        /*
         * ======================================
         * SESSION ĐÃ BỊ XỬ LÝ
         * ======================================
         */

        if (
          error instanceof Error &&
          error.message ===
            "SESSION_NOT_AVAILABLE"
        ) {

          const latestSession =
            await prisma.gameSession.findUnique({
              where: {
                id:
                  session.id
              }
            });

          /*
           * Session bị flag.
           */

          if (
            latestSession?.suspicious
          ) {
            return reply.code(403).send({
              success: false,

              error:
                "SESSION_FLAGGED",

              reason:
                latestSession.suspiciousReason
            });
          }

          /*
           * Session đã submit.
           */

          if (
            latestSession?.submittedAt
          ) {
            return reply.code(409).send({
              success: false,

              error:
                "SCORE_ALREADY_SUBMITTED"
            });
          }
        }

        /*
         * ======================================
         * INTERNAL ERROR
         * ======================================
         */

        request.log.error(
          error,
          "SCORE_SUBMIT_ERROR"
        );

        return reply.code(500).send({
          success: false,

          error:
            "SCORE_SUBMIT_FAILED"
        });
      }
    }
  );
}