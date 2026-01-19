"""
Locust load test file for AgentGuard API
Usage: locust -f locustfile.py --host=http://localhost:8000
"""
from locust import HttpUser, task, between
import json
import random


class AgentGuardUser(HttpUser):
    """Simulates a typical AgentGuard user"""
    wait_time = between(1, 3)  # Wait 1-3 seconds between requests
    token = None
    project_id = None
    
    def on_start(self):
        """Called when a user starts"""
        # Login
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "testpassword"}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
            
            # Get projects
            projects_response = self.client.get("/api/v1/projects")
            if projects_response.status_code == 200:
                projects = projects_response.json()
                if projects:
                    self.project_id = projects[0].get("id")
    
    @task(5)
    def get_projects(self):
        """Get user's projects (most common)"""
        self.client.get("/api/v1/projects")
    
    @task(4)
    def get_api_calls(self):
        """Get API calls for a project"""
        if self.project_id:
            self.client.get(
                f"/api/v1/api-calls?project_id={self.project_id}&limit=10"
            )
    
    @task(3)
    def get_quality_scores(self):
        """Get quality scores"""
        if self.project_id:
            self.client.get(
                f"/api/v1/quality/scores?project_id={self.project_id}&limit=10"
            )
    
    @task(2)
    def get_drift_detections(self):
        """Get drift detections"""
        if self.project_id:
            self.client.get(
                f"/api/v1/drift/detections?project_id={self.project_id}&limit=10"
            )
    
    @task(2)
    def get_cost_analysis(self):
        """Get cost analysis"""
        if self.project_id:
            self.client.get(
                f"/api/v1/cost/analysis?project_id={self.project_id}&days=7"
            )
    
    @task(1)
    def health_check(self):
        """Health check endpoint"""
        self.client.get("/health")
    
    @task(1)
    def get_alerts(self):
        """Get alerts"""
        if self.project_id:
            self.client.get(
                f"/api/v1/alerts?project_id={self.project_id}&limit=10"
            )
