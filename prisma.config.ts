import "dotenv/config";
import { defineConfig } from "prisma/config";

// No `migrations` block on purpose: the main CodeQuest repo owns every
// migration for the shared database. See prisma/schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
