import { prisma } from "@/lib/db";
import { getContentStrategy } from "@/lib/content/strategy-store";

export function parseGithubRepository(fullName: string) {
  const normalized = fullName
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const [owner, repo, ...rest] = normalized.split("/");
  if (!owner || !repo || rest.length) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
}

export async function ensureOwnedRepositories(userId: string) {
  const strategy = await getContentStrategy(userId);
  await Promise.all(
    strategy.projects.map(async (project) => {
      const parsed = parseGithubRepository(project.repository);
      if (!parsed) return;
      await prisma.ownedRepository.upsert({
        where: { userId_fullName: { userId, fullName: parsed.fullName } },
        create: {
          userId,
          projectId: project.id,
          name: project.name,
          owner: parsed.owner,
          repo: parsed.repo,
          fullName: parsed.fullName,
          url: project.url,
        },
        update: {
          projectId: project.id,
          name: project.name,
          owner: parsed.owner,
          repo: parsed.repo,
          url: project.url,
        },
      });
    }),
  );
  return strategy;
}

export async function addOwnedRepository(
  userId: string,
  input: { fullName: string; name?: string; projectId?: string },
) {
  const parsed = parseGithubRepository(input.fullName);
  if (!parsed) throw new Error("Use a GitHub repository in owner/repo format");
  const name = input.name?.trim().slice(0, 80) || parsed.repo;
  const projectId =
    input.projectId?.trim().slice(0, 80) ||
    parsed.repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return prisma.ownedRepository.upsert({
    where: { userId_fullName: { userId, fullName: parsed.fullName } },
    create: {
      userId,
      projectId,
      name,
      owner: parsed.owner,
      repo: parsed.repo,
      fullName: parsed.fullName,
      url: `https://github.com/${parsed.fullName}`,
    },
    update: { projectId, name, active: true },
  });
}
