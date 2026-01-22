from app.core.exceptions import AgentGuardException

class RepositoryException(AgentGuardException):
    """Base exception for repository operations"""
    pass

class EntityNotFoundError(RepositoryException):
    """Entity not found exception"""
    def __init__(self, message: str = "Entity not found"):
        super().__init__(message, status_code=404)

class EntityAlreadyExistsError(RepositoryException):
    """Entity already exists exception"""
    def __init__(self, message: str = "Entity already exists"):
        super().__init__(message, status_code=409)
