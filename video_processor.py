import yt_dlp
import os
import whisper
import requests
import json
import cv2
from typing import List, Dict

from fastapi import HTTPException


def download_media(youtube_url: str, task_id: str):
    """Downloads audio and video, returning their file paths."""
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
            info = ydl.extract_info(youtube_url, download=True)
            audio_path = f'{output_path}/audio.mp3'
        with yt_dlp.YoutubeDL(ydl_video_opts) as ydl:
            ydl.download([youtube_url])
            video_path = f'{output_path}/video.mp4'
        return audio_path, video_path
    except Exception as e:
        print(f"Error downloading media: {e}")
        return None, None



def transcribe_audio(audio_path: str):
    """Transcribes audio using Whisper and returns a timestamped transcript."""
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
    


def get_llm_analysis(full_text: str):
    """
    Queries the local Ollama server to generate a summary, chapters, and Q&A.
    """
    OLLAMA_API_URL = "http://localhost:11434/api/generate"
    MODEL_NAME = "llama3"

    def query_ollama(prompt):
        try:
            response = requests.post(OLLAMA_API_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                 "format": "json"
            }, timeout=300)
            response.raise_for_status()
            return json.loads(response.json()['response'])
        except requests.exceptions.RequestException as e:
            print(f"Error querying Ollama: {e}")
            return None
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from Ollama: {e}")
            print(f"Received: {response.text}")
            return None


    summary_prompt = f"""
    Based on the following transcript, provide a concise, high-level summary of about 3-4 sentences.
    Return ONLY a JSON object with a single key "summary" containing the text.
    Transcript:
    ---
    {full_text[:4000]}
    """
    summary_json = query_ollama(summary_prompt)
    summary = summary_json.get('summary', 'Could not generate summary.') if summary_json else 'Failed to connect to Ollama.'


    chapters_prompt = f"""
    Based on the following transcript, identify the main topics and provide a table of contents.
    Return ONLY a JSON object with a single key "chapters", which is an array of objects, each with "timestamp" (string) and "topic" (string) keys.
    Find the timestamp from the beginning of the relevant section in the transcript.
    Transcript:
    ---
    {full_text}
    """
    chapters_json = query_ollama(chapters_prompt)
    chapters = chapters_json.get('chapters', []) if chapters_json else []


    qa_prompt = f"""
    Based on the following transcript, generate 3-4 insightful questions and their answers.
    Return ONLY a JSON object with a single key "qa", which is an array of objects, each with "question" (string) and "answer" (string) keys.
    Transcript:
    ---
    {full_text[:4000]}
    """
    qa_json = query_ollama(qa_prompt)
    qa = qa_json.get('qa', []) if qa_json else []

    return summary, chapters, qa


def get_gemini_deeper_analysis(text_to_analyze: str):
    """
    Queries the Gemini API for a deeper analysis of the provided text.
    """
    API_KEY = "" 
    API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={API_KEY}"

    prompt = f"""
    You are a research assistant. Analyze the following text from a video transcript.
    Provide a detailed analysis in a structured JSON format.

    The JSON object should have the following keys:
    - "key_concepts": An array of strings, where each string is a key concept or technical term mentioned.
    - "eli5": A string that explains the main topic of the text in a very simple, "Explain Like I'm 5" manner.
    - "follow_up_questions": An array of strings, where each string is a thought-provoking question a student might ask after learning this material.

    Here is the text to analyze:
    ---
    {text_to_analyze}
    ---

    Respond with ONLY the JSON object.
    """

    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}]
        }]
    }

    try:
        response = requests.post(API_URL, json=payload, headers={'Content-Type': 'application/json'}, timeout=120)
        response.raise_for_status()
        
        result_json = response.json()
        
        if 'candidates' in result_json and result_json['candidates']:
            content = result_json['candidates'][0]['content']['parts'][0]['text']
            cleaned_content = content.strip().replace("```json", "").replace("```", "")
            return json.loads(cleaned_content)
        else:
            raise HTTPException(status_code=500, detail="Invalid response from Gemini API")

    except requests.exceptions.RequestException as e:
        print(f"Error calling Gemini API: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Gemini API: {e}")
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from Gemini: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse Gemini API response.")


def get_llm_answer(full_text: str, user_question: str, history: List[Dict[str, str]] = []):
    """
    Queries the local Ollama server to answer a custom user question,
    considering the conversation history for context.
    """
    OLLAMA_API_URL = "http://localhost:11434/api/generate"
    MODEL_NAME = "llama3"

    history_prompt = ""
    for message in history:
        if message.get('sender') == 'user':
            history_prompt += f"The user previously asked: {message.get('text')}\n"
        elif message.get('sender') == 'ai':
            history_prompt += f"You previously answered: {message.get('text')}\n"

    prompt = f"""
    You are an expert assistant. Your knowledge is based *only* on the provided video transcript.
    Given the transcript and the recent conversation history, provide a clear and concise answer to the user's current question.
    If the answer cannot be found in the transcript, say "I cannot answer that based on the video content."

    --- VIDEO TRANSCRIPT ---
    {full_text[:8000]} 
    ---

    --- CONVERSATION HISTORY ---
    {history_prompt if history_prompt else "No previous conversation."}
    ---

    CURRENT QUESTION: {user_question}
    """
    try:
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False
        }, timeout=120)
        response.raise_for_status()
        return response.json().get('response', 'No answer was generated.')
    except Exception as e:
        print(f"Error in get_llm_answer: {e}")
        return "Failed to get an answer from the language model."


def extract_visuals(video_path: str):
    """Extracts a frame every 30 seconds and returns their timestamps."""
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