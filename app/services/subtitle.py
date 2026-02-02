"""Subtitle generation service using faster-whisper and FFmpeg."""
import asyncio
import logging
import os
import tempfile
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# Whisper model instance (lazy loaded)
_whisper_model = None


def _get_whisper_model():
    """Get or create Whisper model instance."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            # Use "base" model for speed, can upgrade to "large-v3" for accuracy
            # Use CPU by default, change to "cuda" if GPU available
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise
    return _whisper_model


def _generate_ass_subtitle(segments: list, video_width: int = 720, video_height: int = 1280) -> str:
    """
    Generate ASS subtitle content with TikTok/Reels style.

    Style:
    - White text with black outline
    - Bold sans-serif font
    - Centered at bottom
    - Large, readable font size
    """
    # ASS header with TikTok-style formatting
    # PlayResX/Y should match video resolution for proper scaling
    ass_content = f"""[Script Info]
Title: Auto Generated Subtitles
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    for segment in segments:
        start_time = _format_ass_time(segment["start"])
        end_time = _format_ass_time(segment["end"])
        text = segment["text"].strip()

        # Escape special characters and add line breaks for long text
        text = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

        # Split long lines (roughly 35 chars per line for mobile viewing)
        words = text.split()
        lines = []
        current_line = []
        current_length = 0

        for word in words:
            if current_length + len(word) + 1 > 35:
                if current_line:
                    lines.append(" ".join(current_line))
                current_line = [word]
                current_length = len(word)
            else:
                current_line.append(word)
                current_length += len(word) + 1

        if current_line:
            lines.append(" ".join(current_line))

        # Join lines with ASS newline
        formatted_text = "\\N".join(lines)

        ass_content += f"Dialogue: 0,{start_time},{end_time},Default,,0,0,0,,{formatted_text}\n"

    return ass_content


def _format_ass_time(seconds: float) -> str:
    """Format seconds to ASS time format (H:MM:SS.cc)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"


async def transcribe_video(video_path: str) -> list:
    """
    Transcribe video audio using Whisper.

    Returns list of segments with start, end, and text.
    """
    logger.info(f"Starting transcription for: {video_path}")

    def _transcribe():
        logger.info("Loading Whisper model...")
        model = _get_whisper_model()
        logger.info("Whisper model loaded, starting transcription...")

        segments, info = model.transcribe(
            video_path,
            beam_size=5,
            language=None,  # Auto-detect language
            vad_filter=True,  # Filter out non-speech
        )

        result = []
        for segment in segments:
            result.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
            })

        logger.info(f"Transcribed {len(result)} segments, detected language: {info.language}")
        return result

    # Run in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _transcribe)


async def add_subtitles_to_video(
    input_video_path: str,
    output_video_path: str,
    segments: Optional[list] = None,
) -> bool:
    """
    Add subtitles to video using FFmpeg.

    If segments is None, will transcribe the video first.
    """
    # Get video dimensions
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        input_video_path
    ]

    try:
        result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        dimensions = result.stdout.strip().split(",")
        video_width = int(dimensions[0]) if dimensions[0] else 720
        video_height = int(dimensions[1]) if len(dimensions) > 1 and dimensions[1] else 1280
    except Exception as e:
        logger.warning(f"Could not get video dimensions: {e}, using defaults")
        video_width, video_height = 720, 1280

    # Transcribe if no segments provided
    if segments is None:
        segments = await transcribe_video(input_video_path)

    if not segments:
        logger.warning("No speech detected in video, skipping subtitles")
        # Just copy the video without subtitles
        subprocess.run(["cp", input_video_path, output_video_path], check=True)
        return True

    # Generate ASS subtitle file
    ass_content = _generate_ass_subtitle(segments, video_width, video_height)

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".ass", delete=False) as f:
        f.write(ass_content)
        ass_path = f.name

    try:
        # Burn subtitles into video using FFmpeg
        # Use ass filter for styled subtitles
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", input_video_path,
            "-vf", f"ass={ass_path}",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "copy",
            output_video_path
        ]

        logger.info(f"Burning subtitles into video: {' '.join(ffmpeg_cmd)}")

        process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.error(f"FFmpeg error: {stderr.decode()}")
            return False

        logger.info("Subtitles burned successfully")
        return True

    finally:
        # Clean up temp file
        if os.path.exists(ass_path):
            os.remove(ass_path)


async def process_video_with_subtitles(video_bytes: bytes, filename: str) -> bytes:
    """
    Process video bytes: transcribe and add subtitles.

    Returns new video bytes with subtitles burned in.
    """
    logger.info(f"Starting subtitle processing for video ({len(video_bytes)} bytes)")

    # Create temp files
    temp_dir = tempfile.mkdtemp()
    input_path = os.path.join(temp_dir, "input.mp4")
    output_path = os.path.join(temp_dir, "output.mp4")

    try:
        # Write input video
        with open(input_path, "wb") as f:
            f.write(video_bytes)
        logger.info(f"Saved input video to {input_path}")

        # Add subtitles
        logger.info("Starting transcription and subtitle burn...")
        success = await add_subtitles_to_video(input_path, output_path)

        if not success or not os.path.exists(output_path):
            logger.error("Failed to add subtitles, returning original video")
            return video_bytes

        # Read output video
        with open(output_path, "rb") as f:
            result = f.read()
        logger.info(f"Subtitle processing complete, output size: {len(result)} bytes")
        return result

    except Exception as e:
        logger.error(f"Error in process_video_with_subtitles: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return video_bytes

    finally:
        # Clean up temp dir
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
