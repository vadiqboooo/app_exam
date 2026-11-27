"""Turn a checked training upload into an adaptive HLS video."""

import json
import shutil
import subprocess
from pathlib import Path
from typing import Callable

from fastapi import HTTPException

from app.config import DATA_ROOT

VIDEO_ROOT = DATA_ROOT / "data" / "training-videos"
MAX_VIDEO_BYTES = 300 * 1024 * 1024
LEVELS = ((360, 800_000), (720, 2_500_000), (1080, 5_000_000))


def encode_video(data: bytes, asset_id: str, on_progress: Callable[[int], None] | None = None) -> list[int]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise HTTPException(503, "Для загрузки видео установите FFmpeg и FFprobe на сервере")
    folder = VIDEO_ROOT / asset_id
    folder.mkdir(parents=True, exist_ok=False)
    source = folder / "source"
    source.write_bytes(data)
    try:
        probe = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=width,height:format=duration", "-of", "json", str(source)],
            capture_output=True, text=True, timeout=30, check=False,
        )
        streams = json.loads(probe.stdout or "{}").get("streams", [])
        if probe.returncode or not streams or not streams[0].get("height"):
            raise HTTPException(422, "Не удалось прочитать видеофайл")
        height = int(streams[0]["height"])
        width = int(streams[0].get("width") or 0)
        duration = float(json.loads(probe.stdout).get("format", {}).get("duration") or 0)
        if width < 2 or height < 2:
            raise HTTPException(422, "Некорректное разрешение видео")
        levels = [(h, bitrate) for h, bitrate in LEVELS if h <= height]
        if not levels:
            levels = [(height - height % 2, 500_000)]
        master = ["#EXTM3U", "#EXT-X-VERSION:3"]
        for level_index, (target_height, bitrate) in enumerate(levels):
            variant = folder / f"{target_height}p"
            variant.mkdir()
            command = [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(source),
                "-vf", f"scale=-2:{target_height}", "-c:v", "libx264", "-preset", "veryfast",
                "-pix_fmt", "yuv420p", "-b:v", str(bitrate), "-maxrate", str(bitrate),
                "-bufsize", str(bitrate * 2), "-c:a", "aac", "-b:a", "128k",
                "-force_key_frames", "expr:gte(t,n_forced*4)", "-progress", "pipe:1",
                "-hls_time", "4",
                "-hls_playlist_type", "vod", "-hls_segment_filename",
                str(variant / "segment_%05d.ts"), str(variant / "index.m3u8"),
            ]
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
                assert process.stdout is not None
                for line in process.stdout:
                    if on_progress and duration > 0 and line.startswith("out_time="):
                        try:
                            hours, minutes, seconds = line.split("=", 1)[1].strip().split(":")
                            elapsed = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
                            on_progress(min(99, int((level_index + min(elapsed / duration, 1)) / len(levels) * 100)))
                        except ValueError:
                            pass
                try:
                    process.wait(timeout=3600)
                except subprocess.TimeoutExpired as error:
                    process.kill()
                    process.wait()
                    raise HTTPException(422, "Превышено время обработки видео") from error
                if process.returncode or not (variant / "index.m3u8").is_file():
                    raise HTTPException(422, "Не удалось подготовить видео для просмотра")
            if not (variant / "index.m3u8").is_file():
                raise HTTPException(422, "Не удалось подготовить видео для просмотра")
            output_width = max(2, round(width * target_height / height / 2) * 2)
            master.extend([
                f"#EXT-X-STREAM-INF:BANDWIDTH={bitrate + 128000},RESOLUTION={output_width}x{target_height}",
                f"{target_height}p/index.m3u8",
            ])
        (folder / "master.m3u8").write_text("\n".join(master) + "\n", encoding="utf-8")
        if on_progress:
            on_progress(100)
        return [h for h, _ in levels]
    except (subprocess.TimeoutExpired, OSError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(422, "Не удалось обработать видеофайл") from error
    finally:
        source.unlink(missing_ok=True)
        if not (folder / "master.m3u8").is_file():
            shutil.rmtree(folder, ignore_errors=True)
