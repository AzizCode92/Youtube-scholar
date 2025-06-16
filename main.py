# main.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import uuid
import time
import video_processor 

app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost:3000",
    "localhost:3000"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# --- In-memory "database" for tasks ---
tasks = {}

def process_video_analysis(task_id: str, youtube_url: str):
    print(f"Starting task {task_id} for URL: {youtube_url}")
    tasks[task_id] = {"status": "processing", "stage": "downloading", "result": None}

    audio_path, video_path = video_processor.download_media(youtube_url, task_id)
    if not audio_path or not video_path:
        tasks[task_id] = {"status": "failed", "stage": "download", "result": "Failed to download media."}
        return

    tasks[task_id]["stage"] = "transcribing"
    transcript, full_text = video_processor.transcribe_audio(audio_path)
    if not transcript:
        tasks[task_id] = {"status": "failed", "stage": "transcription", "result": "Failed to transcribe audio."}
        return

    tasks[task_id]["stage"] = "analyzing_text"
    summary, chapters, qa = video_processor.get_llm_analysis(full_text)

    tasks[task_id]["stage"] = "analyzing_visuals"
    visuals = video_processor.extract_visuals(video_path)
    
    import shutil
    shutil.rmtree(f"temp/{task_id}")

    tasks[task_id]["status"] = "completed"
    tasks[task_id]["result"] = {
        "summary": summary,
        "transcript": transcript,
        "chapters": chapters,
        "visuals": visuals,
        "qa": qa,
        "full_text": full_text 
    }
    print(f"Task {task_id} completed.")
    
@app.post("/analyze")
def analyze_video(youtube_url: str, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(process_video_analysis, task_id, youtube_url)
    return {"status": "accepted", "task_id": task_id}

@app.get("/status/{task_id}")
def get_status(task_id: str):
    return tasks.get(task_id, {"status": "not_found"})

# --- ENDPOINT FOR GEMINI ANALYSIS ---

class DeeperAnalysisRequest(BaseModel):
    text: str

@app.post("/deeper-analysis")
def deeper_analysis(request: DeeperAnalysisRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="No text provided for analysis.")
    
    analysis_result = video_processor.get_gemini_deeper_analysis(request.text)
    return analysis_result

# --- ENDPOINT FOR INTERACTIVE Q&A (CHAT) ---

class AskRequest(BaseModel):
    task_id: str
    question: str
    history: Optional[List[Dict[str, str]]] = Field(default_factory=list)

@app.post("/ask")
def ask_question(request: AskRequest):
    print(f"Received /ask request: {request.question}")
    task = tasks.get(request.task_id)
    if not task or not task.get("result") or not task["result"].get("full_text"):
        raise HTTPException(status_code=404, detail="Task or transcript not found.")
    
    full_text = task["result"]["full_text"]
    answer = video_processor.get_llm_answer(full_text, request.question, request.history)
    
    return {"answer": answer}


# --- NEW ENDPOINT FOR FLASHCARD GENERATION ---

class FlashcardRequest(BaseModel):
    task_id: str

@app.post("/generate-flashcards")
def create_flashcards(request: FlashcardRequest):
    print(f"Received /generate-flashcards request for task: {request.task_id}")
    task = tasks.get(request.task_id)
    if not task or not task.get("result") or not task["result"].get("full_text"):
        raise HTTPException(status_code=404, detail="Analyzed transcript not found.")
    
    full_text = task["result"]["full_text"]
    flashcards = video_processor.generate_flashcards(full_text)

    if flashcards is None:
        raise HTTPException(status_code=500, detail="Failed to generate flashcards from LLM.")

    return {"flashcards": flashcards}