import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { weeklyReviewCsv, weeklyReviewPdf } from "@/lib/growth-review/export";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const review = await prisma.weeklyGrowthReview.findFirst({
    where: { id, userId: session.user.id },
    include: { decisions: { orderBy: { priority: "asc" } } },
  });
  if (!review) return NextResponse.json({ error: "Weekly review not found" }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "pdf";
  if (format === "csv") {
    return new NextResponse(weeklyReviewCsv(review), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="devpulse-weekly-review-${review.weekKey}.csv"`,
      },
    });
  }
  const file = await weeklyReviewPdf(review);
  return new NextResponse(Buffer.from(file), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="devpulse-weekly-review-${review.weekKey}.pdf"`,
    },
  });
}
