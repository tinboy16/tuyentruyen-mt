import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import {
  checkRateLimit,
  getClientIp
} from "./lib/rate-limit.js";

import { healthRoutes } from "./routes/health.js";
import { gameRoutes } from "./routes/games.js";
import { scoreRoutes } from "./routes/scores.js";
import { actionRoutes } from "./routes/actions.js";


/*
 * ==========================================
 * FASTIFY
 * ==========================================
 */

const app = Fastify({
  logger: true
});


/*
 * ==========================================
 * GLOBAL RATE LIMIT
 * ==========================================
 */

app.addHook(
  "onRequest",
  async (
    request,
    reply
  ) => {

    const ip =
      getClientIp(request);

    const result =
      checkRateLimit(
        `global:${ip}`,
        120,
        60_000
      );


    reply.header(
      "X-RateLimit-Limit",
      "120"
    );


    reply.header(
      "X-RateLimit-Remaining",
      String(
        result.remaining
      )
    );


    if (!result.allowed) {

      reply.header(
        "Retry-After",
        String(
          result.retryAfter
        )
      );


      return reply
        .code(429)
        .send({
          success: false,
          error:
            "RATE_LIMITED",
          retryAfter:
            result.retryAfter
        });
    }
  }
);


/*
 * ==========================================
 * START
 * ==========================================
 */

async function start() {

  try {

    /*
     * ========================================
     * SECURITY
     * ========================================
     */

    await app.register(
      helmet
    );


    await app.register(
      cors,
      {
        origin: true
      }
    );


    /*
     * ========================================
     * FASTIFY RATE LIMIT
     * ========================================
     */

    await app.register(
      rateLimit,
      {
        max: 100,
        timeWindow:
          "1 minute"
      }
    );


    /*
     * ========================================
     * ROUTES
     * ========================================
     */

    await app.register(
      healthRoutes,
      {
        prefix: "/api/v1"
      }
    );


    await app.register(
      gameRoutes,
      {
        prefix: "/api/v1"
      }
    );


    await app.register(
      scoreRoutes,
      {
        prefix: "/api/v1"
      }
    );


    /*
     * 1.5C
     *
     * POST
     * /api/v1/games/:slug/action
     */

    await app.register(
      actionRoutes,
      {
        prefix: "/api/v1"
      }
    );


    /*
     * ========================================
     * ROOT
     * ========================================
     */

    app.get(
      "/",
      async () => {
        return {
          success: true,
          name:
            "Kids Game Platform API",
          version:
            "1.0.0"
        };
      }
    );


    /*
     * ========================================
     * START SERVER
     * ========================================
     */

    const port =
      Number(
        process.env.PORT ||
        3000
      );

    const host =
      process.env.HOST ||
      "0.0.0.0";


    await app.listen({
      port,
      host
    });


    console.log(`
========================================
 Kids Game API
========================================

 Server:
 http://localhost:${port}

 Health:
 http://localhost:${port}/api/v1/health

 Action:
 POST /api/v1/games/:slug/action

 Submit:
 POST /api/v1/games/:slug/submit

========================================
`);

  } catch (error) {

    app.log.error(
      error
    );

    process.exit(1);
  }
}


start();