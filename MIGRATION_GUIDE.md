# 데이터베이스 마이그레이션 가이드

AgentGuard는 Alembic을 사용하여 데이터베이스 스키마 변경을 관리합니다.

## 🚀 빠른 시작

### 초기 마이그레이션 생성

```bash
# 백엔드 디렉토리로 이동
cd backend

# 초기 마이그레이션 생성 (모든 모델을 스키마로 변환)
python -m alembic revision --autogenerate -m "Initial schema"

# 마이그레이션 적용
python -m alembic upgrade head
```

## 📋 일반적인 작업

### 새 마이그레이션 생성

모델을 변경한 후:

```bash
# 자동으로 변경사항 감지하여 마이그레이션 생성
python -m alembic revision --autogenerate -m "설명"

# 예시
python -m alembic revision --autogenerate -m "Add user avatar field"
```

### 마이그레이션 적용

```bash
# 모든 미적용 마이그레이션 적용
python -m alembic upgrade head

# 특정 버전까지 적용
python -m alembic upgrade <revision>
```

### 마이그레이션 롤백

```bash
# 한 단계 롤백
python -m alembic downgrade -1

# 특정 버전으로 롤백
python -m alembic downgrade <revision>

# 모든 마이그레이션 롤백
python -m alembic downgrade base
```

### 마이그레이션 상태 확인

```bash
# 현재 마이그레이션 상태 확인
python -m alembic current

# 마이그레이션 히스토리 확인
python -m alembic history
```

## 🛠️ 편리한 스크립트

### Linux/Mac

```bash
# 마이그레이션 적용
bash scripts/migrate.sh upgrade

# 마이그레이션 롤백
bash scripts/migrate.sh downgrade -1

# 새 마이그레이션 생성
bash scripts/migrate.sh revision "Add new field"
```

### Windows (PowerShell)

```powershell
# 마이그레이션 적용
.\scripts\migrate.ps1 upgrade

# 마이그레이션 롤백
.\scripts\migrate.ps1 downgrade -1

# 새 마이그레이션 생성
.\scripts\migrate.ps1 revision "Add new field"
```

## 🔄 CI/CD 통합

GitHub Actions에서 자동으로 마이그레이션을 검증합니다:

- ✅ 모델 변경 시 마이그레이션 필요 여부 확인
- ✅ 마이그레이션 문법 검증
- ✅ 마이그레이션 적용 테스트

## 📝 모델 변경 시 체크리스트

1. **모델 수정**
   ```python
   # backend/app/models/user.py
   class User(Base):
       # 새 필드 추가
       avatar_url = Column(String(255), nullable=True)
   ```

2. **마이그레이션 생성**
   ```bash
   python -m alembic revision --autogenerate -m "Add user avatar_url"
   ```

3. **마이그레이션 파일 검토**
   ```python
   # backend/alembic/versions/xxx_add_user_avatar_url.py
   def upgrade():
       op.add_column('users', sa.Column('avatar_url', sa.String(255), nullable=True))
   
   def downgrade():
       op.drop_column('users', 'avatar_url')
   ```

4. **로컬에서 테스트**
   ```bash
   python -m alembic upgrade head
   python -m alembic downgrade -1
   python -m alembic upgrade head
   ```

5. **커밋 및 푸시**
   ```bash
   git add alembic/versions/xxx_add_user_avatar_url.py
   git commit -m "feat: Add user avatar_url field"
   git push
   ```

## ⚠️ 주의사항

### 1. 데이터 손실 위험

마이그레이션을 롤백할 때 데이터가 손실될 수 있습니다:

```python
# ❌ 위험: 데이터 손실 가능
def downgrade():
    op.drop_column('users', 'email')  # 이메일 데이터 모두 삭제

# ✅ 안전: 데이터 보존
def downgrade():
    # 데이터 백업 후 삭제
    op.drop_column('users', 'email')
```

### 2. 인덱스 및 제약조건

인덱스나 외래키를 추가/제거할 때는 주의:

```python
def upgrade():
    # 인덱스 추가
    op.create_index('ix_users_email', 'users', ['email'])
    
    # 외래키 추가
    op.create_foreign_key('fk_projects_user', 'projects', 'users', ['owner_id'], ['id'])

def downgrade():
    op.drop_constraint('fk_projects_user', 'projects', type_='foreignkey')
    op.drop_index('ix_users_email', 'users')
```

### 3. 프로덕션 배포

프로덕션에서는:

1. **백업 먼저**
   ```bash
   # 데이터베이스 백업
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **마이그레이션 적용**
   ```bash
   python -m alembic upgrade head
   ```

3. **검증**
   ```bash
   # 애플리케이션 정상 작동 확인
   curl https://api.agentguard.com/health
   ```

4. **문제 발생 시 롤백**
   ```bash
   python -m alembic downgrade -1
   # 또는 백업 복원
   psql $DATABASE_URL < backup.sql
   ```

## 🔍 문제 해결

### 마이그레이션 충돌

여러 브랜치에서 동시에 마이그레이션을 생성한 경우:

```bash
# 1. 최신 마이그레이션 확인
python -m alembic history

# 2. 충돌하는 마이그레이션 병합
# 수동으로 두 마이그레이션을 하나로 합치기

# 3. 새 마이그레이션 생성
python -m alembic revision -m "Merge migrations"
```

### 마이그레이션 실패

```bash
# 1. 현재 상태 확인
python -m alembic current

# 2. 실패한 마이그레이션 확인
python -m alembic history

# 3. 수동으로 수정 후 재시도
python -m alembic upgrade head
```

## 📚 추가 리소스

- [Alembic 공식 문서](https://alembic.sqlalchemy.org/)
- [SQLAlchemy 마이그레이션 가이드](https://docs.sqlalchemy.org/en/20/core/metadata.html)

---

**마이그레이션은 데이터베이스 스키마 변경의 안전한 방법입니다. 항상 마이그레이션을 사용하세요!** 🚀
