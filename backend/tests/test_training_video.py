from app.api import training as training_api

from tests.test_training import _teacher


def test_training_video_upload_and_authorized_stream(client, monkeypatch, tmp_path):
    teacher_headers = _teacher(client)
    topic = client.post(
        "/api/training/admin/topics",
        json={"title": "Видео для проверки", "material_text": "Материал", "published": True},
    ).json()
    monkeypatch.setattr(training_api, "VIDEO_ROOT", tmp_path)
    monkeypatch.setattr(training_api, "scan_upload", lambda *_args: None)

    def fake_encode(_data, asset_id, on_progress):
        on_progress(50)
        folder = tmp_path / asset_id
        (folder / "360p").mkdir(parents=True)
        (folder / "master.m3u8").write_text("#EXTM3U\n360p/index.m3u8\n")
        (folder / "360p" / "index.m3u8").write_text("#EXTM3U\nsegment_00000.ts\n")
        (folder / "360p" / "segment_00000.ts").write_bytes(b"segment")
        return [360]

    monkeypatch.setattr(training_api, "encode_video", fake_encode)
    assert client.post(
        f"/api/training/admin/topics/{topic['id']}/video",
        files={"file": ("lesson.mp4", b"video", "video/mp4")},
        headers={**teacher_headers, "X-Upload-Id": "a" * 32},
    ).status_code == 403
    upload = client.post(
        f"/api/training/admin/topics/{topic['id']}/video",
        files={"file": ("lesson.mp4", b"video", "video/mp4")},
        headers={"X-Upload-Id": "a" * 32},
    )
    assert upload.status_code == 200, upload.text
    url = upload.json()["video_url"]
    assert upload.json()["qualities"] == [360]
    assert client.get("/api/training/admin/video-jobs/" + "a" * 32).json() == {"stage": "Готово", "percent": 100}
    assert client.get(url, headers=teacher_headers).status_code == 200
    assert client.get(url.replace("master.m3u8", "360p/segment_00000.ts"), headers=teacher_headers).content == b"segment"
    assert client.get(url.replace("master.m3u8", "../wrong")).status_code == 404
    assert client.post(f"/api/training/admin/topics/{topic['id']}/video", files={"file": ("bad.txt", b"x")}, headers={"X-Upload-Id": "b" * 32}).status_code == 400
    assert client.delete(f"/api/training/admin/topics/{topic['id']}/video", headers=teacher_headers).status_code == 403
    removed = client.delete(f"/api/training/admin/topics/{topic['id']}/video")
    assert removed.status_code == 200 and removed.json()["video_url"] is None
    assert client.get(url, headers=teacher_headers).status_code == 404
    assert not (tmp_path / url.split("/")[4]).exists()
