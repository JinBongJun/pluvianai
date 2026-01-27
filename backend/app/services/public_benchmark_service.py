"""
Public Benchmark service for managing shared benchmark results
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from app.models.public_benchmark import PublicBenchmark
from app.core.logging_config import logger


class PublicBenchmarkService:
    """Service for Public Benchmark operations"""

    def list_benchmarks(
        self,
        db: Session,
        category: Optional[str] = None,
        benchmark_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        sort: str = "recent",  # recent, popular, featured
        limit: int = 50,
        offset: int = 0,
        approved_only: bool = True
    ) -> Dict[str, Any]:
        """
        List public benchmarks with filtering and sorting
        
        Args:
            db: Database session
            category: Filter by category
            benchmark_type: Filter by benchmark type
            tags: Filter by tags (any match)
            search: Search in name and description
            sort: Sort order (recent, popular, featured)
            limit: Maximum number of results
            offset: Offset for pagination
            approved_only: Only show approved benchmarks
        
        Returns:
            Dictionary with benchmarks list and total count
        """
        query = db.query(PublicBenchmark)

        # Filter by approval status
        if approved_only:
            query = query.filter(PublicBenchmark.is_approved == True)

        # Filter by category
        if category:
            query = query.filter(PublicBenchmark.category == category)

        # Filter by benchmark type
        if benchmark_type:
            query = query.filter(PublicBenchmark.benchmark_type == benchmark_type)

        # Filter by tags (any match)
        if tags:
            # PostgreSQL JSONB array contains check
            tag_conditions = [PublicBenchmark.tags.contains([tag]) for tag in tags]
            query = query.filter(or_(*tag_conditions))

        # Search in name and description
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    PublicBenchmark.name.ilike(search_term),
                    PublicBenchmark.description.ilike(search_term)
                )
            )

        # Sort
        if sort == "popular":
            query = query.order_by(desc(PublicBenchmark.view_count), desc(PublicBenchmark.created_at))
        elif sort == "featured":
            query = query.filter(PublicBenchmark.is_featured == True)
            query = query.order_by(desc(PublicBenchmark.created_at))
        else:  # recent
            query = query.order_by(desc(PublicBenchmark.created_at))

        # Get total count
        total = query.count()

        # Apply pagination
        benchmarks = query.offset(offset).limit(limit).all()

        return {
            "benchmarks": benchmarks,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    def get_benchmark_by_id(self, benchmark_id: int, db: Session, increment_view: bool = True) -> Optional[PublicBenchmark]:
        """
        Get a benchmark by ID
        
        Args:
            benchmark_id: Benchmark ID
            db: Database session
            increment_view: Whether to increment view count
        
        Returns:
            PublicBenchmark entity or None
        """
        benchmark = db.query(PublicBenchmark).filter(PublicBenchmark.id == benchmark_id).first()
        
        if benchmark and increment_view:
            benchmark.view_count += 1
            db.commit()
            db.refresh(benchmark)
        
        return benchmark

    def create_benchmark(
        self,
        user_id: Optional[int],
        name: str,
        description: Optional[str],
        benchmark_type: str,
        benchmark_data: Dict[str, Any],
        test_cases_count: int,
        category: Optional[str],
        tags: List[str],
        db: Session
    ) -> PublicBenchmark:
        """
        Create a new public benchmark
        
        Args:
            user_id: Author user ID (optional for anonymous)
            name: Benchmark name
            description: Benchmark description
            benchmark_type: Benchmark type (model_comparison, task_performance)
            benchmark_data: Benchmark data (JSON)
            test_cases_count: Number of test cases
            category: Category (nlp, code, translation)
            tags: List of tags
            db: Database session
        
        Returns:
            Created PublicBenchmark entity
        """
        benchmark = PublicBenchmark(
            author_id=user_id,
            name=name,
            description=description,
            benchmark_type=benchmark_type,
            benchmark_data=benchmark_data,
            test_cases_count=test_cases_count,
            category=category,
            tags=tags or [],
            is_approved=False,  # Requires admin approval
            is_featured=False
        )

        db.add(benchmark)
        db.commit()
        db.refresh(benchmark)

        logger.info(
            f"Public benchmark created by user {user_id}",
            extra={"user_id": user_id, "benchmark_id": benchmark.id, "benchmark_name": name}
        )

        return benchmark

    def get_featured_benchmarks(self, db: Session, limit: int = 10) -> List[PublicBenchmark]:
        """Get featured benchmarks"""
        return (
            db.query(PublicBenchmark)
            .filter(
                and_(
                    PublicBenchmark.is_featured == True,
                    PublicBenchmark.is_approved == True
                )
            )
            .order_by(desc(PublicBenchmark.view_count), desc(PublicBenchmark.created_at))
            .limit(limit)
            .all()
        )
