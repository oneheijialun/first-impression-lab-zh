declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS: Fetcher;
    ADMIN_OWNER_EMAIL: string;
    BUCKET?: R2Bucket;
  }
}
