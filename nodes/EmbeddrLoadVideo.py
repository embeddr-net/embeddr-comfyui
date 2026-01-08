import requests
import torch
import numpy as np
import cv2
import tempfile
import os
import shutil
from comfy_api.latest import io, ui
from .utils import get_config


class EmbeddrLoadVideoNode(io.ComfyNode):
    _cache = {}

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.LoadVideo",
            display_name="Embeddr Load Video",
            description="Loads a video from Embeddr ID.",
            category="Embeddr",
            inputs=[
                io.String.Input("image_id", default=""),
                io.Int.Input("frame_load_cap", default=0, min=0, max=100000,
                             step=1, tooltip="Stop loading after this many frames (0=all)"),
                io.Int.Input("skip_first_frames", default=0, min=0, max=10000,
                             step=1, tooltip="Skip this many frames at the start"),
                io.Int.Input("select_every_nth", default=1, min=1,
                             max=100, step=1, tooltip="Load every Nth frame"),
                io.Int.Input("force_rate", default=0, min=0, max=120,
                             step=1, tooltip="Force playback FPS (0=original)"),
                io.Int.Input("custom_width", default=0, min=0, max=4096,
                             step=8, tooltip="Resize width (0=original)"),
                io.Int.Input("custom_height", default=0, min=0, max=4096,
                             step=8, tooltip="Resize height (0=original)"),
            ],
            outputs=[
                io.Image.Output("images"),
                io.Int.Output("frame_count"),
                # Removed experimental outputs for standard compatibility
                # io.Output("audio"),
                # io.Output("video_info"),
            ],
        )

    @classmethod
    def execute(cls, image_id, frame_load_cap, skip_first_frames, select_every_nth, force_rate, custom_width, custom_height):
        if not image_id:
            # Return empty
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty_image, 0)

        # URL construction
        try:
            config = get_config()
            endpoint = config.get("endpoint", "http://localhost:8003")
            endpoint = endpoint.rstrip("/")
            api_url = f"{endpoint}/api/v1/images/{image_id}/file"
        except Exception:
            print(f"[Embeddr] Could not get config for endpoint")
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty_image, 0)

        # Download to temp file
        temp_file_path = None
        try:
            # Check cache for path? For simplicity, we just download.
            # In production, we should cache the file path if it's the same ID.

            # Stream download
            with requests.get(api_url, stream=True) as r:
                r.raise_for_status()
                # Determine extension
                content_type = r.headers.get('content-type', '')
                ext = '.mp4'
                if 'quicktime' in content_type:
                    ext = '.mov'
                if 'webm' in content_type:
                    ext = '.webm'

                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
                    shutil.copyfileobj(r.raw, f)
                    temp_file_path = f.name

            # Open with CV2
            cap = cv2.VideoCapture(temp_file_path)
            if not cap.isOpened():
                raise ValueError(
                    f"Could not open video file: {temp_file_path}")

            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / fps if fps > 0 else 0

            # Determine target dimensions
            target_w, target_h = width, height
            if custom_width > 0:
                target_w = custom_width
                if custom_height == 0:
                    target_h = int(height * (custom_width / width))
            if custom_height > 0:
                target_h = custom_height
                if custom_width == 0:
                    target_w = int(width * (custom_height / height))

            # Ensure divisible by 2 for some codecs if needed, but for simple tensor it's fine.
            # ComfyUI usually expects divisible by 8 for VAEs?
            # We won't enforce it unless user sets it.

            frames = []

            current_frame = 0
            collected = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # Skip logic
                if current_frame < skip_first_frames:
                    current_frame += 1
                    continue

                if (current_frame - skip_first_frames) % select_every_nth != 0:
                    current_frame += 1
                    continue

                # Process frame
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                if target_w != width or target_h != height:
                    frame = cv2.resize(
                        frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

                # Normalize to 0-1
                frame = frame.astype(np.float32) / 255.0
                frames.append(frame)

                collected += 1
                if frame_load_cap > 0 and collected >= frame_load_cap:
                    break

                current_frame += 1
            cap.release()

            if not frames:
                empty_image = torch.zeros(
                    (1, 64, 64, 3), dtype=torch.float32, device="cpu")
                return io.NodeOutput(empty_image, 0)

            video_tensor = torch.from_numpy(np.stack(frames))
            # Shape is (B, H, W, C)

            final_fps = force_rate if force_rate > 0 else fps

            video_info = {
                "source_fps": fps,
                "source_frame_count": total_frames,
                "source_duration": duration,
                "source_width": width,
                "source_height": height,
                "loaded_fps": final_fps,
                "loaded_frame_count": len(frames),
                "loaded_width": target_w,
                "loaded_height": target_h,
            }

            # Audio - currently returning None/Empty as we don't have audio extraction logic
            # To support audio properly we'd need audio libraries unavailable in minimal env.
            audio = None

            return io.NodeOutput(video_tensor, len(frames))

        except Exception as e:
            print(f"[Embeddr] Error loading video: {e}")
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty_image, 0)

        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except:
                    pass
