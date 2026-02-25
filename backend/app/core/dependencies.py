from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.api_call_repository import APICallRepository
from app.infrastructure.repositories.alert_repository import AlertRepository
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
from app.infrastructure.repositories.trace_repository import TraceRepository
from app.infrastructure.repositories.evaluation_rubric_repository import EvaluationRubricRepository
from app.infrastructure.repositories.organization_member_repository import OrganizationMemberRepository
from app.infrastructure.repositories.project_member_repository import ProjectMemberRepository
from app.core.security import get_current_user, get_current_user_optional, get_user_from_api_key

def get_project_repository(db: Session = Depends(get_db)) -> ProjectRepository:
    """
    Get project repository
    
    Note: Repository uses the same session from get_db().
    Transaction commit/rollback is handled by get_db() automatically.
    """
    return ProjectRepository(db)

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    """Get user repository"""
    return UserRepository(db)

def get_api_call_repository(db: Session = Depends(get_db)) -> APICallRepository:
    """Get API call repository"""
    return APICallRepository(db)

def get_alert_repository(db: Session = Depends(get_db)) -> AlertRepository:
    """Get alert repository"""
    return AlertRepository(db)

def get_organization_repository(db: Session = Depends(get_db)) -> OrganizationRepository:
    """Get organization repository"""
    return OrganizationRepository(db)

def get_snapshot_repository(db: Session = Depends(get_db)) -> SnapshotRepository:
    """Get snapshot repository"""
    return SnapshotRepository(db)

def get_trace_repository(db: Session = Depends(get_db)) -> TraceRepository:
    """Get trace repository"""
    return TraceRepository(db)

def get_evaluation_rubric_repository(db: Session = Depends(get_db)) -> EvaluationRubricRepository:
    """Get evaluation rubric repository"""
    return EvaluationRubricRepository(db)

def get_organization_member_repository(db: Session = Depends(get_db)) -> OrganizationMemberRepository:
    """Get organization member repository"""
    return OrganizationMemberRepository(db)

def get_project_member_repository(db: Session = Depends(get_db)) -> ProjectMemberRepository:
    """Get project member repository"""
    return ProjectMemberRepository(db)

# Service dependencies
def get_snapshot_service(db: Session = Depends(get_db)):
    """Get snapshot service with repository dependencies"""
    from app.services.snapshot_service import SnapshotService
    trace_repo = TraceRepository(db)
    snapshot_repo = SnapshotRepository(db)
    return SnapshotService(trace_repo, snapshot_repo, db)

def get_project_service(db: Session = Depends(get_db)):
    """Get project service with repository dependencies"""
    from app.services.project_service import ProjectService
    project_repo = ProjectRepository(db)
    org_repo = OrganizationRepository(db)
    return ProjectService(project_repo, org_repo, db)

def get_organization_service(db: Session = Depends(get_db)):
    """Get organization service with repository dependencies"""
    from app.services.organization_service import OrganizationService
    org_repo = OrganizationRepository(db)
    member_repo = OrganizationMemberRepository(db)
    return OrganizationService(org_repo, member_repo, db)

def get_user_service(db: Session = Depends(get_db)):
    """Get user service with repository dependencies"""
    from app.services.user_service import UserService
    user_repo = UserRepository(db)
    return UserService(user_repo, db)

def get_project_member_service(db: Session = Depends(get_db)):
    """Get project member service with repository dependencies"""
    from app.services.project_member_service import ProjectMemberService
    member_repo = ProjectMemberRepository(db)
    user_repo = UserRepository(db)
    return ProjectMemberService(member_repo, user_repo, db)

def get_api_call_service(db: Session = Depends(get_db)):
    """Get API call service with repository dependencies"""
    from app.services.api_call_service import APICallService
    api_call_repo = APICallRepository(db)
    return APICallService(api_call_repo, db)

def get_alert_service(db: Session = Depends(get_db)):
    """Get alert service with repository dependencies"""
    import sys
    import traceback
    from app.core.logging_config import logger
    
    try:
        logger.info("🔧 Creating AlertService...")
        print("🔧 Creating AlertService...", file=sys.stderr)
        from app.services.alert_service import AlertService
        logger.info("🔧 Creating AlertRepository...")
        print("🔧 Creating AlertRepository...", file=sys.stderr)
        alert_repo = AlertRepository(db)
        logger.info("🔧 Creating AlertService instance...")
        print("🔧 Creating AlertService instance...", file=sys.stderr)
        service = AlertService(alert_repo, db)
        logger.info("✅ AlertService created successfully")
        print("✅ AlertService created successfully", file=sys.stderr)
        return service
    except Exception as e:
        logger.error(f"🔴🔴🔴 FAILED TO CREATE ALERT SERVICE: {type(e).__name__}: {str(e)}", exc_info=True)
        print(f"🔴🔴🔴 FAILED TO CREATE ALERT SERVICE: {type(e).__name__}: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        raise

def get_onboarding_service(db: Session = Depends(get_db)):
    """Get onboarding service"""
    from app.services.onboarding_service import OnboardingService
    return OnboardingService(db)

def get_audit_service(db: Session = Depends(get_db)):
    """Get audit service"""
    from app.services.audit_service import AuditService
    return AuditService(db)
