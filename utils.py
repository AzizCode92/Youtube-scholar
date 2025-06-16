import os
import json
import requests
import yt_dlp
import whisper
import cv2
from typing import List, Dict
from pydantic import BaseModel, Field, ValidationError
from fastapi import HTTPException

# --- Pydantic Models ---
class Flashcard(BaseModel):
    front: str = Field(..., min_length=1)
    back: str = Field(..., min_length=1)

class FlashcardList(BaseModel):
    flashcards: List[Flashcard]

class SummaryModel(BaseModel):
    summary: str = Field(..., min_length=1)

class Chapter(BaseModel):
    timestamp: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)

class ChaptersModel(BaseModel):
    chapters: List[Chapter]

class QAItem(BaseModel):
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)

class QAListModel(BaseModel):
    qa: List[QAItem]

# --- Utility Functions ---
def download_media(youtube_url: str, task_id: str):
    output_path = f"temp/{task_id}"
    os.makedirs(output_path, exist_ok=True)
    ydl_audio_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'{output_path}/audio.%(ext)s',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
    }
    ydl_video_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': f'{output_path}/video.%(ext)s',
    }
    try:
        with yt_dlp.YoutubeDL(ydl_audio_opts) as ydl:
            ydl.extract_info(youtube_url, download=True)
            audio_path = f'{output_path}/audio.mp3'
        with yt_dlp.YoutubeDL(ydl_video_opts) as ydl:
            ydl.download([youtube_url])
            video_path = f'{output_path}/video.mp4'
        return audio_path, video_path
    except Exception as e:
        print(f"Error downloading media: {e}")
        return None, None

def transcribe_audio(audio_path: str):
    try:
        model = whisper.load_model("base")
        result = model.transcribe(audio_path)
        transcript = []
        for segment in result["segments"]:
            start_time = int(segment['start'])
            minutes = start_time // 60
            seconds = start_time % 60
            timestamp = f"{minutes:02d}:{seconds:02d}"
            text = segment['text'].strip()
            transcript.append({"timestamp": timestamp, "text": text})
        return transcript, result["text"]
    except Exception as e:
        print(f"Error during transcription: {e}")
        return None, None

def extract_visuals(video_path: str):
    visuals = []
    try:
        vidcap = cv2.VideoCapture(video_path)
        fps = vidcap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps * 30)
        frame_count = 0
        while True:
            success, image = vidcap.read()
            if not success:
                break
            if frame_count % frame_interval == 0:
                current_sec = int(frame_count / fps)
                minutes = current_sec // 60
                seconds = current_sec % 60
                timestamp = f"{minutes:02d}:{seconds:02d}"
                visuals.append({
                    "timestamp": timestamp,
                    "description": f"Visual content at {timestamp}"
                })
            frame_count += 1
    except Exception as e:
        print(f"Error extracting visuals: {e}")
    return visuals
