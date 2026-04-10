import FixtureViewer from "./FixtureViewer";
import {
  defaultSnapshotDetailFixtureCaseId,
  getSnapshotDetailFixtureCase,
  snapshotDetailFixtureCases,
} from "@/lib/test-fixtures/snapshot-detail";
export default async function SnapshotDetailFixturesPage({
  searchParams,
}: {
  searchParams?: Promise<{ case?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const activeCase = getSnapshotDetailFixtureCase(
    resolvedSearchParams?.case ?? defaultSnapshotDetailFixtureCaseId
  );

  return <FixtureViewer activeCase={activeCase} allCases={snapshotDetailFixtureCases} />;
}
