import crypto from "crypto";

const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || crypto.randomBytes(32).toString("hex");

// Simple HMAC-based session token
// In production, consider using a proper session library like iron-session
// TODO(security): Consider using iron-session or jose for JWT-based sessions

export function createSessionToken(username: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = `${username}:${expiry}`;
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  // Return base64-encoded token: payload.hmac
  return Buffer.from(`${payload}:${hmac}`).toString("base64");
}

export function verifySessionToken(token: string): { valid: boolean; username?: string } {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return { valid: false };

    const [username, expiryStr, providedHmac] = parts;
    const expiry = parseInt(expiryStr, 10);

    // Check expiry
    if (Date.now() > expiry) return { valid: false };

    // Verify HMAC
    const payload = `${username}:${expiryStr}`;
    const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    if (providedHmac.length !== expectedHmac.length) return { valid: false };
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );

    return isValid ? { valid: true, username } : { valid: false };
  } catch {
    return { valid: false };
  }
}
