#!/bin/bash
# Database migration script
# Usage: ./scripts/migrate.sh [upgrade|downgrade|revision] [args]

set -e

cd "$(dirname "$0")/.."

ACTION=${1:-upgrade}
ARGS=${@:2}

case $ACTION in
  upgrade)
    echo "🔄 Running database migrations..."
    python -m alembic upgrade head
    echo "✅ Migrations applied successfully"
    ;;
  downgrade)
    echo "🔄 Downgrading database..."
    if [ -z "$ARGS" ]; then
      echo "❌ Please specify revision: ./scripts/migrate.sh downgrade -1"
      exit 1
    fi
    python -m alembic downgrade $ARGS
    echo "✅ Database downgraded successfully"
    ;;
  revision)
    echo "📝 Creating new migration..."
    if [ -z "$ARGS" ]; then
      echo "❌ Please specify message: ./scripts/migrate.sh revision 'add new field'"
      exit 1
    fi
    python -m alembic revision --autogenerate -m "$ARGS"
    echo "✅ Migration created successfully"
    ;;
  *)
    echo "Usage: $0 [upgrade|downgrade|revision] [args]"
    echo ""
    echo "Examples:"
    echo "  $0 upgrade                    # Apply all pending migrations"
    echo "  $0 downgrade -1               # Rollback one migration"
    echo "  $0 revision 'add new field'   # Create new migration"
    exit 1
    ;;
esac
