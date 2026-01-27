"""
Rule Market service for managing shared firewall rules
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func
from app.models.rule_market import RuleMarket
from app.models.firewall_rule import FirewallRule
from app.core.logging_config import logger


class RuleMarketService:
    """Service for Rule Market operations"""

    def list_rules(
        self,
        db: Session,
        category: Optional[str] = None,
        rule_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        sort: str = "popular",  # popular, recent, rating
        limit: int = 50,
        offset: int = 0,
        approved_only: bool = True
    ) -> Dict[str, Any]:
        """
        List rules from the market with filtering and sorting
        
        Args:
            db: Database session
            category: Filter by category
            rule_type: Filter by rule type
            tags: Filter by tags (any match)
            search: Search in name and description
            sort: Sort order (popular, recent, rating)
            limit: Maximum number of results
            offset: Offset for pagination
            approved_only: Only show approved rules
        
        Returns:
            Dictionary with rules list and total count
        """
        query = db.query(RuleMarket)

        # Filter by approval status
        if approved_only:
            query = query.filter(RuleMarket.is_approved == True)

        # Filter by category
        if category:
            query = query.filter(RuleMarket.category == category)

        # Filter by rule type
        if rule_type:
            query = query.filter(RuleMarket.rule_type == rule_type)

        # Filter by tags (any match)
        if tags:
            # PostgreSQL JSONB array contains check
            tag_conditions = [RuleMarket.tags.contains([tag]) for tag in tags]
            query = query.filter(or_(*tag_conditions))

        # Search in name and description
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    RuleMarket.name.ilike(search_term),
                    RuleMarket.description.ilike(search_term)
                )
            )

        # Sort
        if sort == "popular":
            query = query.order_by(desc(RuleMarket.download_count), desc(RuleMarket.rating))
        elif sort == "rating":
            query = query.order_by(desc(RuleMarket.rating), desc(RuleMarket.rating_count))
        else:  # recent
            query = query.order_by(desc(RuleMarket.created_at))

        # Get total count
        total = query.count()

        # Apply pagination
        rules = query.offset(offset).limit(limit).all()

        return {
            "rules": rules,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    def get_rule_by_id(self, rule_id: int, db: Session) -> Optional[RuleMarket]:
        """Get a rule by ID"""
        return db.query(RuleMarket).filter(RuleMarket.id == rule_id).first()

    def create_rule(
        self,
        user_id: int,
        name: str,
        description: Optional[str],
        rule_type: str,
        pattern: str,
        pattern_type: str,
        category: Optional[str],
        tags: List[str],
        db: Session
    ) -> RuleMarket:
        """
        Create a new rule in the market
        
        Args:
            user_id: Author user ID
            name: Rule name
            description: Rule description
            rule_type: Rule type (pii, toxicity, hallucination, custom)
            pattern: Rule pattern
            pattern_type: Pattern type (regex, keyword, ml)
            category: Category (security, quality, compliance)
            tags: List of tags
            db: Database session
        
        Returns:
            Created RuleMarket entity
        """
        rule = RuleMarket(
            author_id=user_id,
            name=name,
            description=description,
            rule_type=rule_type,
            pattern=pattern,
            pattern_type=pattern_type,
            category=category,
            tags=tags or [],
            is_approved=False,  # Requires admin approval
            is_featured=False
        )

        db.add(rule)
        db.commit()
        db.refresh(rule)

        logger.info(
            f"Rule created in market by user {user_id}",
            extra={"user_id": user_id, "rule_id": rule.id, "rule_name": name}
        )

        return rule

    def download_rule(
        self,
        rule_id: int,
        project_id: int,
        db: Session
    ) -> FirewallRule:
        """
        Download a rule from the market and create a FirewallRule for a project
        
        Args:
            rule_id: Rule Market ID
            project_id: Target project ID
            db: Database session
        
        Returns:
            Created FirewallRule entity
        """
        # Get rule from market
        market_rule = self.get_rule_by_id(rule_id, db)
        if not market_rule:
            raise ValueError(f"Rule {rule_id} not found in market")

        if not market_rule.is_approved:
            raise ValueError("Rule is not approved and cannot be downloaded")

        # Import FirewallRuleType enum
        from app.models.firewall_rule import FirewallRuleType, FirewallAction, FirewallSeverity

        # Map rule_type string to enum
        rule_type_map = {
            "pii": FirewallRuleType.PII,
            "toxicity": FirewallRuleType.TOXICITY,
            "hallucination": FirewallRuleType.HALLUCINATION,
            "custom": FirewallRuleType.CUSTOM,
        }
        
        firewall_rule_type = rule_type_map.get(market_rule.rule_type, FirewallRuleType.CUSTOM)

        # Create FirewallRule from market rule
        firewall_rule = FirewallRule(
            project_id=project_id,
            rule_type=firewall_rule_type,
            name=f"{market_rule.name} (from Market)",
            description=market_rule.description or f"Downloaded from Rule Market: {market_rule.name}",
            pattern=market_rule.pattern,
            pattern_type=market_rule.pattern_type,
            action=FirewallAction.BLOCK,  # Default action
            severity=FirewallSeverity.MEDIUM,  # Default severity
            enabled=True,
            config={"source": "rule_market", "market_rule_id": rule_id}
        )

        db.add(firewall_rule)
        
        # Increment download count
        market_rule.download_count += 1
        db.commit()
        db.refresh(firewall_rule)

        logger.info(
            f"Rule {rule_id} downloaded to project {project_id}",
            extra={"rule_id": rule_id, "project_id": project_id, "firewall_rule_id": firewall_rule.id}
        )

        return firewall_rule

    def rate_rule(
        self,
        rule_id: int,
        user_id: int,
        rating: float,
        db: Session
    ) -> RuleMarket:
        """
        Rate a rule (1-5 stars)
        
        Args:
            rule_id: Rule ID
            user_id: User ID (for tracking, future: prevent duplicate ratings)
            rating: Rating value (1-5)
            db: Database session
        
        Returns:
            Updated RuleMarket entity
        """
        if rating < 1 or rating > 5:
            raise ValueError("Rating must be between 1 and 5")

        rule = self.get_rule_by_id(rule_id, db)
        if not rule:
            raise ValueError(f"Rule {rule_id} not found")

        # Update rating (simple average, in production would use a separate ratings table)
        current_total = rule.rating * rule.rating_count
        rule.rating_count += 1
        rule.rating = (current_total + rating) / rule.rating_count

        db.commit()
        db.refresh(rule)

        logger.info(
            f"Rule {rule_id} rated {rating} by user {user_id}",
            extra={"rule_id": rule_id, "user_id": user_id, "rating": rating}
        )

        return rule

    def get_featured_rules(self, db: Session, limit: int = 10) -> List[RuleMarket]:
        """Get featured rules"""
        return (
            db.query(RuleMarket)
            .filter(
                and_(
                    RuleMarket.is_featured == True,
                    RuleMarket.is_approved == True
                )
            )
            .order_by(desc(RuleMarket.download_count), desc(RuleMarket.rating))
            .limit(limit)
            .all()
        )
