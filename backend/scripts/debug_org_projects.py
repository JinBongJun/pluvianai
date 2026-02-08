"""
Debug script to reproduce GET /organizations/{org_id}/projects errors.
Run from backend dir:

    python scripts/debug_org_projects.py 2
"""

import sys
from datetime import datetime, timedelta

from app.core.database import SessionLocal
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.organization_member_repository import OrganizationMemberRepository
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.services.organization_service import OrganizationService
from app.services.project_service import ProjectService
from app.services.cost_analyzer import CostAnalyzer
from app.models.api_call import APICall
from app.models.alert import Alert
from app.models.quality_score import QualityScore
from sqlalchemy import func


def main(org_id: int):
    db = SessionLocal()
    try:
        org_repo = OrganizationRepository(db)
        member_repo = OrganizationMemberRepository(db)
        project_repo = ProjectRepository(db)
        org_svc = OrganizationService(org_repo, member_repo, db)
        proj_svc = ProjectService(project_repo, org_repo, db)
        cost_analyzer = CostAnalyzer()

        print(f"🔵 Debugging org_id={org_id}")
        org = org_svc.get_organization_by_id(org_id)
        print("Org:", org)

        projects = proj_svc.get_projects_by_organization_id(org_id)
        print("Projects:", [p.id for p in projects])

        if not projects:
            print("No projects, endpoint would return []")
            return

        project_ids = [p.id for p in projects]
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        seven_days_ago = now - timedelta(days=7)

        calls_rows = (
            db.query(APICall.project_id, func.count(APICall.id))
            .filter(
                APICall.project_id.in_(project_ids),
                APICall.created_at >= day_ago,
                APICall.created_at <= now,
            )
            .group_by(APICall.project_id)
            .all()
        )
        print("calls_rows:", calls_rows)

        for pid in project_ids:
            analysis = cost_analyzer.analyze_project_costs(
                project_id=pid,
                start_date=seven_days_ago,
                end_date=now,
                db=db,
            )
            print(f"cost analysis for project {pid}:", analysis.get("total_cost"))

        quality_rows = (
            db.query(
                QualityScore.project_id,
                func.avg(QualityScore.overall_score).label("avg_quality"),
            )
            .filter(
                QualityScore.project_id.in_(project_ids),
                QualityScore.created_at >= seven_days_ago,
            )
            .group_by(QualityScore.project_id)
            .all()
        )
        print("quality_rows:", quality_rows)

        alerts_rows = (
            db.query(Alert.project_id, func.count(Alert.id))
            .filter(Alert.project_id.in_(project_ids), Alert.is_resolved.is_(False))
            .group_by(Alert.project_id)
            .all()
        )
        print("alerts_rows:", alerts_rows)

        drift_rows = (
            db.query(Alert.project_id, func.count(Alert.id))
            .filter(
                Alert.project_id.in_(project_ids),
                Alert.alert_type == "drift",
                Alert.is_resolved.is_(False),
            )
            .group_by(Alert.project_id)
            .all()
        )
        print("drift_rows:", drift_rows)

        print("✅ debug_org_projects finished without exception")
    except Exception as e:
        print("EXCEPTION:", type(e).__name__, e)
        import traceback

        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    org_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    main(org_id)

