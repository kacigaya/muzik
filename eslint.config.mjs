import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  // web/ is a separate Next.js project with its own config and "@/" alias.
  globalIgnores([".next/**", ".venv/**", "node_modules/**", "next-env.d.ts", "web/**"]),
]);
