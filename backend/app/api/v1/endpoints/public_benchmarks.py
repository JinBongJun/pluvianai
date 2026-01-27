"""
Public Benchmarks endpoints (no authentication required)
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user_optional
from fastapi import Header
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.public_benchmark import PublicBenchmark
from app.services.public_benchmark_service import PublicBenchmarkService

router = APIRouter()


class PublicBenchmarkCreateRequest(BaseModel):
    """Request schema for creating a public benchmark"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    benchmark_type: str = Field(..., pattern="^(model_comparison|task_performance)$")
    benchmark_data: dict = Field(..., description="Benchmark data (JSON)")
    test_cases_count: int = Field(..., ge=0)
    category: Optional[str] = Field(None, max_length=100)
    tags: List[str] = Field(default=[])


class PublicBenchmarkResponse(BaseModel):
    """Response schema for public benchmark"""
    id: int
    author_id: Optional[int]
    name: str
    description: Optional[str]
    benchmark_type: str
    benchmark_data: dict
    test_cases_count: int
    category: Optional[str]
    tags: List[str]
    is_featured: bool
    is_approved: bool
    view_count: int
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


def get_public_benchmark_service(db: Session = Depends(get_db)) -> PublicBenchmarkService:
    """Dependency to get public benchmark service"""
    return PublicBenchmarkService()


@router.get("/public/benchmarks", response_model=List[PublicBenchmarkResponse])
@handle_errors
async def list_public_benchmarks(
    category: Optional[str] = Query(None, description="Filter by category"),
    benchmark_type: Optional[str] = Query(None, description="Filter by benchmark type"),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort: str = Query("recent", description="Sort order: recent, popular, featured"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    public_benchmark_service: PublicBenchmarkService = Depends(get_public_benchmark_service),
):
    """
    List public benchmarks (no authentication required)
    """
    # Parse tags if provided
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    result = public_benchmark_service.list_benchmarks(
        db=db,
        category=category,
        benchmark_type=benchmark_type,
        tags=tag_list,
        search=search,
        sort=sort,
        limit=limit,
        offset=offset,
        approved_only=True
    )

    return result["benchmarks"]


@router.get("/public/benchmarks/featured", response_model=List[PublicBenchmarkResponse])
@handle_errors
async def get_featured_benchmarks(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    public_benchmark_service: PublicBenchmarkService = Depends(get_public_benchmark_service),
):
    """
    Get featured benchmarks (no authentication required)
    """
    benchmarks = public_benchmark_service.get_featured_benchmarks(db, limit)
    return benchmarks


@router.get("/public/benchmarks/{benchmark_id}", response_model=PublicBenchmarkResponse)
@handle_errors
async def get_public_benchmark(
    benchmark_id: int,
    db: Session = Depends(get_db),
    public_benchmark_service: PublicBenchmarkService = Depends(get_public_benchmark_service),
):
    """
    Get a public benchmark by ID (no authentication required, increments view count)
    """
    benchmark = public_benchmark_service.get_benchmark_by_id(benchmark_id, db, increment_view=True)
    if not benchmark:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benchmark not found"
        )

    if not benchmark.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Benchmark is not approved"
        )

    return benchmark


@router.post("/benchmarks/publish", response_model=PublicBenchmarkResponse)
@handle_errors
async def publish_benchmark(
    request: PublicBenchmarkCreateRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    public_benchmark_service: PublicBenchmarkService = Depends(get_public_benchmark_service),
):
    """
    Publish a benchmark (authentication optional, but recommended)
    """
    current_user = await get_current_user_optional(authorization, db)
    
    benchmark = public_benchmark_service.create_benchmark(
        user_id=current_user.id if current_user else None,
        name=request.name,
        description=request.description,
        benchmark_type=request.benchmark_type,
        benchmark_data=request.benchmark_data,
        test_cases_count=request.test_cases_count,
        category=request.category,
        tags=request.tags,
        db=db
    )

    return success_response(data=benchmark)
