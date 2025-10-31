import { PrismaClient } from "@prisma/client";

type PrismaLogLevel = "query" | "info" | "warn" | "error";

const logLevels: PrismaLogLevel[] =
  process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: logLevels,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
