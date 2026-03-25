import base64
import json
import mimetypes
import os
import platform
import re
import shutil
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import onnxruntime
import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import modules.globals
from modules.face_analyser import get_many_faces
from modules.processors.frame.core import get_frame_processors_modules
from modules.utilities import (
    create_temp,
    extract_frames,
    get_temp_frame_paths,
    detect_fps,
    create_video,
    restore_audio,
    move_temp,
    clean_temp,
    is_video,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURE_DIR = os.path.join(BASE_DIR, 'captures')
VIDEOS_DIR = os.path.join(BASE_DIR, 'videos')
OUTPUTS_DIR = os.path.join(BASE_DIR, 'outputs')
ASSETS_COSTUMES_DIR = os.path.join(BASE_DIR, 'assets', 'costumes')
DATA_DIR = os.path.join(BASE_DIR, 'data')
COSTUMES_JSON_PATH = os.path.join(DATA_DIR, 'costumes.json')

for d in (CAPTURE_DIR, VIDEOS_DIR, OUTPUTS_DIR, ASSETS_COSTUMES_DIR, DATA_DIR):
    os.makedirs(d, exist_ok=True)

DEFAULT_CORS_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]
EXTRA_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
    if origin.strip()
]

app = FastAPI(title='Deep Live Cam API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_CORS_ORIGINS + EXTRA_CORS_ORIGINS,
    # Allow temporary FE URLs from ngrok without hardcoding each subdomain.
    allow_origin_regex=r'^https://([a-z0-9-]+\.)?(ngrok\.io|ngrok-free\.app)$',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.mount('/assets', StaticFiles(directory=os.path.join(BASE_DIR, 'assets')), name='assets')

JOBS = {}
JOBS_LOCK = threading.Lock()
PROCESS_LOCK = threading.Lock()


class CapturePayload(BaseModel):
    image: str


class StartPayload(BaseModel):
    capture_filename: str
    costume_id: Optional[str] = None
    costumeId: Optional[str] = None
    target_filename: Optional[str] = None


def suggest_max_memory() -> int:
    if platform.system().lower() == 'darwin':
        return 4
    return 16


def suggest_execution_threads() -> int:
    cpu_count = os.cpu_count() or 4
    providers = modules.globals.execution_providers or []
    if 'DmlExecutionProvider' in providers:
        return 1
    if 'ROCMExecutionProvider' in providers:
        return 1
    if 'CUDAExecutionProvider' in providers:
        return min(cpu_count, 16)
    return max(4, min(cpu_count - 2, 16))


def pre_check() -> bool:
    if sys.version_info < (3, 9):
        return False
    if not shutil.which('ffmpeg'):
        return False
    return True


def limit_resources() -> None:
    if modules.globals.max_memory:
        memory = modules.globals.max_memory * 1024 ** 3
        if platform.system().lower() == 'darwin':
            memory = modules.globals.max_memory * 1024 ** 6
        if platform.system().lower() == 'windows':
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetProcessWorkingSetSize(-1, ctypes.c_size_t(memory), ctypes.c_size_t(memory))
        else:
            import resource
            resource.setrlimit(resource.RLIMIT_DATA, (memory, memory))


def release_resources() -> None:
    if 'CUDAExecutionProvider' in (modules.globals.execution_providers or []):
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass


def _decode_data_url(data_url: str) -> bytes:
    if not data_url or not data_url.startswith('data:'):
        raise ValueError('Invalid data URL')
    try:
        header, b64_data = data_url.split(',', 1)
    except ValueError as exc:
        raise ValueError('Invalid data URL') from exc
    if 'base64' not in header:
        raise ValueError('Image must be base64-encoded')
    try:
        return base64.b64decode(b64_data.strip(), validate=True)
    except Exception as exc:
        raise ValueError('Failed to decode image data') from exc


def _ensure_face_detection_providers() -> None:
    if modules.globals.execution_providers:
        return
    available = onnxruntime.get_available_providers()
    if 'CUDAExecutionProvider' in available:
        modules.globals.execution_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    elif 'CPUExecutionProvider' in available:
        modules.globals.execution_providers = ['CPUExecutionProvider']
    else:
        modules.globals.execution_providers = available


def _count_faces_in_image(raw_image: bytes) -> int:
    frame = cv2.imdecode(np.frombuffer(raw_image, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError('Captured image cannot be decoded')
    _ensure_face_detection_providers()
    faces = get_many_faces(frame) or []
    return len(faces)


def _select_target_video(filename: Optional[str]) -> str:
    if filename:
        path = os.path.join(VIDEOS_DIR, filename)
        if not os.path.isfile(path) or not is_video(path):
            raise ValueError('Target video not found in videos folder')
        return path

    candidates = []
    for name in os.listdir(VIDEOS_DIR):
        path = os.path.join(VIDEOS_DIR, name)
        if os.path.isfile(path) and is_video(path):
            candidates.append(path)

    if not candidates:
        raise ValueError('No target video found in videos folder')

    candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return candidates[0]


def _select_target_video_by_costume(costume_id: str) -> str:
    costumes = _load_costumes()
    _, item = _find_costume(costumes, costume_id)
    if not item:
        raise ValueError('Costume not found')
    if not item.get('isActive', True):
        raise ValueError('Costume is inactive')

    video_path = str(item.get('videoPath', '')).strip()
    if not video_path:
        raise ValueError('Costume videoPath is missing')

    path = os.path.join(BASE_DIR, video_path.replace('/', os.sep))
    if not os.path.isfile(path) or not is_video(path):
        raise ValueError('Costume target video not found')
    return path


def _update_job(job_id: str, **kwargs) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job.update(kwargs)


def _slugify(value: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', (value or '').strip().lower())
    slug = slug.strip('-')
    return slug or uuid.uuid4().hex[:8]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _load_costumes() -> list:
    if not os.path.isfile(COSTUMES_JSON_PATH):
        with open(COSTUMES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=True, indent=2)
        return []

    try:
        with open(COSTUMES_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _save_costumes(costumes: list) -> None:
    with open(COSTUMES_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(costumes, f, ensure_ascii=True, indent=2)


def _find_costume(costumes: list, costume_id: str) -> tuple[int, dict]:
    for index, item in enumerate(costumes):
        if item.get('id') == costume_id:
            return index, item
    return -1, {}


def _bool_from_form(value: Optional[str], default: bool = True) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_gender(value: str) -> str:
    gender = str(value or '').strip().lower()
    if gender not in {'male', 'female'}:
        raise ValueError("gender must be 'male' or 'female'")
    return gender


def _save_upload_file(file: UploadFile, dst_path: str) -> None:
    with open(dst_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)


def _prune_output_files(max_files: int = 3, preserve_paths: Optional[set[str]] = None) -> None:
    if max_files < 0:
        max_files = 0
    preserve_paths = {os.path.abspath(p) for p in (preserve_paths or set())}

    files = []
    for name in os.listdir(OUTPUTS_DIR):
        path = os.path.join(OUTPUTS_DIR, name)
        if not os.path.isfile(path):
            continue
        abs_path = os.path.abspath(path)
        if abs_path in preserve_paths:
            continue
        files.append(abs_path)

    if len(files) <= max_files:
        return

    files.sort(key=lambda p: os.path.getmtime(p))
    to_delete = files[:len(files) - max_files]
    for path in to_delete:
        try:
            os.remove(path)
        except Exception:
            pass


def _safe_ext(filename: str, fallback: str) -> str:
    ext = os.path.splitext(filename or '')[1].lower()
    if not ext or len(ext) > 8 or not re.fullmatch(r'\.[a-z0-9]+', ext):
        return fallback
    return ext


def _abs_from_rel_path(rel_path: str) -> str:
    return os.path.join(BASE_DIR, rel_path.replace('/', os.sep))


def _enforce_costume_media_files(item: dict) -> None:
    costume_id = str(item.get('id') or '').strip()
    video_rel = str(item.get('videoPath') or '').strip()
    thumb_rel = str(item.get('thumbPath') or '').strip()
    if not costume_id or not video_rel or not thumb_rel:
        raise ValueError('Costume media paths are invalid')

    costume_dir = os.path.join(ASSETS_COSTUMES_DIR, costume_id)
    os.makedirs(costume_dir, exist_ok=True)

    video_abs = _abs_from_rel_path(video_rel)
    thumb_abs = _abs_from_rel_path(thumb_rel)
    if not os.path.isfile(video_abs):
        raise ValueError('Costume video file is missing')
    if not os.path.isfile(thumb_abs):
        raise ValueError('Costume thumbnail file is missing')

    keep_files = {os.path.basename(video_abs), os.path.basename(thumb_abs)}
    for entry in os.listdir(costume_dir):
        entry_path = os.path.join(costume_dir, entry)
        if os.path.isfile(entry_path) and entry not in keep_files:
            os.remove(entry_path)
        elif os.path.isdir(entry_path):
            shutil.rmtree(entry_path, ignore_errors=True)

    files = [f for f in os.listdir(costume_dir) if os.path.isfile(os.path.join(costume_dir, f))]
    if len(files) != 2 or set(files) != keep_files:
        raise ValueError('Costume folder must contain exactly 1 video and 1 thumbnail')


def _thumb_to_data_url(item: dict) -> str:
    thumb_rel = str(item.get('thumbPath') or '').strip()
    if not thumb_rel:
        return ''
    thumb_abs = _abs_from_rel_path(thumb_rel)
    if not os.path.isfile(thumb_abs):
        return ''
    mime_type = mimetypes.guess_type(thumb_abs)[0] or 'application/octet-stream'
    with open(thumb_abs, 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime_type};base64,{encoded}'


def _serialize_costume(item: dict, include_thumb_base64: bool = False) -> dict:
    payload = dict(item)
    if include_thumb_base64:
        payload['thumbBase64'] = _thumb_to_data_url(item)
    return payload


def _init_globals(source_path: str, target_path: str, output_path: str) -> None:
    modules.globals.source_path = source_path
    modules.globals.target_path = target_path
    modules.globals.output_path = output_path
    modules.globals.frame_processors = ['face_swapper']
    modules.globals.keep_fps = True
    modules.globals.keep_audio = True
    modules.globals.keep_frames = False
    modules.globals.many_faces = False
    modules.globals.map_faces = False
    modules.globals.nsfw_filter = False
    modules.globals.video_encoder = modules.globals.video_encoder or 'libx264'
    modules.globals.video_quality = modules.globals.video_quality or 18
    modules.globals.headless = True
    modules.globals.fp_ui = {
        'face_enhancer': False,
        'face_enhancer_gpen256': False,
        'face_enhancer_gpen512': False,
    }
    modules.globals.source_target_map = []
    modules.globals.simple_map = {}

    providers = onnxruntime.get_available_providers()
    if 'CUDAExecutionProvider' not in providers:
        raise RuntimeError('CUDAExecutionProvider not available. Install onnxruntime-gpu and CUDA drivers.')
    modules.globals.execution_providers = ['CUDAExecutionProvider']
    modules.globals.execution_threads = suggest_execution_threads()
    modules.globals.max_memory = suggest_max_memory()


def _run_swap_job(job_id: str, source_path: str, target_path: str, output_path: str, api_base_url: str) -> None:
    with PROCESS_LOCK:
        _update_job(job_id, status='running', progress=1, message='Preparing')
        try:
            _init_globals(source_path, target_path, output_path)

            if not pre_check():
                raise RuntimeError('Pre-check failed (ffmpeg or python)')

            frame_processors = get_frame_processors_modules(modules.globals.frame_processors)
            for frame_processor in frame_processors:
                if not frame_processor.pre_check():
                    raise RuntimeError(f'Pre-check failed for {frame_processor.NAME}')
                if not frame_processor.pre_start():
                    raise RuntimeError(f'Pre-start failed for {frame_processor.NAME}')

            limit_resources()

            _update_job(job_id, progress=5, message='Extracting frames', stage='extracting')
            create_temp(target_path)
            extract_frames(target_path)

            temp_frame_paths = get_temp_frame_paths(target_path)
            total_frames = len(temp_frame_paths)
            if total_frames == 0:
                raise RuntimeError('No frames extracted from target video')

            _update_job(job_id, progress=15, message='Processing frames', stage='processing', total_frames=total_frames, processed_frames=0)
            processing_start = time.time()
            total_processors = max(1, len(frame_processors))
            total_units = max(1, total_frames * total_processors)
            last_progress = 15

            for processor_index, frame_processor in enumerate(frame_processors):
                def _api_progress_callback(done_frames: int, processor_total: int) -> None:
                    nonlocal last_progress
                    safe_total = max(1, processor_total)
                    safe_done = max(0, min(done_frames, safe_total))
                    completed_units = processor_index * total_frames + safe_done
                    progress_value = 15 + int((completed_units / total_units) * 70)
                    progress_value = max(15, min(progress_value, 84))
                    if progress_value > last_progress:
                        last_progress = progress_value
                    _update_job(
                        job_id,
                        progress=last_progress,
                        message='Processing frames',
                        stage='processing',
                        total_frames=total_frames,
                        processed_frames=safe_done,
                    )

                modules.globals.api_progress_callback = _api_progress_callback
                frame_processor.process_video(source_path, temp_frame_paths)

            modules.globals.api_progress_callback = None
            processing_time = time.time() - processing_start
            speed_fps = total_frames / processing_time if processing_time > 0 else 0
            _update_job(job_id, progress=85, speed_fps=round(speed_fps, 2), processed_frames=total_frames)

            _update_job(job_id, progress=90, message='Encoding video', stage='encoding')
            if modules.globals.keep_fps:
                fps = detect_fps(target_path)
                create_video(target_path, fps)
            else:
                create_video(target_path)

            _update_job(job_id, progress=95, message='Finalizing output', stage='finalizing')
            if modules.globals.keep_audio:
                restore_audio(target_path, output_path)
            else:
                move_temp(target_path, output_path)

            _prune_output_files(max_files=3, preserve_paths={output_path})
            clean_temp(target_path)
            release_resources()

            preview_url = f"{api_base_url}/preview/{job_id}"
            _update_job(job_id, status='done', progress=100, message='Done', stage='done', preview_url=preview_url, processed_frames=total_frames)
        except Exception as exc:
            modules.globals.api_progress_callback = None
            try:
                clean_temp(target_path)
            except Exception:
                pass
            _update_job(job_id, status='error', message=str(exc), stage='error')


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/capture')
def capture(payload: CapturePayload):
    try:
        raw = _decode_data_url(payload.image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    filename = f"capture_{uuid.uuid4().hex}.png"
    path = os.path.join(CAPTURE_DIR, filename)
    with open(path, 'wb') as f:
        f.write(raw)

    return {'ok': True, 'filename': filename}


@app.post('/capture-confirmation')
def capture_confirmation(payload: CapturePayload):
    try:
        raw = _decode_data_url(payload.image)
        face_count = _count_faces_in_image(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f'Face detection failed: {exc}') from exc

    return {
        'ok': True,
        'face_count': face_count,
        'has_face': face_count >= 1,
        'multiple_faces': face_count > 1,
    }


@app.post('/start')
def start(payload: StartPayload, request: Request):
    costume_id = payload.costume_id or payload.costumeId
    if payload.costume_id and payload.costumeId and payload.costume_id != payload.costumeId:
        raise HTTPException(status_code=400, detail='Conflicting costume_id and costumeId values')

    source_path = os.path.join(CAPTURE_DIR, payload.capture_filename)
    if not os.path.isfile(source_path):
        raise HTTPException(status_code=404, detail='Capture file not found')

    try:
        if costume_id:
            target_path = _select_target_video_by_costume(costume_id)
        else:
            target_path = _select_target_video(payload.target_filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if PROCESS_LOCK.locked():
        raise HTTPException(status_code=409, detail='Another job is running')

    _prune_output_files(max_files=3)

    job_id = uuid.uuid4().hex
    output_filename = f"{job_id}.mp4"
    output_path = os.path.join(OUTPUTS_DIR, output_filename)
    api_base_url = str(request.base_url).rstrip("/")

    with JOBS_LOCK:
        JOBS[job_id] = {
            'ok': True,
            'job_id': job_id,
            'status': 'queued',
            'progress': 0,
            'speed_fps': 0,
            'message': 'Queued',
            'stage': 'queued',
            'processed_frames': 0,
            'total_frames': 0,
            'preview_url': '',
            'output': output_path,
            'api_base_url': api_base_url,
        }

    thread = threading.Thread(
        target=_run_swap_job,
        args=(job_id, source_path, target_path, output_path, api_base_url),
        daemon=True,
    )
    thread.start()

    return {'ok': True, 'job_id': job_id}


@app.get('/job/{job_id}')
def job(job_id: str):
    with JOBS_LOCK:
        job_info = JOBS.get(job_id)
        if not job_info:
            raise HTTPException(status_code=404, detail='Job not found')
        return job_info


@app.get('/status/{job_id}')
def status(job_id: str):
    return job(job_id)


def _serve_preview(job_id: str):
    with JOBS_LOCK:
        job_info = JOBS.get(job_id)
    if not job_info:
        raise HTTPException(status_code=404, detail='job_id not found')
    if job_info.get('status') != 'done':
        raise HTTPException(status_code=400, detail='job not completed yet')

    path = job_info.get('output')
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail='output file missing')

    headers = {"Content-Disposition": f'inline; filename="{os.path.basename(path)}"'}
    return FileResponse(path, media_type='video/mp4', headers=headers)


@app.get('/preview/{job_id}')
def preview(job_id: str):
    return _serve_preview(job_id)


# @app.get('/preview/{job_id}.mp4')
# def preview_mp4(job_id: str):
#     return _serve_preview(job_id)


@app.get('/download/{job_id}')
def download(job_id: str):
    with JOBS_LOCK:
        job_info = JOBS.get(job_id)
    if not job_info:
        raise HTTPException(status_code=404, detail='job_id not found')
    if job_info.get('status') != 'done':
        raise HTTPException(status_code=400, detail='job not completed yet')

    path = job_info.get('output')
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail='output file missing')

    return FileResponse(
        path,
        media_type='video/mp4',
        filename=os.path.basename(path),
    )


@app.get('/costumes')
def list_costumes(includeThumbBase64: bool = False):
    items = _load_costumes()
    return {
        'ok': True,
        'items': [_serialize_costume(item, include_thumb_base64=includeThumbBase64) for item in items],
    }


@app.get('/costumes/{costume_id}')
def get_costume(costume_id: str, includeThumbBase64: bool = False):
    costumes = _load_costumes()
    _, item = _find_costume(costumes, costume_id)
    if not item: 
        raise HTTPException(status_code=404, detail='Costume not found')
    return {'ok': True, 'item': _serialize_costume(item, include_thumb_base64=includeThumbBase64)}


@app.post('/costumes')
def create_costume(
    name: str = Form(...),
    gender: str = Form(...),
    isActive: Optional[str] = Form('true'),
    video: UploadFile = File(...),
    thumbnail: UploadFile = File(...),
):
    raw_name = (name or '').strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail='name is required')
    try:
        normalized_gender = _normalize_gender(gender)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    video_ext = _safe_ext(video.filename or '', '.mp4')
    thumb_ext = _safe_ext(thumbnail.filename or '', '.png')

    if video_ext not in {'.mp4', '.mov', '.mkv', '.webm'}:
        raise HTTPException(status_code=400, detail='video extension is not allowed')
    if thumb_ext not in {'.png', '.jpg', '.jpeg', '.webp'}:
        raise HTTPException(status_code=400, detail='thumbnail extension is not allowed')

    costumes = _load_costumes()
    base_slug = _slugify(raw_name)
    costume_id = base_slug
    suffix = 2
    existing_ids = {item.get('id') for item in costumes}
    while costume_id in existing_ids:
        costume_id = f'{base_slug}-{suffix}'
        suffix += 1

    costume_dir = os.path.join(ASSETS_COSTUMES_DIR, costume_id)
    os.makedirs(costume_dir, exist_ok=True)

    video_name = f'video{video_ext}'
    thumb_name = f'thumb{thumb_ext}'
    video_path = os.path.join(costume_dir, video_name)
    thumb_path = os.path.join(costume_dir, thumb_name)
    _save_upload_file(video, video_path)
    _save_upload_file(thumbnail, thumb_path)

    now = _now_iso()
    item = {
        'id': costume_id,
        'name': raw_name,
        'gender': normalized_gender,
        'videoPath': f'assets/costumes/{costume_id}/{video_name}',
        'thumbPath': f'assets/costumes/{costume_id}/{thumb_name}',
        'isActive': _bool_from_form(isActive, default=True),
        'createdAt': now,
        'updatedAt': now,
    }
    try:
        _enforce_costume_media_files(item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    costumes.append(item)
    _save_costumes(costumes)
    return {'ok': True, 'item': item}


@app.put('/costumes/{costume_id}')
def update_costume(
    costume_id: str,
    id: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    isActive: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    thumbnail: Optional[UploadFile] = File(None),
):
    costumes = _load_costumes()
    index, item = _find_costume(costumes, costume_id)
    if index < 0:
        raise HTTPException(status_code=404, detail='Costume not found')

    pending_name: Optional[str] = None
    if name is not None:
        pending_name = name.strip()
        if not pending_name:
            raise HTTPException(status_code=400, detail='name cannot be empty')

    active_costume_id = costume_id
    desired_raw_id: Optional[str] = None
    if id is not None:
        desired_raw_id = id.strip()
        if not desired_raw_id:
            raise HTTPException(status_code=400, detail='id cannot be empty')
    elif pending_name is not None:
        # Keep folder/id aligned with displayed costume name when id is not explicitly provided.
        desired_raw_id = pending_name

    if desired_raw_id is not None:
        new_costume_id = _slugify(desired_raw_id)
        if new_costume_id != costume_id:
            existing_ids = {c.get('id') for i, c in enumerate(costumes) if i != index}
            if new_costume_id in existing_ids:
                raise HTTPException(status_code=409, detail='Costume id already exists')

            old_dir = os.path.join(ASSETS_COSTUMES_DIR, costume_id)
            new_dir = os.path.join(ASSETS_COSTUMES_DIR, new_costume_id)
            if os.path.isdir(new_dir):
                raise HTTPException(status_code=409, detail='Target costume folder already exists')

            try:
                if os.path.isdir(old_dir):
                    os.rename(old_dir, new_dir)
                else:
                    os.makedirs(new_dir, exist_ok=True)
            except OSError as exc:
                raise HTTPException(status_code=500, detail='Failed to rename costume folder') from exc

            video_name = os.path.basename(str(item.get('videoPath') or '').strip()) or 'video.mp4'
            thumb_name = os.path.basename(str(item.get('thumbPath') or '').strip()) or 'thumb.png'
            item['id'] = new_costume_id
            item['videoPath'] = f'assets/costumes/{new_costume_id}/{video_name}'
            item['thumbPath'] = f'assets/costumes/{new_costume_id}/{thumb_name}'
            active_costume_id = new_costume_id

    costume_dir = os.path.join(ASSETS_COSTUMES_DIR, active_costume_id)
    os.makedirs(costume_dir, exist_ok=True)

    if pending_name is not None:
        item['name'] = pending_name

    if gender is not None:
        try:
            item['gender'] = _normalize_gender(gender)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if isActive is not None:
        item['isActive'] = _bool_from_form(isActive)

    if video is not None:
        video_ext = _safe_ext(video.filename or '', '.mp4')
        if video_ext not in {'.mp4', '.mov', '.mkv', '.webm'}:
            raise HTTPException(status_code=400, detail='video extension is not allowed')
        old_video_path = item.get('videoPath', '')
        if old_video_path:
            old_abs = os.path.join(BASE_DIR, old_video_path.replace('/', os.sep))
            if os.path.isfile(old_abs):
                os.remove(old_abs)
        video_name = f'video{video_ext}'
        video_path = os.path.join(costume_dir, video_name)
        _save_upload_file(video, video_path)
        item['videoPath'] = f'assets/costumes/{active_costume_id}/{video_name}'

    if thumbnail is not None:
        thumb_ext = _safe_ext(thumbnail.filename or '', '.png')
        if thumb_ext not in {'.png', '.jpg', '.jpeg', '.webp'}:
            raise HTTPException(status_code=400, detail='thumbnail extension is not allowed')
        old_thumb_path = item.get('thumbPath', '')
        if old_thumb_path:
            old_abs = os.path.join(BASE_DIR, old_thumb_path.replace('/', os.sep))
            if os.path.isfile(old_abs):
                os.remove(old_abs)
        thumb_name = f'thumb{thumb_ext}'
        thumb_path = os.path.join(costume_dir, thumb_name)
        _save_upload_file(thumbnail, thumb_path)
        item['thumbPath'] = f'assets/costumes/{active_costume_id}/{thumb_name}'

    try:
        _enforce_costume_media_files(item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    item['updatedAt'] = _now_iso()
    costumes[index] = item
    _save_costumes(costumes)
    return {'ok': True, 'item': item}


@app.delete('/costumes/{costume_id}')
def delete_costume(costume_id: str):
    costumes = _load_costumes()
    index, item = _find_costume(costumes, costume_id)
    if index < 0:
        raise HTTPException(status_code=404, detail='Costume not found')

    costume_dir = os.path.join(ASSETS_COSTUMES_DIR, costume_id)
    if os.path.isdir(costume_dir):
        shutil.rmtree(costume_dir, ignore_errors=True)

    costumes.pop(index)
    _save_costumes(costumes)
    return {'ok': True, 'deleted_id': item.get('id')}
