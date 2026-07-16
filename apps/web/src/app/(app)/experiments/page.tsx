import { requireUser } from "@/lib/session";
import { getExperimentViews } from "@/lib/experiments/service";
import { PageHeader } from "@/components/page-header";
import { ExperimentManager } from "@/components/experiment-manager";

export default async function ExperimentsPage() {
  const session = await requireUser();
  const experiments = await getExperimentViews(session.user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Controlled learning"
        title="Growth experiments"
        description="Change one generation variable at a time, measure X and LinkedIn separately, and apply a winner only after comparable evidence exists."
      />
      <ExperimentManager experiments={experiments} />
    </div>
  );
}

