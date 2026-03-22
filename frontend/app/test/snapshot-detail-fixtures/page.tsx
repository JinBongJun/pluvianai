import FixtureViewer from "./FixtureViewer";
import {
  defaultSnapshotDetailFixtureCaseId,
  getSnapshotDetailFixtureCase,
  snapshotDetailFixtureCases,
} from "@/lib/test-fixtures/snapshot-detail";
export default function SnapshotDetailFixturesPage({
  searchParams,
}: {
  searchParams?: { case?: string };
}) {
  const activeCase = getSnapshotDetailFixtureCase(
    searchParams?.case ?? defaultSnapshotDetailFixtureCaseId
  );

  return <FixtureViewer activeCase={activeCase} allCases={snapshotDetailFixtureCases} />;
}
