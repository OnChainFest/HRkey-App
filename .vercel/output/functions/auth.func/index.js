export default async function handler(req) {
  const url = new URL(req.url);
  const qs = url.search || "";
  return Response.redirect(`${url.origin}/auth.html${qs}`, 307);
}
