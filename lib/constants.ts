// __Host- prefix requires Secure (HTTPS), so use it only in production.
// In development (HTTP / localhost), browsers silently reject __Host- cookies.
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-admin-session"
    : "admin-session";
