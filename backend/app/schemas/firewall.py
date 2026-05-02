from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.firewall_rule import FirewallAction, FirewallRuleType, FirewallSeverity


class FirewallRuleCreate(BaseModel):
    name: str
    rule_type: FirewallRuleType
    action: FirewallAction
    severity: FirewallSeverity = FirewallSeverity.MEDIUM
    pattern: Optional[str] = None
    enabled: bool = True


class FirewallRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[FirewallRuleType] = None
    action: Optional[FirewallAction] = None
    severity: Optional[FirewallSeverity] = None
    pattern: Optional[str] = None
    enabled: Optional[bool] = None


class FirewallRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    rule_type: FirewallRuleType
    action: FirewallAction
    severity: FirewallSeverity
    pattern: Optional[str]
    enabled: bool
