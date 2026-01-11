"""
Railway 프로덕션 데이터베이스 마이그레이션 스크립트
DATABASE_URL 환경 변수를 사용하여 shadow_routing_config 컬럼을 추가합니다.

사용 방법:
1. Railway의 Variables 탭에서 DATABASE_URL 복사
2. 환경 변수로 설정하거나 스크립트 인자로 전달
3. 실행: python backend/scripts/run_migration.py
"""
import os
import sys
from sqlalchemy import create_engine, text, inspect
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

def run_migration(database_url: str = None):
    """shadow_routing_config 컬럼 추가"""
    if not database_url:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("ERROR: DATABASE_URL이 설정되지 않았습니다.")
            print("\n사용 방법:")
            print("1. Railway -> Variables 탭에서 DATABASE_URL 복사")
            print("2. 환경 변수로 설정:")
            print("   Windows PowerShell: $env:DATABASE_URL='your-database-url'")
            print("   Windows CMD: set DATABASE_URL=your-database-url")
            print("3. 또는 인자로 전달:")
            print("   python backend/scripts/run_migration.py 'your-database-url'")
            sys.exit(1)
    
    try:
        print("데이터베이스 연결 중...")
        engine = create_engine(database_url, pool_pre_ping=True)
        
        # 컬럼 존재 확인
        print("projects 테이블 확인 중...")
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('projects')]
        
        if 'shadow_routing_config' in columns:
            print("OK: shadow_routing_config 컬럼이 이미 존재합니다.")
            return
        
        # 컬럼 추가
        print("shadow_routing_config 컬럼 추가 중...")
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE projects 
                ADD COLUMN shadow_routing_config JSONB;
            """))
            conn.commit()
        
        print("OK: 마이그레이션 성공!")
        print("   shadow_routing_config 컬럼이 projects 테이블에 추가되었습니다.")
        
    except Exception as e:
        print(f"ERROR: 마이그레이션 실패: {str(e)}")
        if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
            print("   (컬럼이 이미 존재하는 것 같습니다. 무시해도 됩니다.)")
        else:
            sys.exit(1)

if __name__ == "__main__":
    # 명령줄 인자로 DATABASE_URL 전달 가능
    db_url = sys.argv[1] if len(sys.argv) > 1 else None
    run_migration(db_url)
