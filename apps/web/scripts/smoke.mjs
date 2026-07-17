const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const paths = ["/", "/login", "/api/ready"];

for (const path of paths) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "DevPulse-Smoke/1.0" },
    });
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`${path} returned ${response.status}`);
    }
    console.log(`PASS ${path} (${response.status})`);
  } finally {
    clearTimeout(timer);
  }
}
