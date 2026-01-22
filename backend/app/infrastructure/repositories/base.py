from abc import ABC, abstractmethod
from typing import Generic, TypeVar, Optional, List, Type
from sqlalchemy.orm import Session
from app.core.database import Base

T = TypeVar('T', bound=Base)

class BaseRepository(ABC, Generic[T]):
    """Base repository interface following OCP principle"""
    
    def __init__(self, db: Session):
        self.db = db
    
    @abstractmethod
    def find_by_id(self, id: int) -> Optional[T]:
        """Find entity by ID"""
        pass
    
    @abstractmethod
    def find_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        """Find all entities with pagination"""
        pass
    
    @abstractmethod
    def save(self, entity: T) -> T:
        """Save entity (create or update)"""
        pass
    
    @abstractmethod
    def delete(self, id: int) -> bool:
        """Delete entity by ID"""
        pass
    
    # 확장 가능한 메서드 (서브클래스에서 override 가능)
    def count(self) -> int:
        """Count total entities"""
        raise NotImplementedError("Subclass must implement count()")
    
    def exists(self, id: int) -> bool:
        """Check if entity exists"""
        return self.find_by_id(id) is not None
