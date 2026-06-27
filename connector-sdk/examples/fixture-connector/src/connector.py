import json
from datetime import datetime, timezone


def emit(event):
    print(json.dumps(event, ensure_ascii=False))


if __name__ == "__main__":
    now = datetime.now(timezone.utc).isoformat()
    emit({"type": "log", "level": "info", "message": "fixture connector started"})
    emit({"type": "program", "external_program_id": "fixture-program-001", "title": "Fixture 科技播客", "description": "测试节目"})
    emit(
        {
            "type": "episode",
            "external_episode_id": "fixture-episode-001",
            "program_external_id": "fixture-program-001",
            "title": "Fixture 第 1 期",
            "published_at": now,
            "description": "用于集成测试"
        }
    )
    emit(
        {
            "type": "media_ready",
            "external_episode_id": "fixture-episode-001",
            "file": "media/fixture-episode-001.mp3",
            "content_type": "audio/mpeg",
            "size": 1024,
            "checksum": "sha256:fixture"
        }
    )
    emit({"type": "completed", "summary": {"programs": 1, "episodes": 1, "media": 1}})
