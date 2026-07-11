# DevPulse AI — web app

This is the Next.js application for DevPulse AI.

**Full documentation lives in the repo root:**

- [../../README.md](../../README.md) — setup, cron, env, architecture  
- [../../docs/DESIGN.md](../../docs/DESIGN.md) — design decisions  
- [../../project-scope.md](../../project-scope.md) — product scope  

## Dev

```bash
cp .env.example .env
npm install
npx playwright install chromium
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
