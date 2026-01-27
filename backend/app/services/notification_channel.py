"""
Notification Channel Interface - Common interface for all notification channels
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class NotificationChannel(ABC):
    """Base interface for notification channels"""
    
    @property
    @abstractmethod
    def enabled(self) -> bool:
        """Check if this notification channel is enabled"""
        pass
    
    @abstractmethod
    async def send_alert(
        self,
        title: str,
        message: str,
        level: str = "medium",
        project_name: Optional[str] = None,
        dashboard_url: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send alert through this channel
        
        Args:
            title: Alert title
            message: Alert message
            level: Alert level (critical, high, medium, low)
            project_name: Optional project name
            dashboard_url: Optional dashboard URL
            **kwargs: Channel-specific parameters
        
        Returns:
            Dict with status and result information:
            - status: str ("success" or "error")
            - message: str
            - channel: str (channel name)
        """
        pass
