import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      success: true,
      service: "kids-game-api",
      status: "ok",
      timestamp: new Date().toISOString()
    };
  });
}