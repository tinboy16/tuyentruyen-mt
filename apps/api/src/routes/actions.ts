import type {
  FastifyInstance,
  FastifyRequest
} from "fastify";

import prisma from "../lib/prisma.js";

import {
  checkRateLimit,
  getClientIp
} from "../lib/rate-limit.js";


/*
 * ==========================================
 * ACTION CONFIGURATION
 * ==========================================
 */

/*
 * Giới hạn theo IP.
 *
 * 12 request / giây.
 *
 * Nếu vượt:
 * - trả 429
 * - KHÔNG flag session
 */
const ACTION_RATE_LIMIT = 12;
const ACTION_RATE_WINDOW = 1_000;


/*
 * Anti-cheat tốc độ.
 *
 * Cho phép trung bình tối đa 12 action/giây.
 *
 * Mức này đủ rộng cho người chơi thật,
 * nhưng vẫn rất khó để bot spam.
 */
const MAX_ACTIONS_PER_SECOND = 12;


/*
 * Không flag ngay những action đầu tiên.
 *
 * Chỉ kiểm tra tốc độ trung bình khi
 * đã có ít nhất số action này.
 */
const MIN_ACTIONS_FOR_SPEED_CHECK = 6;


/*
 * Giới hạn dữ liệu.
 */
const MAX_ITEM_KEY_LENGTH = 100;
const MAX_ANSWER_LENGTH = 50;


/*
 * ==========================================
 * TYPES
 * ==========================================
 */

interface ActionBody {
  sessionToken?: unknown;
  itemKey?: unknown;
  answer?: unknown;
  sequence?: unknown;
}


/*
 * ==========================================
 * HELPERS
 * ==========================================
 */

function isValidSessionToken(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/i.test(value)
  );
}


function isSafeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  );
}


function normalizeAnswer(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}


/*
 * ==========================================
 * FLAG SUSPICIOUS SESSION
 * ==========================================
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
      suspicious: true,
      suspiciousReason: reason,
      suspiciousAt: new Date()
    }
  });
}


/*
 * ==========================================
 * ACTION ROUTES
 * ==========================================
 */

export async function actionRoutes(
  fastify: FastifyInstance
) {

  /*
   * ========================================
   * POST /api/v1/games/:slug/action
   * ========================================
   */

  fastify.post(
    "/games/:slug/action",

    async (
      request: FastifyRequest<{
        Params: {
          slug: string;
        };

        Body: ActionBody;
      }>,
      reply
    ) => {

      try {

        /*
         * ==================================
         * 1. READ BODY
         * ==================================
         */

        const body =
          request.body || {};

        const {
          sessionToken,
          itemKey,
          answer,
          sequence
        } = body;


        /*
         * ==================================
         * 2. SESSION TOKEN
         * ==================================
         */

        if (
          !isValidSessionToken(
            sessionToken
          )
        ) {
          return reply.code(400).send({
            success: false,
            error: "INVALID_SESSION_TOKEN"
          });
        }


        /*
         * ==================================
         * 3. ITEM KEY
         * ==================================
         */

        if (
          typeof itemKey !== "string" ||
          itemKey.length < 1 ||
          itemKey.length >
            MAX_ITEM_KEY_LENGTH
        ) {
          return reply.code(400).send({
            success: false,
            error: "INVALID_ITEM_KEY"
          });
        }


        /*
         * ==================================
         * 4. ANSWER
         * ==================================
         */

        if (
          typeof answer !== "string" ||
          answer.length < 1 ||
          answer.length >
            MAX_ANSWER_LENGTH
        ) {
          return reply.code(400).send({
            success: false,
            error: "INVALID_ANSWER"
          });
        }


        /*
         * ==================================
         * 5. SEQUENCE
         * ==================================
         */

        if (
          !isSafeInteger(sequence) ||
          sequence < 1
        ) {
          return reply.code(400).send({
            success: false,
            error: "INVALID_SEQUENCE"
          });
        }


        /*
         * ==================================
         * 6. IP RATE LIMIT
         * ==================================
         *
         * QUAN TRỌNG:
         *
         * Rate limit chỉ trả 429.
         *
         * KHÔNG flag session.
         *
         * Mạng chậm hoặc browser gửi dồn
         * request không phải bằng chứng gian lận.
         */

        const ip =
          getClientIp(request);

        const ipRate =
          checkRateLimit(
            `action:ip:${ip}`,
            ACTION_RATE_LIMIT,
            ACTION_RATE_WINDOW
          );

        if (!ipRate.allowed) {

          return reply
            .code(429)
            .send({
              success: false,
              error: "RATE_LIMITED",
              retryAfter:
                ipRate.retryAfter
            });
        }


        /*
         * ==================================
         * 7. SESSION LOOKUP
         * ==================================
         */

        const session =
          await prisma.gameSession.findUnique({
            where: {
              sessionToken
            },

            include: {
              game: true
            }
          });


        /*
         * ==================================
         * 8. SESSION EXISTS
         * ==================================
         */

        if (!session) {

          return reply
            .code(404)
            .send({
              success: false,
              error: "SESSION_NOT_FOUND"
            });
        }


        /*
         * ==================================
         * 9. GAME MATCH
         * ==================================
         */

        if (
          session.game.slug !==
          request.params.slug
        ) {

          await flagSuspiciousSession(
            session.id,
            "GAME_SLUG_MISMATCH"
          );

          return reply
            .code(403)
            .send({
              success: false,
              error:
                "SESSION_GAME_MISMATCH"
            });
        }


        /*
         * ==================================
         * 10. SUSPICIOUS SESSION
         * ==================================
         */

        if (
          session.suspicious
        ) {

          return reply
            .code(403)
            .send({
              success: false,
              error:
                "SESSION_SUSPICIOUS"
            });
        }


        /*
         * ==================================
         * 11. ALREADY SUBMITTED
         * ==================================
         */

        if (
          session.submittedAt
        ) {

          return reply
            .code(409)
            .send({
              success: false,
              error:
                "SESSION_ALREADY_SUBMITTED"
            });
        }


        /*
         * ==================================
         * 12. SERVER TIME
         * ==================================
         */

        const now =
          new Date();

        const elapsedMs =
          now.getTime() -
          session.startedAt.getTime();

        const elapsedSeconds =
          Math.max(
            0,
            Math.floor(
              elapsedMs / 1000
            )
          );


        /*
         * ==================================
         * 13. SESSION EXPIRATION
         * ==================================
         *
         * Game duration + 10s grace.
         */

        const maxDuration =
          session.game.duration + 10;

        if (
          elapsedSeconds >
          maxDuration
        ) {

          await flagSuspiciousSession(
            session.id,
            "ACTION_AFTER_SESSION_EXPIRED"
          );

          return reply
            .code(403)
            .send({
              success: false,
              error:
                "SESSION_EXPIRED"
            });
        }


        /*
         * ==================================
         * 14. SEQUENCE
         * ==================================
         *
         * Server là nguồn sự thật.
         */

        const expectedSequence =
          session.actionCount + 1;


        /*
         * QUAN TRỌNG:
         *
         * Không flag INVALID_SEQUENCE.
         *
         * Nếu xảy ra race ở tầng request,
         * chỉ trả lỗi.
         *
         * Việc flag ở đây trước kia khiến
         *
         * INVALID_SEQUENCE
         *      ↓
         * SESSION_FLAGGED
         *      ↓
         * SUBMIT 403
         *
         * và người chơi mất điểm.
         */

        if (
          sequence !==
          expectedSequence
        ) {

          return reply
            .code(409)
            .send({
              success: false,
              error:
                "INVALID_SEQUENCE",

              expectedSequence
            });
        }


        /*
         * ==================================
         * 15. FIND ITEM
         * ==================================
         *
         * correctAnswer chỉ lấy từ DB.
         */

        const item =
          await prisma.gameItem.findFirst({
            where: {
              gameId:
                session.gameId,

              itemKey,

              active: true
            }
          });


        /*
         * ==================================
         * 16. INVALID ITEM
         * ==================================
         */

        if (!item) {

          await flagSuspiciousSession(
            session.id,
            "INVALID_GAME_ITEM"
          );

          return reply
            .code(400)
            .send({
              success: false,
              error:
                "INVALID_GAME_ITEM"
            });
        }


        /*
         * ==================================
         * 17. VALIDATE ACTION
         * ==================================
         *
         * Client chỉ được gửi:
         *
         * answer = catch
         */

        const normalizedAnswer =
          normalizeAnswer(answer);


        if (
          normalizedAnswer !==
          "catch"
        ) {

          return reply
            .code(400)
            .send({
              success: false,
              error:
                "INVALID_ACTION"
            });
        }


        /*
         * ==================================
         * 18. SERVER CORRECTNESS
         * ==================================
         *
         * safe   = đúng
         * unsafe = sai
         */

        const normalizedCorrectAnswer =
          normalizeAnswer(
            item.correctAnswer
          );

        const correct =
          normalizedCorrectAnswer ===
          "safe";


        /*
         * ==================================
         * 19. SPEED CHECK
         * ==================================
         *
         * KHÔNG dùng giới hạn quá gắt
         * ở những action đầu.
         *
         * Chỉ kiểm tra khi đã có ít nhất
         * 6 action.
         *
         * Cho phép trung bình 12 action/s.
         *
         * Mạng chậm không làm elapsedMs
         * nhỏ đi nên không bị oan vì lag.
         */

        if (
          session.actionCount >=
          MIN_ACTIONS_FOR_SPEED_CHECK
        ) {

          const minElapsedMs =
            Math.floor(
              (
                session.actionCount /
                MAX_ACTIONS_PER_SECOND
              ) * 1000
            );

          if (
            elapsedMs <
            minElapsedMs
          ) {

            /*
             * KHÔNG flag.
             *
             * Chỉ từ chối action này.
             *
             * Điều này quan trọng:
             * mạng / frontend không làm
             * session chết luôn.
             */

            return reply
              .code(429)
              .send({
                success: false,
                error:
                  "ACTION_RATE_TOO_FAST",
                retryAfter: 200
              });
          }
        }


        /*
         * ==================================
         * 20. TRANSACTION
         * ==================================
         *
         * Action + counter atomically.
         */

        const result =
          await prisma.$transaction(
            async (tx) => {

              /*
               * Re-read session.
               */

              const currentSession =
                await tx.gameSession.findUnique({
                  where: {
                    id: session.id
                  }
                });


              if (!currentSession) {

                throw new Error(
                  "SESSION_NOT_FOUND"
                );
              }


              /*
               * Submit race.
               */

              if (
                currentSession.submittedAt
              ) {

                throw new Error(
                  "SESSION_ALREADY_SUBMITTED"
                );
              }


              /*
               * Suspicious race.
               */

              if (
                currentSession.suspicious
              ) {

                throw new Error(
                  "SESSION_SUSPICIOUS"
                );
              }


              /*
               * Sequence race.
               *
               * Không flag.
               */

              const currentExpected =
                currentSession.actionCount +
                1;

              if (
                sequence !==
                currentExpected
              ) {

                throw new Error(
                  "SEQUENCE_RACE"
                );
              }


              /*
               * Create action.
               */

              const action =
                await tx.gameAction.create({
                  data: {

                    sessionId:
                      currentSession.id,

                    sequence,

                    itemKey:
                      item.itemKey,

                    answer:
                      normalizedAnswer,

                    correct
                  }
                });


              /*
               * Update session.
               */

              const updatedSession =
                await tx.gameSession.update({
                  where: {
                    id:
                      currentSession.id
                  },

                  data: {

                    actionCount: {
                      increment: 1
                    },

                    goodHits:
                      correct
                        ? {
                            increment: 1
                          }
                        : undefined,

                    mistakes:
                      !correct
                        ? {
                            increment: 1
                          }
                        : undefined,

                    lastActionAt:
                      now
                  }
                });


              return {
                action,

                session:
                  updatedSession
              };
            }
          );


        /*
         * ==================================
         * 21. RESPONSE
         * ==================================
         */

        return reply.send({

          success: true,

          action: {
            sequence,

            itemKey,

            correct:
              result.action.correct
          },

          session: {

            actionCount:
              result.session.actionCount,

            goodHits:
              result.session.goodHits,

            mistakes:
              result.session.mistakes
          }
        });


      } catch (error) {

        /*
         * ==================================
         * ERROR: SESSION NOT FOUND
         * ==================================
         */

        if (
          error instanceof Error &&
          error.message ===
            "SESSION_NOT_FOUND"
        ) {

          return reply
            .code(404)
            .send({
              success: false,
              error:
                "SESSION_NOT_FOUND"
            });
        }


        /*
         * ==================================
         * ERROR: ALREADY SUBMITTED
         * ==================================
         */

        if (
          error instanceof Error &&
          error.message ===
            "SESSION_ALREADY_SUBMITTED"
        ) {

          return reply
            .code(409)
            .send({
              success: false,
              error:
                "SESSION_ALREADY_SUBMITTED"
            });
        }


        /*
         * ==================================
         * ERROR: SUSPICIOUS
         * ==================================
         */

        if (
          error instanceof Error &&
          error.message ===
            "SESSION_SUSPICIOUS"
        ) {

          return reply
            .code(403)
            .send({
              success: false,
              error:
                "SESSION_SUSPICIOUS"
            });
        }


        /*
         * ==================================
         * ERROR: SEQUENCE RACE
         * ==================================
         *
         * Không flag.
         */

        if (
          error instanceof Error &&
          error.message ===
            "SEQUENCE_RACE"
        ) {

          return reply
            .code(409)
            .send({
              success: false,
              error:
                "SEQUENCE_RACE"
            });
        }


        /*
         * ==================================
         * UNKNOWN ERROR
         * ==================================
         */

        request.log.error(
          error,
          "ACTION_PROCESSING_ERROR"
        );

        return reply
          .code(500)
          .send({
            success: false,
            error:
              "INTERNAL_SERVER_ERROR"
          });
      }
    }
  );
}