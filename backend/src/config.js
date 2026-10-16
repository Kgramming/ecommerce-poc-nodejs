// Central configuration — env vars with Mac-friendly defaults.
const env = (k, d) => (process.env[k] && process.env[k].length > 0 ? process.env[k] : d);

export const config = {
  port: 8004,
  pg: {
    host: env("PGHOST", "localhost"),
    port: parseInt(env("PGPORT", "5435"), 10),
    database: env("PGDATABASE", "ecommerce"),
    user: env("PGUSER", "ecommerce"),
    password: env("PGPASSWORD", "ecommerce"),
  },
  mongoUri: `mongodb://${env("MONGOHOST", "localhost")}:${env("MONGOPORT", "27017")}`,
  mongoDb: env("MONGODB", "ecommerce"),
  esUrl: `http://${env("ESHOST", "localhost")}:${env("ESPORT", "9200")}`.replace(/\/$/, ""),
  esIndex: env("ESINDEX", "orders"),
  syncStrategy: env("SYNC_STRATEGY", "dual_write"),
  corsOrigins: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"],
};
