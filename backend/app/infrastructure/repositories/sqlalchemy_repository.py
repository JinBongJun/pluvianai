from typing import Generic, TypeVar, Optional, List, Type
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.database import Base
from app.core.logging_config import logger
from app.infrastructure.repositories.base import BaseRepository
from app.infrastructure.repositories.exceptions import (
    RepositoryException,
    EntityAlreadyExistsError
)

T = TypeVar('T', bound=Base)

class SQLAlchemyRepository(BaseRepository[T], Generic[T]):
    """
    SQLAlchemy implementation of BaseRepository
    
    IMPORTANT: This repository does NOT commit transactions.
    Transaction lifecycle is managed by FastAPI's get_db() dependency.
    This ensures compatibility with existing codebase patterns.
    """
    
    def __init__(self, db: Session, model_class: Type[T]):
        super().__init__(db)
        self.model_class = model_class
    
    def find_by_id(self, id: int) -> Optional[T]:
        """
        Find entity by ID
        
        Note: Simple read operations don't need try-except overhead.
        Let SQLAlchemy exceptions bubble up to FastAPI handlers.
        """
        return self.db.query(self.model_class).filter(self.model_class.id == id).first()
    
    def find_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        """
        Find all entities with pagination
        
        Note: Simple read operations don't need try-except overhead.
        """
        return self.db.query(self.model_class).offset(offset).limit(limit).all()
    
    def save(self, entity: T) -> T:
        """
        Save entity WITHOUT committing
        
        Transaction commit is handled by get_db() dependency.
        This ensures compatibility with existing FastAPI patterns.
        
        For explicit commit scenarios (background tasks), use save_and_commit().
        """
        try:
            logger.debug(f"Adding {self.model_class.__name__} to session: {getattr(entity, 'id', 'new')}")
            self.db.add(entity)
            # Use flush() to get ID without committing
            # get_db() will handle commit at request end
            self.db.flush()
            self.db.refresh(entity)
            logger.debug(f"Added {self.model_class.__name__} to session: {entity.id}")
            return entity
        except IntegrityError as e:
            # Rollback is safe here - get_db() will also rollback, but that's idempotent
            self.db.rollback()
            logger.warning(f"Integrity error adding {self.model_class.__name__}: {e}")
            raise EntityAlreadyExistsError(f"Entity already exists: {e}") from e
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error adding {self.model_class.__name__} to session: {e}")
            raise RepositoryException(f"Failed to save entity: {e}") from e
    
    def save_and_commit(self, entity: T) -> T:
        """
        Save entity WITH explicit commit
        
        Use this ONLY when:
        - Working with background tasks (SessionLocal() directly)
        - Need explicit commit control
        - NOT using get_db() dependency
        
        For normal FastAPI endpoints, use save() instead.
        """
        try:
            logger.debug(f"Saving and committing {self.model_class.__name__}: {getattr(entity, 'id', 'new')}")
            self.db.add(entity)
            self.db.commit()
            self.db.refresh(entity)
            logger.info(f"Saved and committed {self.model_class.__name__}: {entity.id}")
            return entity
        except IntegrityError as e:
            self.db.rollback()
            logger.warning(f"Integrity error saving {self.model_class.__name__}: {e}")
            raise EntityAlreadyExistsError(f"Entity already exists: {e}") from e
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving {self.model_class.__name__}: {e}")
            raise RepositoryException(f"Failed to save entity: {e}") from e
    
    def delete(self, id: int) -> bool:
        """
        Delete entity WITHOUT committing
        
        Transaction commit is handled by get_db() dependency.
        """
        entity = self.find_by_id(id)
        if entity:
            logger.debug(f"Marking {self.model_class.__name__} {id} for deletion")
            self.db.delete(entity)
            # get_db() will handle commit
            return True
        return False
    
    def delete_and_commit(self, id: int) -> bool:
        """
        Delete entity WITH explicit commit
        
        Use this ONLY for background tasks or explicit commit scenarios.
        """
        try:
            entity = self.find_by_id(id)
            if entity:
                logger.debug(f"Deleting and committing {self.model_class.__name__}: {id}")
                self.db.delete(entity)
                self.db.commit()
                logger.info(f"Deleted and committed {self.model_class.__name__}: {id}")
                return True
            return False
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting {self.model_class.__name__} {id}: {e}")
            raise RepositoryException(f"Failed to delete entity: {e}") from e
    
    def count(self) -> int:
        """Count total entities"""
        return self.db.query(self.model_class).count()
    
    def bulk_delete(self, **filters) -> int:
        """
        Bulk delete entities matching filters
        
        Returns:
            Number of deleted entities
        """
        return self.db.query(self.model_class).filter_by(**filters).delete()
    
    def find_by_id_with_relationships(self, id: int, relationships: List[str]) -> Optional[T]:
        """
        Find entity by ID with eager loading of relationships
        
        Args:
            id: Entity ID
            relationships: List of relationship attribute names to eager load
            
        Example:
            project = repo.find_by_id_with_relationships(1, ['organization', 'members'])
        """
        from sqlalchemy.orm import joinedload
        query = self.db.query(self.model_class).filter(self.model_class.id == id)
        for rel in relationships:
            query = query.options(joinedload(getattr(self.model_class, rel)))
        return query.first()
