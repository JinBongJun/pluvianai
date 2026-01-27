"""
Railway 프로덕션 데이터베이스 마이그레이션 스크립트
이 스크립트는 필요시 데이터베이스 마이그레이션을 실행합니다.

사용 방법:
1. Railway의 Variables 탭에서 DATABASE_URL 복사
2. 환경 변수로 설정하거나 스크립트 인자로 전달
3. 실행: python backend/scripts/run_migration.py
"""
import os
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

def run_migration(database_url: str = None):
    """데이터베이스 마이그레이션 실행"""
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
        print("데이터베이스 마이그레이션 실행 중...")
        print("참고: 일반적으로 'alembic upgrade head' 명령을 사용하세요.")
        print("이 스크립트는 특수한 경우에만 사용됩니다.")
        
        # Alembic을 사용한 마이그레이션 권장
        import subprocess
        result = subprocess.run(
            ["python", "-m", "alembic", "upgrade", "head"],
            cwd=str(PROJECT_ROOT / "backend"),
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("OK: 마이그레이션 성공!")
            print(result.stdout)
        else:
            print(f"ERROR: 마이그레이션 실패: {result.stderr}")
            sys.exit(1)
        
    except Exception as e:
        print(f"ERROR: 마이그레이션 실패: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    # 명령줄 인자로 DATABASE_URL 전달 가능
    db_url = sys.argv[1] if len(sys.argv) > 1 else None
    run_migration(db_url)
