// Usage: npm run new-secret
// Prints a random URL-safe string for FAMILY_TOKEN or COOKIE_SECRET.
const bytes = crypto.getRandomValues(new Uint8Array(32));
console.log(Buffer.from(bytes).toString('base64url'));
