"""
Onboarding service for Quick Start guides and Magic Setup Playground.
"""

import hashlib
import secrets
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.logging_config import logger
from app.models.api_key import APIKey
from app.models.project import Project
from app.models.snapshot import Snapshot
from app.models.user import User


class OnboardingService:
    """Service for onboarding functionality"""

    def __init__(self, db: Session):
        self.db = db

    def generate_quick_start_guide(
        self,
        user_id: int,
        project_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate Quick Start guide with code examples.
        
        Args:
            user_id: User ID
            project_id: Optional project ID (uses first project if not provided)
            
        Returns:
            Dict with curl_command, python_code, node_code, api_key, project_id, base_url
            
        Raises:
            ValueError: If user not found
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")

        api_key = self._get_or_create_api_key(user_id)
        
        if not project_id:
            project = self.db.query(Project).filter(Project.owner_id == user_id).first()
            project_id = project.id if project else None

        # Determine base URL
        base_url = "https://api.agentguard.ai"
        if settings.CORS_ORIGINS and settings.CORS_ORIGINS != "*":
            origins = settings.CORS_ORIGINS.split(",")
            if origins:
                base_url = origins[0].strip()
                if not base_url.startswith("http"):
                    base_url = f"https://{base_url}"

        project_id_str = str(project_id) if project_id else "YOUR_PROJECT_ID"
        endpoint = f"{base_url}/api/v1/proxy/openai/v1/chat/completions"
        
        curl_command = (
            f"curl -X POST {endpoint} \\\n"
            f'  -H "Authorization: Bearer {api_key}" \\\n'
            f'  -H "Content-Type: application/json" \\\n'
            f'  -H "X-Project-ID: {project_id_str}" \\\n'
            f'  -d \'{{"model": "gpt-3.5-turbo", "messages": [{{"role": "user", "content": "Hello!"}}]}}\''
        )

        python_code = (
            "import httpx\n\n"
            f'response = httpx.post(\n'
            f'    "{endpoint}",\n'
            f'    headers={{\n'
            f'        "Authorization": "Bearer {api_key}",\n'
            f'        "Content-Type": "application/json",\n'
            f'        "X-Project-ID": "{project_id_str}"\n'
            f'    }},\n'
            f'    json={{\n'
            f'        "model": "gpt-3.5-turbo",\n'
            f'        "messages": [{{"role": "user", "content": "Hello!"}}]\n'
            f'    }}\n'
            f')\n'
            f'print(response.json())'
        )

        node_code = (
            "const fetch = require('node-fetch');\n\n"
            f"fetch('{endpoint}', {{\n"
            f"  method: 'POST',\n"
            f"  headers: {{\n"
            f"    'Authorization': 'Bearer {api_key}',\n"
            f"    'Content-Type': 'application/json',\n"
            f"    'X-Project-ID': '{project_id_str}'\n"
            f"  }},\n"
            f"  body: JSON.stringify({{\n"
            f"    model: 'gpt-3.5-turbo',\n"
            f"    messages: [{{ role: 'user', content: 'Hello!' }}]\n"
            f"  }})\n"
            f"}})\n"
            f".then(res => res.json())\n"
            f".then(data => console.log(data));"
        )

        return {
            "curl_command": curl_command,
            "python_code": python_code,
            "node_code": node_code,
            "api_key": api_key,
            "project_id": project_id,
            "base_url": base_url,
        }

    def _get_or_create_api_key(self, user_id: int) -> str:
        """
        Create a new API key for onboarding.
        
        Note: API keys are hashed using SHA256 to match get_user_from_api_key lookup.
        The plaintext key is returned only once during onboarding, then never again.
        
        Args:
            user_id: User ID to create API key for
            
        Returns:
            Plaintext API key (shown once, then never again)
        """
        # Generate secure API key
        api_key_value = f"ag_live_{secrets.token_urlsafe(24)}"
        key_hash = hashlib.sha256(api_key_value.encode()).hexdigest()

        # Create new API key record
        api_key_obj = APIKey(
            user_id=user_id,
            key_hash=key_hash,
            name="Default API Key",
            is_active=True,
        )
        self.db.add(api_key_obj)
        self.db.flush()

        logger.info(
            f"API key created for user {user_id} during onboarding",
            extra={"user_id": user_id}
        )
        return api_key_value

    def simulate_virtual_traffic(self, user_id: int, project_id: int) -> Dict[str, Any]:
        """
        Generate virtual agent traffic for Magic Setup Playground.
        
        Creates sample snapshots to demonstrate the tool functionality.
        
        Args:
            user_id: User ID (for access verification)
            project_id: Project ID to create snapshots for
            
        Returns:
            Dict with snapshots_created, snapshots list, and message
            
        Raises:
            ValueError: If project not found or access denied
        """
        from app.models.trace import Trace
        
        project = self.db.query(Project).filter(
            Project.id == project_id,
            Project.owner_id == user_id
        ).first()
        
        if not project:
            raise ValueError("Project not found or access denied")

        sample_messages = [
            {"role": "user", "content": "What is the weather today?"},
            {"role": "user", "content": "Explain quantum computing"},
            {"role": "user", "content": "Write a Python function to sort a list"},
        ]

        created_snapshots = []
        for i, message in enumerate(sample_messages, start=1):
            trace_id = f"sim_{secrets.token_urlsafe(16)}"
            trace = Trace(id=trace_id, project_id=project_id)
            self.db.add(trace)
            self.db.flush()
            
            snapshot = Snapshot(
                trace_id=trace_id,
                provider="openai",
                model="gpt-3.5-turbo",
                payload={
                    "messages": [message],
                    "model": "gpt-3.5-turbo",
                },
                is_sanitized=False,
                status_code=200,
            )
            self.db.add(snapshot)
            created_snapshots.append({
                "id": i,
                "message": message["content"],
                "model": "gpt-3.5-turbo",
            })

        self.db.flush()

        return {
            "snapshots_created": len(created_snapshots),
            "snapshots": created_snapshots,
            "message": "Virtual traffic generated successfully! Check your dashboard.",
        }

    def check_onboarding_status(self, user_id: int) -> Dict[str, Any]:
        """
        Check if user has completed onboarding.
        
        Args:
            user_id: User ID to check
            
        Returns:
            Dict with onboarding status and step completion flags
            
        Raises:
            ValueError: If user not found
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")

        from app.models.trace import Trace
        from app.models.user_agreement import UserAgreement
        
        project_count = self.db.query(Project).filter(
            Project.owner_id == user_id
        ).count()
        has_project = project_count > 0

        snapshot_count = (
            self.db.query(Snapshot)
            .join(Trace)
            .join(Project)
            .filter(Project.owner_id == user_id)
            .count()
        )
        has_snapshot = snapshot_count > 0

        agreement = self.db.query(UserAgreement).filter(
            UserAgreement.user_id == user_id
        ).first()
        has_agreement = (
            agreement.liability_agreement_accepted
            if agreement and agreement.liability_agreement_accepted
            else False
        )

        return {
            "completed": has_project and has_snapshot and has_agreement,
            "has_project": has_project,
            "has_snapshot": has_snapshot,
            "has_agreement": has_agreement,
            "project_count": project_count,
            "snapshot_count": snapshot_count,
        }

    def celebrate_first_snapshot(
        self,
        user_id: int,
        project_id: int
    ) -> Dict[str, Any]:
        """
        Check if this is user's first snapshot and return celebration data.
        
        Args:
            user_id: User ID
            project_id: Project ID
            
        Returns:
            Dict with is_first_snapshot flag and celebration message if first
        """
        from app.models.trace import Trace
        
        snapshot_count = (
            self.db.query(Snapshot)
            .join(Trace)
            .join(Project)
            .filter(
                Project.owner_id == user_id,
                Project.id == project_id
            )
            .count()
        )

        if snapshot_count == 1:
            return {
                "is_first_snapshot": True,
                "message": "🎉 Congratulations! Your first snapshot has been created!",
                "next_steps": [
                    "View your snapshot in the dashboard",
                    "Try replaying it with a different model",
                    "Set up evaluation rubrics",
                ],
            }

        return {
            "is_first_snapshot": False,
            "message": None,
        }
