
from sqlalchemy import func, case, select, desc
from sqlalchemy.dialects import postgresql
import os
import sys

# Mock classes to avoid import hell if needed, but let's try to import Snapshot
sys.path.append(os.getcwd())
from app.models.snapshot import Snapshot

def show_sql():
    project_id = 7
    limit = 30
    stmt = (
        select(
            Snapshot.agent_id,
            Snapshot.model,
            Snapshot.system_prompt,
            func.count(Snapshot.id).label("total"),
            func.max(Snapshot.created_at).label("last_seen"),
            func.json_agg(Snapshot.signal_result).label("all_signals"),
            func.count(case((Snapshot.is_worst == True, 1), else_=None)).label("worst_count")
        )
        .filter(Snapshot.project_id == project_id)
        .group_by(Snapshot.agent_id, Snapshot.model, Snapshot.system_prompt)
        .order_by(desc(func.max(Snapshot.created_at)))
        .limit(limit)
    )
    
    compiled = stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    print("--- COMPILED SQL ---")
    print(compiled)
    print("--------------------")

if __name__ == "__main__":
    show_sql()
