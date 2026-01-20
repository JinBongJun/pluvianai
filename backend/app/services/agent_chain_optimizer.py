"""
Agent Chain Optimizer for automatic optimization suggestions
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.services.agent_chain_profiler import AgentChainProfiler
from app.services.cost_analyzer import CostAnalyzer
from app.core.logging_config import logger


class AgentChainOptimizer:
    """
    에이전트 체인 자동 최적화 제안
    - 안전장치 포함
    - 사용자 승인 필수
    """
    
    SAFETY_THRESHOLDS = {
        "max_quality_drop": 5.0,  # 품질 하락 최대 5%
        "min_quality_score": 75.0,  # 최소 품질 점수 75
        "max_cost_increase": 0.0,  # 비용 증가 불가
        "min_test_samples": 10,  # 최소 테스트 샘플 수
    }
    
    BOTTLENECK_THRESHOLD = 2.0  # 평균 대비 2배 이상 지연 시 Bottleneck으로 간주
    
    def __init__(self):
        self.profiler = AgentChainProfiler()
        self.cost_analyzer = CostAnalyzer()
    
    def suggest_optimizations(
        self,
        project_id: int,
        chain_id: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        최적화 제안만 제공 (자동 적용 안 함)
        
        Args:
            project_id: Project ID
            chain_id: Chain ID to optimize
            db: Database session
        
        Returns:
            Dictionary with optimization suggestions
        """
        # 1. 체인 프로파일링
        profile_result = self.profiler.profile_chain(
            project_id=project_id,
            chain_id=chain_id,
            days=7,
            db=db
        )
        
        if not profile_result.get("chains") or len(profile_result["chains"]) == 0:
            return {
                "message": "No chain data available for optimization",
                "suggestions": [],
                "current_performance": {},
                "predicted_improvement": {},
                "auto_apply": False,
                "requires_approval": True,
            }
        
        # Get the specific chain profile
        chain_profile = profile_result["chains"][0]
        
        # 2. 최적화 기회 발견
        optimizations = []
        
        # 병렬화 기회
        parallel_opportunities = self._find_parallel_opportunities(chain_profile)
        optimizations.extend(parallel_opportunities)
        
        # 순서 최적화
        order_optimizations = self._optimize_agent_order(chain_profile, db, project_id)
        optimizations.extend(order_optimizations)
        
        # 모델 최적화
        model_optimizations = self._optimize_agent_models(chain_profile, db, project_id)
        optimizations.extend(model_optimizations)
        
        # 3. 안전장치 확인 및 필터링
        safe_optimizations = []
        for opt in optimizations:
            if self._check_safety(opt):
                safe_optimizations.append(opt)
        
        # 4. 예상 개선 효과 계산
        predicted_improvement = self._calculate_predicted_improvement(
            chain_profile,
            safe_optimizations
        )
        
        return {
            "suggestions": safe_optimizations,
            "current_performance": {
                "total_latency_ms": chain_profile.get("total_latency", 0),
                "success_rate": chain_profile.get("success_rate", 0),
                "avg_latency_per_step_ms": chain_profile.get("avg_latency_per_step", 0),
            },
            "predicted_improvement": predicted_improvement,
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }
    
    def _find_parallel_opportunities(
        self,
        chain_profile: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        병렬화 가능한 에이전트 발견
        
        병렬화 가능 조건:
        - 순차적으로 실행되고 있는 에이전트들
        - 서로 의존성이 없는 에이전트들
        - 병렬화 시 성능 개선 가능
        """
        opportunities = []
        agents = chain_profile.get("agents", [])
        
        if len(agents) < 2:
            return opportunities
        
        # Find agents that could potentially run in parallel
        # For now, identify agents with similar execution patterns
        # In a real implementation, would need dependency analysis
        
        # Check for sequential agents with no dependencies
        avg_latency = sum(a.get("avg_latency_ms", 0) for a in agents) / len(agents) if agents else 0
        
        # Identify slow sequential agents that could be parallelized
        sequential_slow_agents = [
            a for a in agents
            if a.get("avg_latency_ms", 0) > avg_latency * 0.5
        ]
        
        if len(sequential_slow_agents) >= 2:
            # Calculate potential improvement
            current_total = sum(a.get("avg_latency_ms", 0) for a in sequential_slow_agents)
            # If parallelized, total time would be max of individual times
            optimized_total = max(a.get("avg_latency_ms", 0) for a in sequential_slow_agents)
            
            improvement_pct = ((current_total - optimized_total) / current_total * 100) if current_total > 0 else 0
            
            if improvement_pct > 20:  # Only suggest if improvement > 20%
                opportunities.append({
                    "type": "parallelization",
                    "agents": [a.get("agent_name") for a in sequential_slow_agents],
                    "current_latency_ms": current_total,
                    "optimized_latency_ms": optimized_total,
                    "improvement_percentage": round(improvement_pct, 1),
                    "description": f"Parallelize {len(sequential_slow_agents)} agents to reduce latency",
                    "risk_level": "low",
                    "requires_approval": True,
                })
        
        return opportunities
    
    def _optimize_agent_order(
        self,
        chain_profile: Dict[str, Any],
        db: Session,
        project_id: int
    ) -> List[Dict[str, Any]]:
        """
        에이전트 실행 순서 최적화 제안
        
        빠르게 완료되는 에이전트를 먼저 실행하여 전체 지연 시간 감소
        """
        opportunities = []
        agents = chain_profile.get("agents", [])
        
        if len(agents) < 2:
            return opportunities
        
        # Sort agents by latency (fastest first)
        sorted_agents = sorted(agents, key=lambda a: a.get("avg_latency_ms", 0))
        current_order = [a.get("agent_name") for a in agents]
        optimized_order = [a.get("agent_name") for a in sorted_agents]
        
        # Check if reordering would help
        if current_order != optimized_order:
            # Calculate potential improvement
            # Moving fast agents first can reduce perceived latency
            current_sequential_time = sum(a.get("avg_latency_ms", 0) for a in agents)
            optimized_sequential_time = sum(a.get("avg_latency_ms", 0) for a in sorted_agents)
            
            # Improvement is limited, but can improve user experience
            improvement_pct = ((current_sequential_time - optimized_sequential_time) / current_sequential_time * 100) if current_sequential_time > 0 else 0
            
            if improvement_pct > 5:  # Only suggest if improvement > 5%
                opportunities.append({
                    "type": "order_optimization",
                    "current_order": current_order,
                    "optimized_order": optimized_order,
                    "current_latency_ms": current_sequential_time,
                    "optimized_latency_ms": optimized_sequential_time,
                    "improvement_percentage": round(improvement_pct, 1),
                    "description": "Reorder agents to run faster tasks first",
                    "risk_level": "low",
                    "requires_approval": True,
                })
        
        return opportunities
    
    def _optimize_agent_models(
        self,
        chain_profile: Dict[str, Any],
        db: Session,
        project_id: int
    ) -> List[Dict[str, Any]]:
        """
        에이전트별 모델 최적화 제안
        
        각 에이전트에 더 적합한 모델 제안
        """
        opportunities = []
        agents = chain_profile.get("agents", [])
        
        # Get model recommendations from cost analyzer
        for agent in agents:
            agent_name = agent.get("agent_name")
            avg_quality = agent.get("avg_quality_score", 0)
            
            # If quality is high but latency is also high, might benefit from faster model
            avg_latency = agent.get("avg_latency_ms", 0)
            
            # Check if we can suggest a faster model without quality loss
            if avg_quality > 85 and avg_latency > 3000:  # High quality but slow
                # Suggest faster model
                opportunities.append({
                    "type": "model_optimization",
                    "agent_name": agent_name,
                    "current_model": "unknown",  # Would need to get from API calls
                    "recommended_model": "faster_model",
                    "current_latency_ms": avg_latency,
                    "expected_latency_ms": avg_latency * 0.7,  # 30% improvement estimate
                    "current_quality_score": avg_quality,
                    "expected_quality_score": avg_quality - 2,  # Slight quality drop
                    "improvement_percentage": 30.0,
                    "description": f"Consider faster model for {agent_name} to reduce latency",
                    "risk_level": "medium",
                    "quality_change": -2.0,
                    "cost_change": -10.0,  # Assume cost reduction
                    "requires_approval": True,
                })
            
            # Check if we can suggest cost optimization
            elif avg_quality < 70 and avg_latency < 1000:  # Low quality but fast, might be overkill
                opportunities.append({
                    "type": "cost_optimization",
                    "agent_name": agent_name,
                    "current_model": "unknown",
                    "recommended_model": "cost_effective_model",
                    "current_latency_ms": avg_latency,
                    "expected_latency_ms": avg_latency * 1.1,  # 10% latency increase
                    "current_quality_score": avg_quality,
                    "expected_quality_score": avg_quality,  # Same quality
                    "improvement_percentage": -50.0,  # Cost reduction
                    "description": f"Consider cost-effective model for {agent_name}",
                    "risk_level": "low",
                    "quality_change": 0.0,
                    "cost_change": -50.0,  # Cost reduction
                    "requires_approval": True,
                })
        
        return opportunities
    
    def _check_safety(self, optimization: Dict[str, Any]) -> bool:
        """
        안전장치 확인
        
        Args:
            optimization: Optimization suggestion dictionary
        
        Returns:
            True if optimization passes safety checks, False otherwise
        """
        # 품질 하락 확인
        quality_change = optimization.get("quality_change", 0)
        if quality_change < -self.SAFETY_THRESHOLDS["max_quality_drop"]:
            logger.debug(f"Optimization rejected: Quality drop too large ({quality_change}%)")
            return False
        
        # 최소 품질 점수 확인
        expected_quality = optimization.get("expected_quality_score", optimization.get("current_quality_score", 100))
        if expected_quality < self.SAFETY_THRESHOLDS["min_quality_score"]:
            logger.debug(f"Optimization rejected: Quality score too low ({expected_quality})")
            return False
        
        # 비용 증가 확인
        cost_change = optimization.get("cost_change", 0)
        if cost_change > self.SAFETY_THRESHOLDS["max_cost_increase"]:
            logger.debug(f"Optimization rejected: Cost increase ({cost_change}%)")
            return False
        
        return True
    
    def _calculate_predicted_improvement(
        self,
        chain_profile: Dict[str, Any],
        optimizations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        예상 개선 효과 계산
        
        Args:
            chain_profile: Current chain profile
            optimizations: List of optimization suggestions
        
        Returns:
            Dictionary with predicted improvement metrics
        """
        if not optimizations:
            return {
                "latency_reduction_percentage": 0.0,
                "cost_reduction_percentage": 0.0,
                "success_rate_improvement_percentage": 0.0,
            }
        
        # Calculate total improvements
        total_latency_reduction = 0.0
        total_cost_reduction = 0.0
        
        current_latency = chain_profile.get("total_latency", 0)
        
        for opt in optimizations:
            if opt.get("type") == "parallelization":
                improvement = opt.get("improvement_percentage", 0)
                latency_reduction = current_latency * (improvement / 100)
                total_latency_reduction += latency_reduction
            
            elif opt.get("type") == "model_optimization":
                improvement = opt.get("improvement_percentage", 0)
                if improvement > 0:  # Latency improvement
                    latency_reduction = opt.get("current_latency_ms", 0) * (improvement / 100)
                    total_latency_reduction += latency_reduction
                
                cost_change = opt.get("cost_change", 0)
                if cost_change < 0:  # Cost reduction
                    total_cost_reduction += abs(cost_change)
            
            elif opt.get("type") == "cost_optimization":
                cost_change = opt.get("cost_change", 0)
                if cost_change < 0:  # Cost reduction
                    total_cost_reduction += abs(cost_change)
        
        # Calculate percentages
        latency_reduction_pct = (total_latency_reduction / current_latency * 100) if current_latency > 0 else 0.0
        
        # Success rate improvement is harder to predict, use conservative estimate
        success_rate_improvement = min(5.0, len(optimizations) * 1.0)  # Max 5% improvement
        
        return {
            "latency_reduction_percentage": round(latency_reduction_pct, 1),
            "cost_reduction_percentage": round(total_cost_reduction, 1),
            "success_rate_improvement_percentage": round(success_rate_improvement, 1),
        }
